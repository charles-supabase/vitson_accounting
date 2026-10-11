import "server-only";
import { readFile } from "node:fs/promises";
import MDBReader from "mdb-reader";
import { readTableViaAccess } from "./access-linked";

/** Helpers for reading the local MS Access databases (read only). */

export type Row = Record<string, unknown>;

export class AccessError extends Error {}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]/g, "");
export const text = (v: unknown) => (v == null ? "" : String(v).trim());
export const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Reads a field regardless of upper/lower case. */
export function field(row: Row, name: string): unknown {
  if (name in row) return row[name];
  const lower = name.toLowerCase();
  for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
  return undefined;
}

/** The first of several possible field names that the row has. */
export function fieldAny(row: Row, names: string[]): unknown {
  for (const n of names) {
    const v = field(row, n);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** A date from Access as yyyy-mm-dd (Access stores no time zone; the library hands it over as UTC). */
export function isoDate(v: unknown): string | null {
  const d = v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** A table of the Access file, found regardless of upper/lower case and with or without the "tbl_" prefix. */
export function getRows(reader: MDBReader, candidates: string[]): Row[] {
  const names = reader.getTableNames();
  const wanted = candidates.flatMap((c) => [norm(c), norm("tbl_" + c)]);
  const found = names.find((n) => wanted.includes(norm(n)));
  if (!found) {
    throw new AccessError(`The table "${candidates[0]}" was not found in the Access file. Tables found: ${names.join(", ") || "none"}.`);
  }
  return reader.getTable(found).getData() as Row[];
}

/** Opens an Access file given its path without extension (tries .accdb, then .mdb) or with it. */
export async function openAccessFile(base: string): Promise<{ reader: MDBReader; path: string }> {
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

export type AccessDb = { reader: MDBReader; path: string };

/**
 * A table of the Access file. The name is matched ignoring upper/lower case and a "tbl_" prefix; when Access gave a
 * new link the name plus "1" (it does that when the name was already taken), that one is accepted too.
 * Tables stored in the file are read directly; a linked table (its data lives in another database or file) is read
 * through Access itself, which follows the link.
 */
export async function getTableAsync(db: AccessDb, candidates: string[]): Promise<{ name: string; rows: Row[] }> {
  const exact = candidates.flatMap((c) => [norm(c), norm("tbl_" + c)]);
  const withOne = exact.map((n) => n + "1");

  const local = db.reader.getTableNames();
  let linked: string[] = [];
  try {
    linked = (db.reader as any).getTableNames({ normalTable: false, systemTable: false, linkedTable: true }) as string[];
  } catch {
    linked = [];
  }
  // tables only the linked listing knows (empty when this version of the library does not tell them apart)
  const linkedOnly = linked.filter((n) => !local.includes(n));
  const names = Array.from(new Set([...local, ...linked]));

  const name = names.find((n) => exact.includes(norm(n))) ?? names.find((n) => withOne.includes(norm(n)));
  if (!name) {
    throw new AccessError(`The table "${candidates[0]}" was not found in the Access file. Tables found: ${names.join(", ") || "none"}.`);
  }

  const viaAccess = async () => (await readTableViaAccess(db.path, name)) as Row[];
  const linkHint = (msg: string) =>
    new AccessError(
      `The table "${name}" is a linked table and could not be read through Access: ${msg}. ` +
        `Check that the link works when you open ${db.path} in Access, and that the file it links to is available.`
    );

  if (linkedOnly.includes(name)) {
    try {
      return { name, rows: await viaAccess() };
    } catch (e: any) {
      throw linkHint(e?.message ?? "unknown error");
    }
  }

  // stored in the file: read it directly; an empty or unreadable result may be a link, so ask Access as well
  let rows: Row[] = [];
  let failed = "";
  try {
    rows = db.reader.getTable(name).getData() as Row[];
  } catch (e: any) {
    failed = e?.message ?? "unknown error";
  }
  if (rows.length === 0 || failed) {
    try {
      const viaA = await viaAccess();
      if (viaA.length > 0 || failed) return { name, rows: viaA };
    } catch (e: any) {
      if (failed) throw linkHint(e?.message ?? failed);
    }
  }
  return { name, rows };
}

export async function getRowsAsync(db: AccessDb, candidates: string[]): Promise<Row[]> {
  return (await getTableAsync(db, candidates)).rows;
}
