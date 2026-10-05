"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideRequisition } from "@/actions/requisitions";

export function RequisitionDecisionButtons({ requisitionId }: { requisitionId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "APPROVED" | "REJECTED") {
    setError(null);
    startTransition(async () => {
      const result = await decideRequisition(requisitionId, decision);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.back();
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => decide("APPROVED")}
          disabled={isPending}
          className="btn-primary"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("REJECTED")}
          disabled={isPending}
          className="btn-secondary text-danger"
        >
          Reject
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
