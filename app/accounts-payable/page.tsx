import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ApFilters } from "@/components/ap-filters";
import { getApSuppliers, getApSummary, type ApRow } from "@/actions/accounts-payable";
import { ApReport } from "@/components/ap-report";
import { fmtMoney } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

const sum = (rows: ApRow[]) => rows.reduce((a, r) => a + r.amount, 0);

export default async function AccountsPayablePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireModule("accounts_payable");
  const sp = await searchParams;

  const supplierId = typeof sp.supplier === "string" && /^\d+$/.test(sp.supplier) ? Number(sp.supplier) : null;
  // no year in the address = this year; "all" = every year
  const thisYear = new Date().getFullYear();
  const year = sp.year === undefined ? thisYear : typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  const month = year != null && typeof sp.month === "string" && /^([1-9]|1[0-2])$/.test(sp.month) ? Number(sp.month) : null;

  const [rows, suppliers] = await Promise.all([getApSummary(supplierId, year, month), getApSuppliers()]);
  const total = sum(rows);
  const filtered = supplierId != null || year != null;

  const printQs = new URLSearchParams();
  if (supplierId != null) printQs.set("supplier", String(supplierId));
  printQs.set("year", year != null ? String(year) : "all");
  if (month != null) printQs.set("month", String(month));

  return (
    <AppShell
      title="Accounts Payable"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <div className="panel panel-navy mb-4">
        <ApFilters
          suppliers={suppliers}
          initialSupplierId={supplierId}
          initialYear={year != null ? String(year) : ""}
          initialMonth={month != null ? String(month) : ""}
          defaultYear={String(thisYear)}
        />
      </div>

      <div className="panel panel-teal">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="inline-block rounded border border-line bg-paper-raised px-5 py-3">
            <div className="ledger-label">{filtered ? "Total owed for this filter" : "Total owed to all suppliers"}</div>
            <div className="font-mono text-2xl text-ink">{fmtMoney(total)}</div>
          </div>
          <a href={`/accounts-payable/print?${printQs.toString()}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Print
          </a>
        </div>
        <ApReport rows={rows} supplierId={supplierId} year={year} month={month} />
      </div>
    </AppShell>
  );
}
