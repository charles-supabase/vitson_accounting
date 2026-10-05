"use client";

import { markPurchaseOrderPrinted } from "@/actions/purchase-orders";

export function PrintButton({ poId, printed }: { poId: number; printed: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        // Best-effort: we can only detect that Print was clicked, not that the user
        // actually completed/confirmed printing in the OS dialog.
        markPurchaseOrderPrinted(poId);
        window.print();
      }}
      className={"btn-primary " + (printed ? "!bg-green-600 hover:!bg-green-700" : "!bg-orange-500 hover:!bg-orange-600")}
      title={printed ? "Already printed" : "Not printed yet"}
    >
      Print
    </button>
  );
}
