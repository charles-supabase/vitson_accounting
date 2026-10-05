"use client";

import { useEffect, useRef, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "@/actions/auth";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Checking\u2026" : "Log in"}
    </button>
  );
}

export function LoginModal({
  moduleKey,
  moduleLabel,
  onClose,
}: {
  moduleKey: string;
  moduleLabel: string;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(login, initialState);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 shadow-sm">
        <p className="ledger-label mb-1">Sign in to</p>
        <h2 id="login-modal-title" className="mb-5 font-display text-xl font-semibold text-ink">
          {moduleLabel}
        </h2>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="module" value={moduleKey} />

          <div>
            <label htmlFor="loginName" className="mb-1 block text-sm text-ink-soft">
              Login name
            </label>
            <input
              ref={firstFieldRef}
              id="loginName"
              name="loginName"
              type="text"
              autoComplete="username"
              className="field-input"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-ink-soft">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="field-input"
              required
            />
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
