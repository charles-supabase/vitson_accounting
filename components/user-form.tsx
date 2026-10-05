"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createUser, type UserFormState } from "@/actions/users";
import { MODULES } from "@/lib/modules";

const initialState: UserFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Creating\u2026" : "Create user"}
    </button>
  );
}

export function UserForm() {
  const [state, formAction] = useActionState(createUser, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-ink-soft" htmlFor="loginName">
            Login name
          </label>
          <input id="loginName" name="loginName" className="field-input" required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink-soft" htmlFor="password">
            Password
          </label>
          <input id="password" name="password" type="password" className="field-input" required />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm text-ink-soft">Module access</p>
        <div className="flex flex-wrap gap-4">
          {MODULES.map((m) => (
            <label key={m.key} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name={`module_${m.key}`} className="h-4 w-4" />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isSuperAdmin" className="h-4 w-4" />
        Super admin (full access, including this Admin section)
      </label>

      {state?.error && (
        <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
