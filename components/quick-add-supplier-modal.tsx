"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createSupplier, type SupplierFormState } from "@/actions/suppliers";

const initialState: SupplierFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Saving\u2026" : "Add supplier"}
    </button>
  );
}

export function QuickAddSupplierModal({
  initialName,
  onCreated,
  onClose,
}: {
  initialName: string;
  onCreated: (id: number, name: string) => void;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(createSupplier, initialState);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.id && state.name) onCreated(state.id, state.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded border border-line bg-paper-raised p-6 shadow-sm">
        <p className="ledger-label mb-1">New</p>
        <h2 className="mb-5 font-display text-xl font-semibold text-ink">Supplier</h2>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Supplier name</label>
            <input
              ref={nameRef}
              name="supplierName"
              className="field-input"
              defaultValue={initialName}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-ink-soft">Contact person</label>
              <input name="contactPerson" className="field-input" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-soft">Email</label>
              <input name="email" type="email" className="field-input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Phone</label>
            <input name="phone" inputMode="numeric" className="field-input" placeholder="numbers only" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-ink-soft">Discount %</label>
              <input name="discountPercent" type="number" step="any" min="0" max="100" className="field-input" placeholder="e.g. 2.5" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-soft">Terms (days)</label>
              <input name="terms" inputMode="numeric" className="field-input" placeholder="e.g. 30" />
            </div>
          </div>

          {state?.error && (
            <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {state.error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <div className="flex-1">
              <SubmitButton />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
