import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVoucherDetail } from "@/actions/voucher";
import { getAssignedCheck } from "@/actions/voucher-check";
import { AutoPrint } from "@/components/auto-print";
import { fmtMoney } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function slashDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export default async function PrintVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("voucher");
  const { id } = await params;
  const voucher = await getVoucherDetail({ id: Number(id) });
  if (!voucher) notFound();
  const check = await getAssignedCheck(voucher.id);

  const bookId = voucher.lines[0]?.accBookId ?? null;
  const { data: book } = bookId
    ? await supabaseAdmin.from("tbl_Acc_Book").select("Book_Number").eq("id", bookId).maybeSingle()
    : { data: null };

  const payee = check?.payableName ?? voucher.supplierName;

  return (
    <div className="mx-auto w-[820px] bg-white px-4 py-6 font-sans text-[13px] text-black">
      <style>{"@page { margin: 8mm; }"}</style>
      <AutoPrint />

      <h1 className="mb-1 text-center text-[24px] tracking-wide">DISBURSEMENTS VOUCHER</h1>
      {voucher.cancelled && <p className="mb-1 text-center font-semibold">*** CANCELLED ***</p>}

      {/* payable to / voucher number */}
      <div className="grid grid-cols-[1fr_16rem] gap-x-8">
        <div className="h-24 border border-neutral-500 px-4 py-2">
          <div>Payable To :</div>
          <div className="mt-3 text-center text-[15px]">{payee}</div>
        </div>
        <div className="space-y-3 pt-2">
          <div className="flex items-end gap-3">
            <span className="w-16">Voucher</span>
            <span className="flex-1 border-b border-neutral-500 pb-0.5 text-center text-[15px]">
              {(book as any)?.Book_Number ?? ""}
            </span>
          </div>
          <div className="flex items-end gap-3">
            <span className="w-16 text-right">No</span>
            <span className="flex-1 border-b border-neutral-500 pb-0.5 text-center text-[15px]">{voucher.voucherNo}</span>
          </div>
        </div>
      </div>

      <div className="mb-1 mt-5 flex items-end justify-between">
        <span className="text-[15px]">PAYMENT DETAILS :</span>
        <span className="flex w-[22rem] items-end gap-4">
          <span>Date:</span>
          <span className="flex-1 border-b border-neutral-500 pb-0.5 text-center text-[15px]">{longDate(voucher.voucherDate)}</span>
        </span>
      </div>

      {/* payment details */}
      <table className="w-full border-collapse border border-neutral-500 text-[13px]">
        <thead>
          <tr>
            <th className="w-32 border border-neutral-500 py-1.5 text-center font-normal">ACCT. NO.</th>
            <th className="border border-neutral-500 py-1.5 text-center font-normal">DESCRIPTION</th>
            <th className="w-40 border border-neutral-500 py-1.5 text-center font-normal">INV./DR. NO.</th>
            <th className="w-36 border border-neutral-500 py-1.5 text-center font-normal">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {voucher.lines.map((l) => (
            <tr key={l.receivingId}>
              <td className="h-7 border border-neutral-500 px-2" />
              <td className="border border-neutral-500 px-2 text-center">{l.itemName}</td>
              <td className="border border-neutral-500 px-2 text-center">{l.drInvNo}</td>
              <td className="border border-neutral-500 px-2 text-right">{fmtMoney(l.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="h-7 border border-neutral-500 px-2" />
            <td className="border border-neutral-500 px-2" />
            <td className="border border-neutral-500 px-2 text-center">Total</td>
            <td className="border border-neutral-500 px-2 text-right">{fmtMoney(voucher.gross)}</td>
          </tr>
          {voucher.deductions.map((d, i) => (
            <tr key={i}>
              <td className="h-7 border border-neutral-500 px-2" />
              <td className="border border-neutral-500 px-2 text-center">
                Less: {d.deductionName}
                {d.remarks ? ` - ${d.remarks}` : ""}
              </td>
              <td className="border border-neutral-500 px-2" />
              <td className="border border-neutral-500 px-2 text-right">({fmtMoney(d.amount)})</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* remarks / net / cheque */}
      <div className="mt-6 grid grid-cols-[1fr_21rem] border border-neutral-500">
        <div className="min-h-[7.5rem] border-r border-neutral-500 p-2">
          <div>Remarks</div>
          <div className="mt-3 pl-8 text-[15px]">{check?.remark ?? ""}</div>
        </div>
        <div>
          <div className="grid grid-cols-2 border-b border-neutral-500">
            <div className="border-r border-neutral-500 px-2 py-1.5 text-center">Net Amount</div>
            <div className="px-2 py-1.5 text-right">{fmtMoney(voucher.net)}</div>
          </div>
          <div className="px-2 py-2">
            <div className="flex items-end gap-3">
              <span>Cheque No :</span>
              <span className="flex-1 border-b border-neutral-500 pb-0.5 text-center text-[15px]">{check?.bankName ?? ""}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 border border-neutral-500">
              <div className="border-r border-neutral-500 px-2 py-1 text-center">{slashDate(check?.dtCheck)}</div>
              <div className="px-2 py-1 text-center">{check?.checkNo ?? ""}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_21rem] border-x border-b border-neutral-500">
        {["Prepared", "Verified", "Approved", "Entered", "Payment RCVD."].map((label, i) => (
          <div key={label} className={"h-24 px-2 py-1 " + (i > 0 ? "border-l border-neutral-500" : "")}>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
