"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createItem, type ItemFormState } from "@/actions/items";

const initialState: ItemFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Saving\u2026" : "Add item"}
    </button>
  );
}

export function QuickAddItemModal({
  initialName,
  bounds,
  shades,
  onCreated,
  onClose,
}: {
  initialName: string;
  bounds: { id: number; label: string }[];
  shades: { id: number; label: string }[];
  onCreated: (id: number, name: string) => void;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(createItem, initialState);

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
        <h2 className="mb-5 font-display text-xl font-semibold text-ink">Item</h2>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Item name</label>
            <input name="itemName" className="field-input" defaultValue={initialName} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-ink-soft">Bound</label>
              <select name="boundId" className="field-input">
                <option value=""></option>
                {bounds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-soft">Shade</label>
              <select name="shadeId" className="field-input">
                <option value=""></option>
                {shades.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Standard price</label>
            <input name="price" inputMode="decimal" className="field-input" />
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
