import { requireModule } from "@/lib/auth";
import { ApReport } from "@/components/ap-report";
import { AutoPrint } from "@/components/auto-print";
import { getApSummary } from "@/actions/accounts-payable";
import { fmtMoney, monthLabel } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

export default async function ApPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("accounts_payable");
  const sp = await searchParams;

  const supplierId = typeof sp.supplier === "string" && /^\d+$/.test(sp.supplier) ? Number(sp.supplier) : null;
  const year = sp.year === undefined || sp.year === "all" ? null : typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  const month = year != null && typeof sp.month === "string" && /^([1-9]|1[0-2])$/.test(sp.month) ? Number(sp.month) : null;

  const rows = await getApSummary(supplierId, year, month);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const period = year == null ? "All years" : month != null ? monthLabel(year, month) : `Year ${year}`;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-black">
      <style>{"@page { margin: 12mm; }"}</style>
      <AutoPrint />
      <header className="mb-5 border-b border-black pb-2">
        <h1 className="text-xl font-semibold">Accounts Payable</h1>
        <div className="text-neutral-700">
          Due: {period} · Total owed {fmtMoney(total)}
        </div>
      </header>
      <ApReport rows={rows} supplierId={supplierId} year={year} month={month} />
    </div>
  );
}
