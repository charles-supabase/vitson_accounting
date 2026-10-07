"use client";

import { useEffect, useState } from "react";

/** Month + year filter and the three voucher report buttons. Each report opens in a new tab ready to print. */
export function VoucherReportsBar() {
  const [ym, setYm] = useState("");

  // default to the user's current month (client side: the server runs in UTC)
  useEffect(() => {
    const now = new Date();
    setYm(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }, []);

  function open(type: "summary" | "book" | "details") {
    if (!ym) return;
    window.open(`/voucher/reports/print?type=${type}&ym=${encodeURIComponent(ym)}`, "_blank");
  }

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded border border-line bg-paper-raised px-4 py-3">
      <div>
        <label className="ledger-label mb-1 block">Reports for month</label>
        <input type="month" className="field-input" value={ym} onChange={(e) => setYm(e.target.value)} />
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
