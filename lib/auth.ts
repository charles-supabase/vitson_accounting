import "server-only";
import { redirect } from "next/navigation";
import { checkSession, type Session } from "./session";
import type { ModuleKey } from "./modules";

/** Use at the top of a module's page.tsx / layout.tsx. Redirects home if not logged in, outside the office (regular users) or lacking access. */
export async function requireModule(moduleKey: ModuleKey): Promise<Session> {
  const check = await checkSession();
  if (!check.ok) {
    if (check.reason === "no_session" || check.reason === "invalid_session") redirect(`/?next=${moduleKey}`);
    redirect("/?error=forbidden");
  }
  if (!check.session.isSuperAdmin && !check.session.modules.includes(moduleKey)) {
    redirect("/?error=forbidden");
  }
  return check.session;
}

/** Use at the top of admin pages. Redirects home if not logged in or not a super admin. */
export async function requireSuperAdmin(): Promise<Session> {
  const check = await checkSession();
  if (!check.ok) {
    if (check.reason === "no_session" || check.reason === "invalid_session") redirect("/?next=admin");
    redirect("/?error=forbidden");
  }
  if (!check.session.isSuperAdmin) redirect("/?error=forbidden");
  return check.session;
}
