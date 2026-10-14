"use server";

import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import MDBReader from "mdb-reader";
import { AccessError, getTableAsync, type AccessDb } from "@/lib/access-reader";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { parseYm, round2 } from "@/lib/report-format";

/** Customer codes are compared upper case and without leading zeros ("008" -> "8", "000" -> "0"). */
function customerCodeKey(code: string): string {
  return code.trim().toUpperCase().replace(/^0+(?=.)/, "");
}

/** The local MS Access database. Set ACCESS_JOB_ORDERS_PATH in .env.local to use another location. */
const DEFAULT_PATH = "C:\\Users\\User\\Documents\\link_job_orders";

export type JobOrderOut = {
  linkId: number;
  jobTicket: string;
  customerName: string;
  unitPrice: number;
  totalWeight: number;
  totalRolls: number;
};

export type JobOrderChange = {
  linkId: number;
  jobTicket: string;
  customerName: string;
  /** what differs from the record that was replaced; empty when the new copy has the same values */
  changes: { label: string; before: string; after: string }[];
};

export type PopulateResult = {
  path: string;
  /** the month that was populated, e.g. "October 2026" */
  label: string;
  /** job tickets found in tblFabricDel for that month with copied = false */
  tickets: number;
  /** delivery records of that month that were already marked copied in Access */
  alreadyCopied: number;
  newRecords: JobOrderOut[];
  /** job orders that already existed in the app and were replaced by the new copy */
  changedRecords: JobOrderChange[];
  skipped: { jobTicket: string; reason: string }[];
  /** job tickets marked copied = true in Access */
  marked: number;
  /** set when the records were copied but Access could not be updated */
  markError: string | null;
  /** older job orders that got their CusJONo filled in */
  cusJoBackfilled: number;
  deliveries: {
    added: DeliveryOut[];
    /** job tickets whose delivery was already in the app and was left as it is */
    alreadyInApp: number;
    skipped: { jobTicket: string; reason: string }[];
    warnings: string[];
  };
};

export type DeliveryOut = {
  jobTicket: string;
  customerName: string;
  deliveryReceipt: number;
  receivableTypeId: number;
  dateDelivery: string;
  totalWeight: number;
  totalRolls: number;
};

type Row = Record<string, unknown>;
const PAGE = 1000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]/g, "");
const text = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};


/** A table of the Access file (a linked table is read through Access). */
const getTable = (db: AccessDb, candidates: string[]) => getTableAsync(db, candidates);
const getRows = async (db: AccessDb, candidates: string[]) => (await getTableAsync(db, candidates)).rows;

/** The first of several possible field names that the row has. */
function fieldAny(row: Row, names: string[]): unknown {
  for (const n of names) {
    const v = field(row, n);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** A date from Access as yyyy-mm-dd (Access stores no time zone; the library hands it over as UTC). */
function isoDate(v: unknown): string | null {
  const d = v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** numAlias as a whole number (0 is allowed), or null when the field is empty or not a whole number. */
const toAliasNo = (v: unknown): number | null => {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const n = num(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** An Access id field as a positive whole number, or null when it is empty / 0. */
const toId = (v: unknown): number | null => {
  const n = num(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const isTrue = (v: unknown) => v === true || v === 1 || v === -1 || String(v).toLowerCase() === "true";

const run = promisify(execFile);

// Runs the UPDATE statements (one per line of the file) inside one transaction through the Access database engine.
const MARK_SCRIPT = `param([string]$Db,[string]$SqlFile,[string]$Provider)
$ErrorActionPreference = 'Stop'
$sql = @(Get-Content -Encoding UTF8 $SqlFile | Where-Object { $_.Trim() -ne '' })
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=$Provider;Data Source=$Db;")
$conn.Open()
try {
  $tx = $conn.BeginTransaction()
  foreach ($q in $sql) {
    $cmd = $conn.CreateCommand()
    $cmd.Transaction = $tx
    $cmd.CommandText = $q
    [void]$cmd.ExecuteNonQuery()
  }
  $tx.Commit()
} finally { $conn.Close() }
Write-Output "OK"
`;

// Same statements, run by Access itself (for PCs where the database engine is not registered).
const MARK_COM_SCRIPT = `param([string]$Db,[string]$SqlFile)
$ErrorActionPreference = 'Stop'
$sql = @(Get-Content -Encoding UTF8 $SqlFile | Where-Object { $_.Trim() -ne '' })
$app = New-Object -ComObject Access.Application
try {
  $app.OpenCurrentDatabase($Db, $false)
  $dao = $app.CurrentDb()
  foreach ($q in $sql) { $dao.Execute($q, 128) }
  $app.CloseCurrentDatabase()
} finally { $app.Quit() }
Write-Output "OK"
`;

const firstLine = (e: any) => String(e?.stderr || e?.message || e).trim().split("\n")[0];

/** UPDATE statements that set copied = True on the tblFabricDel rows of these job tickets in the period. */
function buildMarkStatements(cols: { table: string; ticket: string; date: string; copied: string }, tickets: string[], start: string, end: string): string[] {
  const us = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `#${m}/${d}/${y}#`;
  };
  const lit = (t: string) => `'${t.replace(/[\r\n]/g, " ").replace(/'/g, "''")}'`;
  const out: string[] = [];
  for (let i = 0; i < tickets.length; i += 50) {
    const list = tickets.slice(i, i + 50).map(lit).join(",");
    out.push(
      `UPDATE [${cols.table}] SET [${cols.copied}] = True WHERE [${cols.ticket}] IN (${list}) AND [${cols.date}] >= ${us(start)} AND [${cols.date}] < ${us(end)}`
    );
  }
  return out;
}

/**
 * Runs the statements in the Access file (Windows only).
 * First tries the Access database engine (OLE DB); when that is not registered on the PC, it asks Access itself
 * to do the update (COM automation), which works with any installed Access.
 */
async function runInAccess(path: string, statements: string[]): Promise<string | null> {
  if (statements.length === 0) return null;
  if (process.platform !== "win32") return "Marking records in Access only works when the app runs on Windows.";
  const stamp = `${Date.now()}`;
  const psFile = join(tmpdir(), `vitson-mark-${stamp}.ps1`);
  const comFile = join(tmpdir(), `vitson-markcom-${stamp}.ps1`);
  const sqlFile = join(tmpdir(), `vitson-sql-${stamp}.txt`);
  await writeFile(psFile, MARK_SCRIPT, "utf8");
  await writeFile(comFile, MARK_COM_SCRIPT, "utf8");
  await writeFile(sqlFile, statements.join("\n"), "utf8");

  const ps64 = "powershell.exe";
  const ps32 = join(process.env.SystemRoot ?? "C:\\Windows", "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe");
  const opts = { timeout: 180000, windowsHide: true };
  const base = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"];

  const oleDb: { ps: string; provider: string }[] = [
    { ps: ps64, provider: "Microsoft.ACE.OLEDB.16.0" },
    { ps: ps64, provider: "Microsoft.ACE.OLEDB.12.0" },
    { ps: ps32, provider: "Microsoft.ACE.OLEDB.16.0" },
    { ps: ps32, provider: "Microsoft.ACE.OLEDB.12.0" },
    ...(/\.mdb$/i.test(path) ? [{ ps: ps32, provider: "Microsoft.Jet.OLEDB.4.0" }] : []),
  ];

  try {
    let oleDbError = "";
    for (const a of oleDb) {
      try {
        await run(a.ps, [...base, psFile, path, sqlFile, a.provider], opts);
        return null;
      } catch (e: any) {
        oleDbError = firstLine(e);
        // a locked file is not fixed by another provider
        if (/locked|in use|exclusive|could not use/i.test(oleDbError)) return oleDbError;
      }
    }

    // the engine is not registered on this PC: let Access itself make the change
    let comError = "";
    for (const ps of [ps64, ps32]) {
      try {
        await run(ps, [...base, comFile, path, sqlFile], opts);
        return null;
      } catch (e: any) {
        comError = firstLine(e);
      }
    }
    return `${comError} (Access database engine: ${oleDbError})`;
  } finally {
    await unlink(psFile).catch(() => {});
    await unlink(comFile).catch(() => {});
    await unlink(sqlFile).catch(() => {});
  }
}

/** Reads a field regardless of upper/lower case. */
function field(row: Row, name: string): unknown {
  if (name in row) return row[name];
  const lower = name.toLowerCase();
  for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
  return undefined;
}

async function openAccess(): Promise<{ reader: MDBReader; path: string }> {
  const base = process.env.ACCESS_JOB_ORDERS_PATH || DEFAULT_PATH;
  const candidates = /\.(accdb|mdb)$/i.test(base) ? [base] : [`${base}.accdb`, `${base}.mdb`];
  for (const path of candidates) {
    let buffer: Buffer;
    try {
      buffer = await readFile(path);
    } catch {
      continue;
    }
    try {
      return { reader: new MDBReader(buffer), path };
    } catch (e: any) {
      throw new AccessError(`The Access file ${path} could not be read: ${e?.message ?? "unknown error"}`);
    }
  }
  throw new AccessError(`The Access file was not found. Looked for: ${candidates.join(" or ")}.`);
}

async function loadAll(table: string, columns: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** CusJONo is kept in tbl_job_order.cus_jo_no (add the column with: alter table tbl_job_order add column cus_jo_no text;). */
async function hasCusJoColumn(): Promise<boolean> {
  const { error } = await supabaseAdmin.from("tbl_job_order").select("cus_jo_no").limit(1);
  return !error;
}

export async function getJobOrderCount(): Promise<number> {
  await requireModule("job_orders");
  const { count } = await supabaseAdmin.from("tbl_job_order").select("id", { count: "exact", head: true });
  return count ?? 0;
}

/** Sum and count of Roll1 per jobticketno over the given Access tables. */
async function rollTotals(db: AccessDb, tables: string[][]): Promise<Map<string, { weight: number; rolls: number }>> {
  const totals = new Map<string, { weight: number; rolls: number }>();
  for (const names of tables) {
    for (const r of await getRows(db, names)) {
      const ticket = text(field(r, "jobticketno"));
      const roll = field(r, "Roll1");
      if (!ticket || roll == null || roll === "") continue;
      const t = totals.get(ticket) ?? { weight: 0, rolls: 0 };
      t.weight += num(roll);
      t.rolls += 1;
      totals.set(ticket, t);
    }
  }
  return totals;
}

/**
 * Copies one month of deliveries from Access: the tblFabricDel records with DateIssued in the month and copied = false.
 * For the job tickets of those records it fills both tbl_job_order and tbl_Deliveries, then sets copied = true
 * on those records in Access.
 *
 * Job order: job_ticket = jobticketno, UnitPrice, access_job_order_link_id = numID, access_sales_id = tblJobSales.numID
 * (by CusJONo), customer_id = the app customer whose customer_no equals the first 3 characters of the sales record's CustomerNo,
 * total_weight / total_rolls = sum / count of Roll1 over fabricbodyrec, fabric1x1rec, fabricC+Crec per jobticketno.
 * A job order that is already in the app is replaced by the new copy (it keeps its id so deliveries stay linked).
 *
 * Alias: only Big delivery receipts get one. For a Big receipt tblFabricDel numAlias is copied into the delivery's
 * alias_id (0 means no alias and leaves it empty). Small receipts (DR# with "-") always have an empty alias and numAlias
 * is ignored. tbl_Deliveries.alias_id has a foreign key to tbl_Alias(id), so a number that is not an id in tbl_Alias
 * cannot be stored: alias_id stays empty and it is reported in the warnings.
 *
 * Also copied: tblJobOrders numDyeType -> dye_process_id, numFabricType -> fabric_id, Shade -> color (Shade without its
 * left-most 3 characters) and tone_id (the app tone whose tone_code equals the left-most 3 characters of Shade).
 * An id that is not in the app's table is left empty and reported in the warnings.
 *
 * Delivery: delivery_receipt = DR# before the first "-" as a whole number, receivable_type_id = 2 when DR# contains "-"
 * otherwise 1, date_delivery = DateIssued, delivered_body_wt / count_body, delivered_1x1_wt / count_1x1 and
 * delivered_cc_wt / count_cc = sum / count of Roll1 over fabricbodydel, fabric1x1del and fabricC+Cdel per jobticketno, alias_id = tblFabricDel numAlias (Big only), invoice_id = 0. A job order that already has a delivery
 * in the app is left as it is.
 */
export async function populateJobOrders(ym: string): Promise<{ error?: string; result?: PopulateResult }> {
  await requireModule("job_orders");
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year to populate." };

  try {
    const db = await openAccess();
    const path = db.path;

    // ---- Access: the delivery records to copy
    const del = await getTable(db, ["tblFabricDel"]);
    const delKeys = del.rows.length > 0 ? Object.keys(del.rows[0]) : [];
    const keyOf = (n: string) => delKeys.find((k) => k.toLowerCase() === n.toLowerCase());
    const ticketKey = keyOf("jobticketno");
    const dateKey = keyOf("DateIssued");
    const copiedKey = keyOf("copied");
    const drKey = keyOf("DR#");
    const aliasKey = keyOf("numAlias");
    if (del.rows.length > 0 && (!ticketKey || !dateKey || !copiedKey || !drKey)) {
      throw new AccessError(
        `The table ${del.name} needs the fields jobticketno, DR#, DateIssued and copied. Fields found: ${delKeys.join(", ")}.`
      );
    }

    let alreadyCopied = 0;
    const picked = new Map<string, { dr: string; date: string; drs: Set<string>; alias: number | null }>(); // one entry per job ticket
    for (const r of del.rows) {
      const date = isoDate(r[dateKey!]);
      if (!date || date < range.start || date >= range.end) continue;
      if (isTrue(r[copiedKey!])) {
        alreadyCopied++;
        continue;
      }
      const ticket = text(r[ticketKey!]);
      if (!ticket) continue;
      const dr = text(r[drKey!]);
      const alias = aliasKey ? toAliasNo(r[aliasKey]) : null;
      const cur = picked.get(ticket);
      if (!cur) {
        picked.set(ticket, { dr, date, drs: new Set(dr ? [dr] : []), alias });
      } else {
        if (dr) cur.drs.add(dr);
        if (date >= cur.date) {
          cur.dr = dr;
          cur.date = date;
          cur.alias = alias ?? cur.alias; // the latest delivery record decides
        } else if (cur.alias == null) {
          cur.alias = alias;
        }
      }
    }

    // ---- Access: lookups for the job orders
    const sales = new Map<string, { id: number; customerNo: string }>(); // CusJONo -> sales record
    for (const r of await getRows(db, ["tblJobSales", "sales_confirmation", "sales_confirmations"])) {
      const key = text(field(r, "cusjono"));
      if (key && !sales.has(key)) sales.set(key, { id: num(fieldAny(r, ["numID", "id"])), customerNo: text(fieldAny(r, ["CustomerNo", "customer_no"])) });
    }
    const recTotals = await rollTotals(db, [["fabricbodyrec"], ["fabric1x1rec"], ["fabricC+Crec"]]);
    // the delivered weight and rolls are kept apart per delivery table: Body, 1x1 and C+C
    const bodyTotals = await rollTotals(db, [["fabricbodydel", "tblFabricBodyDel"]]);
    const x1Totals = await rollTotals(db, [["fabric1x1del", "tblFabric1x1Del"]]);
    const ccTotals = await rollTotals(db, [["fabricC+Cdel", "tblFabricC+CDel"]]);
    const noRolls = { weight: 0, rolls: 0 };
    const jobByTicket = new Map<string, Row>();
    const cusJoByLink = new Map<number, string>(); // Access job order id -> CusJONo
    const jobFields = new Set<string>(); // lower-case field names of tblJobOrders
    for (const r of await getRows(db, ["tblJobOrders", "tblJobOrder", "job_orders", "job_order"])) {
      if (jobFields.size === 0) for (const k of Object.keys(r)) jobFields.add(k.toLowerCase());
      const t = text(field(r, "jobticketno"));
      if (t && !jobByTicket.has(t)) jobByTicket.set(t, r);
      const id = num(fieldAny(r, ["numID", "id"]));
      if (id) cusJoByLink.set(id, text(field(r, "CusJONo")));
    }

    // ---- app side
    const appCustomers = new Map<number, string>(); // id -> name
    const appByNo = new Map<string, number>(); // customer_no (upper case, leading zeros removed) -> id
    for (const c of await loadAll("tbl_Customer", "id, customer_name, customer_no")) {
      appCustomers.set(c.id, c.customer_name);
      const no = customerCodeKey(text(c.customer_no));
      if (no && !appByNo.has(no)) appByNo.set(no, c.id);
    }
    // reference tables for the new fields: an Access id that the app does not have is left empty and reported
    const idSet = async (table: string) => new Set<number>((await loadAll(table, "id")).map((r: any) => r.id as number));
    const appDyes = await idSet("tbl_dye_process_type");
    const appFabrics = await idSet("tbl_Fabric");
    const appAliasIds = await idSet("tbl_Alias");
    const aliasNotes = new Map<string, Set<string>>(); // problem -> job tickets
    const noteAlias = (problem: string, ticket: string) => {
      if (!aliasNotes.has(problem)) aliasNotes.set(problem, new Set());
      aliasNotes.get(problem)!.add(ticket);
    };
    const toneByCode = new Map<string, number>(); // tone_code (upper case) -> id
    for (const t of await loadAll("tbl_tone", "id, tone_code")) {
      const code = text(t.tone_code).toUpperCase();
      if (code && !toneByCode.has(code)) toneByCode.set(code, t.id);
    }
    const warnings: string[] = [];
    // one warning per kind of missing value, listing the tickets it affects
    const missing = new Map<string, Set<string>>();
    const noteMissing = (what: string, value: string | number, ticket: string) => {
      const key = `${what} ${value}`;
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key)!.add(ticket);
    };
    for (const [name, label] of [["numdyetype", "numDyeType"], ["numfabrictype", "numFabricType"], ["shade", "Shade"]] as const) {
      if (jobFields.size > 0 && !jobFields.has(name)) warnings.push(`The Access job order table has no ${label} field; it was not copied.`);
    }
    if (picked.size > 0 && !aliasKey) warnings.push("tblFabricDel has no numAlias field; the alias was not copied.");

    const existing = new Map<number, any>();
    const hasCusJo = await hasCusJoColumn();
    for (const j of await loadAll("tbl_job_order", "id, job_ticket, total_weight, total_rolls, unit_price, access_sales_id, access_job_order_link_id, customer_id, dye_process_id, fabric_id, color, tone_id" + (hasCusJo ? ", cus_jo_no" : ""))) {
      existing.set(j.access_job_order_link_id, j);
    }

    // ---- job orders of the picked tickets
    const newRows: any[] = [];
    const newOut: JobOrderOut[] = [];
    const replaceRows: any[] = [];
    const replaceOut: JobOrderChange[] = [];
    const skipped: PopulateResult["skipped"] = [];
    const built: { ticket: string; linkId: number; customerName: string }[] = [];
    const m2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    for (const ticket of picked.keys()) {
      const jr = jobByTicket.get(ticket);
      if (!jr) {
        skipped.push({ jobTicket: ticket, reason: "Job ticket is not in the Access job order table." });
        continue;
      }
      const linkId = num(fieldAny(jr, ["numID", "id"]));
      const cusJoNo = text(field(jr, "CusJONo"));
      const sc = sales.get(cusJoNo);
      if (!sc) {
        skipped.push({ jobTicket: ticket, reason: `No sales record found for CusJONo "${cusJoNo}".` });
        continue;
      }
      // the first 3 characters of the sales record's CustomerNo are the app customer's customer_no;
      // leading zeros are dropped on both sides before comparing ("008" = "8", "073-06" -> "073" = "73")
      const customerCode = customerCodeKey(sc.customerNo.slice(0, 3));
      const customerId = appByNo.get(customerCode);
      if (customerId == null) {
        skipped.push({
          jobTicket: ticket,
          reason: `Customer code "${sc.customerNo.slice(0, 3)}" (from CustomerNo "${sc.customerNo}") is not in the app's customers.`,
        });
        continue;
      }
      const customer = { id: customerId, name: appCustomers.get(customerId) ?? "" };
      const t = recTotals.get(ticket) ?? { weight: 0, rolls: 0 };

      // dye process, fabric, color and tone
      const dyeAccess = toId(fieldAny(jr, ["numDyeType"]));
      const dyeId = dyeAccess != null && appDyes.has(dyeAccess) ? dyeAccess : null;
      if (dyeAccess != null && dyeId == null) noteMissing("Dye process id", dyeAccess, ticket);
      const fabricAccess = toId(fieldAny(jr, ["numFabricType"]));
      const fabricId = fabricAccess != null && appFabrics.has(fabricAccess) ? fabricAccess : null;
      if (fabricAccess != null && fabricId == null) noteMissing("Fabric id", fabricAccess, ticket);
      const shade = text(fieldAny(jr, ["Shade"]));
      const toneCode = shade.slice(0, 3); // left-most 3 characters = the tone code
      const color = shade.slice(3).trim() || null; // the rest of Shade
      const toneId = shade ? toneByCode.get(toneCode.toUpperCase()) ?? null : null;
      if (shade && toneId == null) noteMissing("Tone code", `"${toneCode}"`, ticket);

      const next = {
        job_ticket: ticket,
        unit_price: round2(num(fieldAny(jr, ["UnitPrice", "unit_price"]))),
        access_sales_id: sc.id,
        access_job_order_link_id: linkId,
        customer_id: customer.id,
        total_weight: round2(t.weight),
        total_rolls: t.rolls,
        dye_process_id: dyeId,
        fabric_id: fabricId,
        color,
        tone_id: toneId,
        ...(hasCusJo ? { cus_jo_no: cusJoNo } : {}),
      };
      built.push({ ticket, linkId, customerName: customer.name });

      const old = existing.get(linkId);
      if (!old) {
        newRows.push(next);
        newOut.push({ linkId, jobTicket: ticket, customerName: customer.name, unitPrice: next.unit_price, totalWeight: next.total_weight, totalRolls: next.total_rolls });
        continue;
      }
      const changes: JobOrderChange["changes"] = [];
      if (old.job_ticket !== next.job_ticket) changes.push({ label: "Job ticket", before: old.job_ticket, after: next.job_ticket });
      if (Math.abs(old.unit_price - next.unit_price) >= 0.005) changes.push({ label: "Unit price", before: m2(old.unit_price), after: m2(next.unit_price) });
      if (Math.abs(old.total_weight - next.total_weight) >= 0.005) changes.push({ label: "Total weight", before: m2(old.total_weight), after: m2(next.total_weight) });
      if (old.total_rolls !== next.total_rolls) changes.push({ label: "Total rolls", before: String(old.total_rolls), after: String(next.total_rolls) });
      if (old.customer_id !== next.customer_id) {
        changes.push({ label: "Customer", before: appCustomers.get(old.customer_id) ?? String(old.customer_id), after: customer.name });
      }
      if (old.access_sales_id !== next.access_sales_id) changes.push({ label: "Sales record", before: String(old.access_sales_id), after: String(next.access_sales_id) });
      if (hasCusJo && (old.cus_jo_no ?? "") !== cusJoNo) changes.push({ label: "CusJONo", before: old.cus_jo_no ?? "", after: cusJoNo });
      const sameId = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
      const idLabel = (id: number | null | undefined) => (id == null ? "" : String(id));
      if (!sameId(old.dye_process_id, next.dye_process_id)) changes.push({ label: "Dye process", before: idLabel(old.dye_process_id), after: idLabel(next.dye_process_id) });
      if (!sameId(old.fabric_id, next.fabric_id)) changes.push({ label: "Fabric", before: idLabel(old.fabric_id), after: idLabel(next.fabric_id) });
      if (!sameId(old.tone_id, next.tone_id)) changes.push({ label: "Tone", before: idLabel(old.tone_id), after: idLabel(next.tone_id) });
      if ((old.color ?? "") !== (next.color ?? "")) changes.push({ label: "Color", before: old.color ?? "", after: next.color ?? "" });
      replaceRows.push({ id: old.id, ...next });
      replaceOut.push({ linkId, jobTicket: ticket, customerName: customer.name, changes });
    }

    // older job orders that have no CusJONo yet get it from Access
    let cusJoBackfilled = 0;
    if (hasCusJo) {
      const replacedIds = new Set<number>(replaceRows.map((r) => r.id as number));
      const fill: any[] = [];
      for (const old of existing.values()) {
        if (replacedIds.has(old.id) || (old.cus_jo_no ?? "") !== "") continue;
        const cus = cusJoByLink.get(old.access_job_order_link_id);
        if (!cus) continue;
        fill.push({
          id: old.id,
          job_ticket: old.job_ticket,
          total_weight: old.total_weight,
          total_rolls: old.total_rolls,
          unit_price: old.unit_price,
          access_sales_id: old.access_sales_id,
          access_job_order_link_id: old.access_job_order_link_id,
          customer_id: old.customer_id,
          cus_jo_no: cus,
        });
      }
      for (let i = 0; i < fill.length; i += 500) {
        const { error } = await supabaseAdmin.from("tbl_job_order").upsert(fill.slice(i, i + 500), { onConflict: "id" });
        if (error) return { error: `Could not fill in the CusJONo of older job orders: ${error.message}` };
      }
      cusJoBackfilled = fill.length;
    }

    for (let i = 0; i < newRows.length; i += 500) {
      const { error } = await supabaseAdmin.from("tbl_job_order").insert(newRows.slice(i, i + 500));
      if (error) return { error: `Could not add the new job orders: ${error.message}` };
    }
    for (let i = 0; i < replaceRows.length; i += 500) {
      const { error } = await supabaseAdmin.from("tbl_job_order").upsert(replaceRows.slice(i, i + 500), { onConflict: "id" });
      if (error) return { error: `Could not replace the existing job orders: ${error.message}` };
    }

    // ---- deliveries of the picked tickets
    const appJobs = new Map<number, number>(); // Access job order id -> app job order id
    for (const j of await loadAll("tbl_job_order", "id, access_job_order_link_id")) appJobs.set(j.access_job_order_link_id, j.id);
    const delivered = new Set<number>();
    for (const d of await loadAll("tbl_Deliveries", "id, job_order_id")) delivered.add(d.job_order_id);

    const dSkipped: PopulateResult["deliveries"]["skipped"] = [];
    for (const [key, tickets] of missing) {
      const list = Array.from(tickets);
      const shown = list.slice(0, 5).join(", ") + (list.length > 5 ? ` and ${list.length - 5} more` : "");
      warnings.push(`${key} is not in the app's list, so it was left empty (job ticket${list.length === 1 ? "" : "s"} ${shown}).`);
    }
    const dRows: any[] = [];
    const dOut: DeliveryOut[] = [];
    let alreadyInApp = 0;
    const doneTickets: string[] = [];

    for (const b of built) {
      const info = picked.get(b.ticket)!;
      const appJobId = appJobs.get(b.linkId);
      if (!appJobId) {
        dSkipped.push({ jobTicket: b.ticket, reason: "The job order could not be found in the app." });
        continue;
      }
      if (delivered.has(appJobId)) {
        alreadyInApp++;
        doneTickets.push(b.ticket);
        continue;
      }
      const dashAt = info.dr.indexOf("-");
      const left = (dashAt >= 0 ? info.dr.slice(0, dashAt) : info.dr).trim();
      const digits = /^\d+/.exec(left)?.[0];
      if (!digits) {
        dSkipped.push({ jobTicket: b.ticket, reason: `DR# "${info.dr}" has no number before the "-".` });
        continue;
      }
      const bd = bodyTotals.get(b.ticket) ?? noRolls;
      const x1 = x1Totals.get(b.ticket) ?? noRolls;
      const cc = ccTotals.get(b.ticket) ?? noRolls;
      if (bd.rolls + x1.rolls + cc.rolls === 0) {
        dSkipped.push({ jobTicket: b.ticket, reason: "No delivered rolls found in the delivery tables." });
        continue;
      }
      if (info.drs.size > 1) {
        warnings.push(`Job ticket ${b.ticket} has several DR#s (${Array.from(info.drs).join(", ")}); the latest one was used.`);
      }
      const isSmall = info.dr.includes("-"); // small delivery receipts have a "-" in the DR#
      // only Big receipts have an alias: Small ones ignore numAlias, and 0 means "no alias" (empty)
      let aliasId: number | null = null;
      if (!isSmall && info.alias != null && info.alias !== 0) {
        if (appAliasIds.has(info.alias)) aliasId = info.alias;
        else noteAlias(`numAlias ${info.alias} is not an id in tbl_Alias, so the delivery's alias was left empty`, b.ticket);
      }
      const row = {
        job_order_id: appJobId,
        delivery_receipt: Number(digits),
        receivable_type_id: isSmall ? 2 : 1,
        date_delivery: info.date,
        delivered_body_wt: round2(bd.weight),
        count_body: bd.rolls,
        delivered_1x1_wt: round2(x1.weight),
        count_1x1: x1.rolls,
        delivered_cc_wt: round2(cc.weight),
        count_cc: cc.rolls,
        alias_id: aliasId,
        invoice_id: 0,
      };
      dRows.push(row);
      dOut.push({
        jobTicket: b.ticket,
        customerName: b.customerName,
        deliveryReceipt: row.delivery_receipt,
        receivableTypeId: row.receivable_type_id,
        dateDelivery: row.date_delivery,
        totalWeight: round2(row.delivered_body_wt + row.delivered_1x1_wt + row.delivered_cc_wt),
        totalRolls: row.count_body + row.count_1x1 + row.count_cc,
      });
      doneTickets.push(b.ticket);
    }
    for (const [problem, tickets] of aliasNotes) {
      const list = Array.from(tickets);
      const shown = list.slice(0, 5).join(", ") + (list.length > 5 ? ` and ${list.length - 5} more` : "");
      warnings.push(`${problem} (job ticket${list.length === 1 ? "" : "s"} ${shown}).`);
    }
    for (let i = 0; i < dRows.length; i += 500) {
      const { error } = await supabaseAdmin.from("tbl_Deliveries").insert(dRows.slice(i, i + 500));
      if (error) return { error: `The job orders were copied, but the deliveries could not be added: ${error.message}` };
    }

    // ---- tell Access which delivery records are copied
    let markError: string | null = null;
    if (doneTickets.length > 0 && ticketKey && dateKey && copiedKey) {
      markError = await runInAccess(
        path,
        buildMarkStatements({ table: del.name, ticket: ticketKey, date: dateKey, copied: copiedKey }, doneTickets, range.start, range.end)
      );
    }

    revalidatePath("/job-orders");
    revalidatePath("/deliveries");
    return {
      result: {
        path,
        label: range.label,
        tickets: picked.size,
        alreadyCopied,
        newRecords: newOut,
        changedRecords: replaceOut,
        skipped,
        marked: markError ? 0 : doneTickets.length,
        markError,
        cusJoBackfilled,
        deliveries: { added: dOut, alreadyInApp, skipped: dSkipped, warnings },
      },
    };
  } catch (e: any) {
    if (e instanceof AccessError) return { error: e.message };
    return { error: `Populate failed: ${e?.message ?? "unknown error"}` };
  }
}
