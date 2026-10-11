"use client";

import { useEffect, useState } from "react";
import { getVoucherReportMonths } from "@/actions/voucher-reports";
import { MONTH_NAMES } from "@/lib/report-format";
import { VOUCHER_TYPE_NAME, type VoucherTypeId } from "@/lib/voucher-types";

const monthLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]}-${ym.slice(0, 4)}`;

/**
 * Month + year filter and the three voucher report buttons (top right of the Voucher page).
 * The filter lists every month that has vouchers of the active tab, newest first.
 * The reports follow the active ORIGINAL / DUPLICATE tab and the box wears the same colour as that tab.
 * Each report opens in a new tab, ready to print.
 */
export function VoucherReportsBar({ voucherType }: { voucherType: VoucherTypeId }) {
  const [months, setMonths] = useState<string[]>([]);
  const [ym, setYm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVoucherReportMonths(voucherType).then((list) => {
      if (cancelled) return;
      setMonths(list);
      // keep the chosen month if this tab has it, otherwise start with the newest
      setYm((cur) => (cur && list.includes(cur) ? cur : (list[0] ?? "")));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [voucherType]);

  function open(type: "summary" | "book" | "details") {
    if (!ym) return;
    window.open(`/voucher/reports/print?type=${type}&ym=${encodeURIComponent(ym)}&vt=${voucherType}`, "_blank");
  }

  return (
    <div
      className={"panel flex w-full shrink-0 flex-col gap-2 lg:w-60 " + (voucherType === 1 ? "panel-original" : "panel-duplicate")}
    >
      <div className="text-xs font-bold tracking-wide">REPORTS · {VOUCHER_TYPE_NAME[voucherType]}</div>
      <div>
        <label className="ledger-label mb-1 block">Month and year</label>
        <select className="field-input" value={ym} disabled={months.length === 0} onChange={(e) => setYm(e.target.value)}>
          {months.length === 0 && <option value="">{loading ? "Loading…" : "No vouchers yet"}</option>}
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </div>
      <button type="button" className="btn-secondary" disabled={!ym} onClick={() => open("summary")}>
        Print Voucher Summary
      </button>
      <button type="button" className="btn-secondary" disabled={!ym} onClick={() => open("book")}>
        Print Book Summary
      </button>
      <button type="button" className="btn-secondary" disabled={!ym} onClick={() => open("details")}>
        Book Details
      </button>
    </div>
  );
}
