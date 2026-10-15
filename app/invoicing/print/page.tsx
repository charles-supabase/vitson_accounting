import { requireModule } from "@/lib/auth";
import { PrintToolbar } from "@/components/print-toolbar";
import { getInvoiceCustomerReport, getInvoiceList, getInvoicePrint, type InvoiceRow, type InvoiceTotalsRow } from "@/actions/invoicing";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/report-format";
import { formatTin } from "@/lib/tin-format";

export const dynamic = "force-dynamic";

const th = "border border-black px-1.5 py-1 text-left font-semibold";
const thR = "border border-black px-1.5 py-1 text-right font-semibold";
const td = "border border-black px-1.5 py-0.5";
const tdR = "border border-black px-1.5 py-0.5 text-right font-mono";

/**
 * Prints from the Invoicing page:
 *   /invoicing/print?kind=invoice&id=12   the billing invoice
 *   /invoicing/print?kind=list&ym=2026-09        report 1: invoices of the month
 *   /invoicing/print?kind=customers&ym=2026-09   report 2: invoices of the month per customer
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("invoicing");
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const ym = typeof sp.ym === "string" ? sp.ym : "";
  if (kind === "invoice") return <BillingInvoice id={typeof sp.id === "string" ? Number(sp.id) : 0} />;
  if (kind === "customers") return <PerCustomer ym={ym} />;
  return <InvoiceList ym={ym} />;
}

function Title({ label }: { label?: string }) {
  return (
    <div className="mb-3 font-bold" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <span style={{ fontSize: "18pt" }}>Monthly Invoice Report Summary</span>
      {label && (
        <span className="ml-3 underline" style={{ fontSize: "16pt", fontWeight: 400 }}>
          {label}
        </span>
      )}
    </div>
  );
}

function TotalCells({ t }: { t: InvoiceTotalsRow }) {
  return (
    <>
      <td className={tdR}>{money(t.invoiceAmount)}</td>
      <td className={tdR}>{money(t.discount)}</td>
      <td className={tdR}>{money(t.deduction)}</td>
      <td className={tdR}>{money(t.serviceIncome)}</td>
      <td className={tdR}>{money(t.vat)}</td>
    </>
  );
}

/** Report 1 */
async function InvoiceList({ ym }: { ym: string }) {
  const res = await getInvoiceList(ym);
  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <style>{"@page { size: portrait; margin: 10mm; }"}</style>
      <PrintToolbar autoPrint={res.invoices.length > 0} />
      <Title label={res.periodLabel} />
      {res.error && <p className="text-red-700">{res.error}</p>}
      {!res.error && res.invoices.length === 0 && <p>No invoices for this period.</p>}
      {res.invoices.length > 0 && (
        <table className="w-full table-fixed border-collapse text-[9pt]">
          <colgroup>
            <col style={{ width: "9%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>Date</th>
              <th className={th + " text-center"}>CUSTOMER</th>
              <th className={th}>INV No</th>
              <th className={thR}>Act Receivable</th>
              <th className={thR}>Discount</th>
              <th className={thR}>Deduction</th>
              <th className={thR}>Service Income</th>
              <th className={thR}>Uncollected</th>
            </tr>
          </thead>
          <tbody>
            {res.invoices.map((r: InvoiceRow) => (
              <tr key={r.id}>
                <td className={td}>{formatDate(r.dateInvoice)}</td>
                <td className={td}>{r.aliasName}</td>
                <td className={td + " font-mono"}>{r.invoiceNumber}</td>
                <td className={tdR}>{money(r.invoiceAmount)}</td>
                <td className={tdR}>{money(r.discount)}</td>
                <td className={tdR}>{money(r.deduction)}</td>
                <td className={tdR}>{money(r.serviceIncome)}</td>
                <td className={tdR}>{money(r.vat)}</td>
              </tr>
            ))}
          </tbody>
          {res.totals && (
            <tfoot>
              <tr className="font-bold">
                <td className={td + " text-right"} colSpan={3}>
                  GRAND TOTAL
                </td>
                <TotalCells t={res.totals} />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}

/** Report 2: one customer per page, with the group total and the grand total. */
async function PerCustomer({ ym }: { ym: string }) {
  const res = await getInvoiceCustomerReport(ym);
  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <style>{"@page { size: portrait; margin: 10mm; }"}</style>
      <PrintToolbar autoPrint={res.groups.length > 0} />
      {res.error && <p className="text-red-700">{res.error}</p>}
      {!res.error && res.groups.length === 0 && <p>No invoices for this period.</p>}
      {res.groups.map((g, i) => (
        <div key={g.customerId} className={i < res.groups.length - 1 ? "break-after-page" : ""}>
          <Title label={res.periodLabel} />
          <div className="mb-3 text-lg font-bold">
            TO <span className="ml-2 border-b border-black px-2">{g.customerNo || g.customerName}</span>
          </div>
          <table className="w-full table-fixed border-collapse text-[8.5pt]">
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className={th}>INV Date</th>
                <th className={th}>INV No</th>
                <th className={th + " text-center"}>CUSTOMER</th>
                <th className={thR}>Act Receivable</th>
                <th className={thR}>Discount</th>
                <th className={thR}>Deduction</th>
                <th className={thR}>Service Income</th>
                <th className={thR}>Uncollected</th>
                <th className={th}>OR Date</th>
                <th className={th}>OR No</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{formatDate(r.dateInvoice)}</td>
                  <td className={td + " font-mono"}>{r.invoiceNumber}</td>
                  <td className={td}>{r.aliasName}</td>
                  <td className={tdR}>{money(r.invoiceAmount)}</td>
                  <td className={tdR}>{money(r.discount)}</td>
                  <td className={tdR}>{money(r.deduction)}</td>
                  <td className={tdR}>{money(r.serviceIncome)}</td>
                  <td className={tdR}>{money(r.vat)}</td>
                  <td className={td}></td>
                  <td className={td}></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className={td + " text-right"} colSpan={3}>
                  TOTAL
                </td>
                <TotalCells t={g.totals} />
                <td className={td}></td>
                <td className={td}></td>
              </tr>
              {i === res.groups.length - 1 && res.grand && (
                <tr className="font-bold">
                  <td className={td + " text-right"} colSpan={3}>
                    GRAND TOTAL
                  </td>
                  <TotalCells t={res.grand} />
                  <td className={td}></td>
                  <td className={td}></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  );
}

const box = "border border-black";

/** The billing invoice (a plain-paper copy of the form). */
async function BillingInvoice({ id }: { id: number }) {
  const res = await getInvoicePrint(id);
  const inv = res.invoice;
  const totalSales = inv ? Math.round((inv.grossAmount - inv.discount) * 100) / 100 : 0;
  const netSales = inv ? Math.round((inv.grossAmount - inv.discount - inv.deduction) * 100) / 100 : 0;
  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <style>{"@page { size: portrait; margin: 10mm; }"}</style>
      <PrintToolbar autoPrint={!!inv} />
      {res.error && <p className="text-red-700">{res.error}</p>}
      {inv && (
        <div className="mx-auto max-w-[190mm] text-[10pt]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-bold">VITSON INTERNATIONAL INCORPORATED</div>
              <div className="text-[9pt]">254 Sto. Domingo St., Manresa I, Quezon City, Philippines</div>
              <div className="text-[9pt]">VAT REG. TIN – 000-379-853-00000</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">BILLING INVOICE</div>
              <div className="text-lg">
                No. <span className="font-mono text-2xl">{inv.invoiceNumber}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_16rem] gap-4">
            <div className={box + " p-2"}>
              <div className="text-[8pt] font-semibold">BILLED TO</div>
              <div className="text-base font-semibold">{inv.aliasName}</div>
              <div className="text-[8pt] font-semibold">ADDRESS</div>
              <div>{inv.aliasAddress}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-[8pt]">
                <div>
                  <span className="font-semibold">TIN </span>
                  <span className="font-mono text-[10pt]">{formatTin(inv.aliasTin)}</span>
                </div>
                <div className="font-semibold">BUS. STYLE/NAME</div>
              </div>
            </div>
            <div className={box}>
              <div className="border-b border-black p-1 text-[8pt]">
                <span className="font-semibold">DATE </span>
                <span className="text-sm">{formatDate(inv.dateInvoice)}</span>
              </div>
              <div className="grid grid-cols-2 text-[8pt]">
                <div className="border-b border-r border-black p-1">PREPARED BY:</div>
                <div className="border-b border-black p-1">CHECKED BY:</div>
                <div className="border-r border-black p-1">APPROVED BY:</div>
                <div className="p-1">DELIVERED BY:</div>
              </div>
            </div>
          </div>

          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="bg-[#1e3a8a] text-white">
                <th className="w-24 px-2 py-1 text-center">QUANTITY</th>
                <th className="w-12 px-2 py-1 text-center">UNIT</th>
                <th className="px-2 py-1 text-center tracking-widest">DESCRIPTION</th>
                <th className="w-24 px-2 py-1 text-center">Unit Price</th>
                <th className="w-32 px-2 py-1 text-center">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 text-right font-mono">{money(l.quantity)}</td>
                  <td className="px-2 py-1 text-center">kgs.</td>
                  <td className="px-2 py-1">
                    <span className="inline-block w-40">Dyeing Service</span>
                    <span className="inline-block w-24">{l.dyeName}</span>
                    <span>{l.description}</span>
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{money(l.unitPrice)}</td>
                  <td className="px-2 py-1 text-right font-mono">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 ml-auto w-72 text-[10pt]">
            <div className="flex justify-between border-t border-black pt-1">
              <span>Gross Sales</span>
              <span className="font-mono">{money(inv.grossAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>(-) Discount</span>
              <span className="font-mono">{money(inv.discount)}</span>
            </div>
            <div className="flex justify-between border-t border-black pt-1">
              <span>Total Sales</span>
              <span className="font-mono">{money(totalSales)}</span>
            </div>
            <div className="flex justify-between">
              <span>(-) Deductions</span>
              <span className="font-mono">{money(inv.deduction)}</span>
            </div>
            <div className="flex justify-between border-t border-black pt-1 font-semibold">
              <span>Net Sales</span>
              <span className="font-mono">{money(netSales)}</span>
            </div>
          </div>

          <div className="mt-3 w-72 text-[10pt]">
            <div className="flex justify-between">
              <span>Vatable</span>
              <span className="font-mono">{money(inv.vatable)}</span>
            </div>
            <div className="flex justify-between">
              <span>Vat</span>
              <span className="font-mono">{money(inv.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-black pt-1 font-semibold">
              <span>Total Amount Payable</span>
              <span className="font-mono">{money(netSales)}</span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border-2 border-black p-2 text-[6.5pt] leading-tight">
            <b>TERMS AND CONDITION:</b> OUR RESPONSIBILITY CEASES UPON DELIVERY OF MERCHANDISE TO THE CARRIER IN GOOD ORDER. WE SHALL NOT BE RESPONSIBLE FOR ANY FABRIC CUT
            WITHOUT INSPECTION THEN FOUND OUT TO BE DEFECTIVE. WE WILL NOT ENTERTAIN ANY COMPLAIN OF DEFECTIVE FABRIC AFTER 14 DAYS FROM THE DAY OF DELIVERY, WE WILL NOT
            ASSUME ANY CLAIM THE CUSTOMER MIGHT DEMAND FROM THEM. IN CASE OF DEFAULT IN PAYMENT OF THE TOTAL AMOUNT OR PART THEREOF THE UNPAID AMOUNT SHALL BEAR 27%
            INTEREST OF THE TOTAL AMOUNT DUE IF ACCOUNT IS TURNED OVER TO AN ATTORNEY. IN CASE OF LITIGATION ARISING FROM THIS TRANSACTION, THE COURT OF QUEZON CITY SHALL
            HAVE JURISDICTION AND LEGAL COST SHALL BE FOR THE ACCOUNT OF THE CUSTOMER.
          </div>
          <div className="mt-2 text-center text-[10pt] font-bold">RECEIVED THE ABOVE ITEM IN GOOD ORDER AND CONDITION.</div>
          <div className={"mt-1 grid grid-cols-[1fr_1fr_1fr_1fr] text-[8pt] " + box}>
            <div className="h-14 border-r border-black p-1">RECEIVED BY: NAME IN PRINT</div>
            <div className="h-14 border-r border-black p-1">AUTHORIZED SIGNATURE:</div>
            <div className="h-14 border-r border-black p-1"></div>
            <div className="h-14 p-1"></div>
          </div>
        </div>
      )}
    </div>
  );
}
