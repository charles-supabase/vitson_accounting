"use client";

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

export function ItemForm({
  bounds,
  shades,
}: {
  bounds: { id: number; label: string }[];
  shades: { id: number; label: string }[];
}) {
  const [state, formAction] = useActionState(createItem, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm text-ink-soft" htmlFor="itemName">
          Item name
        </label>
        <input id="itemName" name="itemName" className="field-input" required />
      </div>
      <div>
        <label className="mb-1 block text-sm text-ink-soft" htmlFor="price">
          Price
        </label>
        <input id="price" name="price" inputMode="decimal" className="field-input" />
      </div>
      <div>
        <label className="mb-1 block text-sm text-ink-soft" htmlFor="boundId">
          Bound
        </label>
        <select id="boundId" name="boundId" className="field-input">
          <option value=""></option>
          {bounds.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm text-ink-soft" htmlFor="shadeId">
          Shade
        </label>
        <select id="shadeId" name="shadeId" className="field-input">
          <option value=""></option>
          {shades.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {state?.error && (
        <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2" role="alert">
          {state.error}
        </p>
      )}

      <div className="sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
