"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createProject, type ProjectFormState } from "@/actions/projects";

const initialState: ProjectFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Saving\u2026" : "Add project"}
    </button>
  );
}

export function QuickAddProjectModal({
  initialName,
  onCreated,
  onClose,
}: {
  initialName: string;
  onCreated: (id: number, name: string) => void;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(createProject, initialState);

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
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 shadow-sm">
        <p className="ledger-label mb-1">New</p>
        <h2 className="mb-5 font-display text-xl font-semibold text-ink">Project</h2>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Project name</label>
            <input name="projectName" className="field-input" defaultValue={initialName} required />
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
