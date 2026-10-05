"use client";

import { useState } from "react";
import Link from "next/link";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { LoginModal } from "@/components/login-modal";
import { logout } from "@/actions/auth";

type PublicSession = {
  loginName: string;
  isSuperAdmin: boolean;
  modules: string[];
} | null;

export function DashboardClient({
  session,
  errorFlag,
}: {
  session: PublicSession;
  errorFlag?: string;
}) {
  const [openTile, setOpenTile] = useState<{ key: ModuleKey | "admin"; label: string } | null>(
    null
  );

  function hasAccess(key: ModuleKey | "admin") {
    if (!session) return false;
    if (session.isSuperAdmin) return true;
    if (key === "admin") return false;
    return session.modules.includes(key);
  }

  return (
    <main className="max-w-3xl">
      <header className="mb-12">
        <p className="ledger-label mb-2">Vitson</p>
        <h1 className="font-display text-3xl font-semibold text-ink">Purchase Order</h1>
        {session ? (
          <div className="mt-3 text-sm text-ink-soft">
            Signed in as <span className="font-medium text-ink">{session.loginName}</span>
            {" \u2014 "}
            <form action={logout} className="inline">
              <button type="submit" className="underline hover:text-ink">
                sign out
              </button>
            </form>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Select a module to sign in.</p>
        )}
        {errorFlag === "forbidden" && (
          <p className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
            That account does not have access to the module you tried to open.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODULES.map((m) => {
          const unlocked = hasAccess(m.key);
          const content = (
            <>
              <span className="font-display text-lg font-semibold text-ink">{m.label}</span>
              <span className="mt-1 block text-sm text-ink-soft">{m.description}</span>
            </>
          );
          return unlocked ? (
            <Link
              key={m.key}
              href={m.href}
              className="rounded border border-line bg-paper-raised p-5 transition-colors hover:border-ink"
            >
              {content}
            </Link>
          ) : (
            <button
              key={m.key}
              type="button"
              onClick={() => setOpenTile({ key: m.key, label: m.label })}
              className="rounded border border-line bg-paper-raised p-5 text-left transition-colors hover:border-ink"
            >
              {content}
            </button>
          );
        })}
      </div>

      <div className="mt-10 border-t border-line pt-6">
        {hasAccess("admin") ? (
          <Link href="/admin" className="text-sm text-ink-soft underline hover:text-ink">
            Master data &amp; administration
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setOpenTile({ key: "admin", label: "Administration" })}
            className="text-sm text-ink-soft underline hover:text-ink"
          >
            Master data &amp; administration
          </button>
        )}
      </div>

      {openTile && (
        <LoginModal
          moduleKey={openTile.key}
          moduleLabel={openTile.label}
          onClose={() => setOpenTile(null)}
        />
      )}
    </main>
  );
}
