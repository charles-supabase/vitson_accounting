import "server-only";
import { redirect } from "next/navigation";
import { getSession, type Session } from "./session";
import type { ModuleKey } from "./modules";

/** Use at the top of a module's page.tsx / layout.tsx. Redirects home if not logged in or lacking access. */
export async function requireModule(moduleKey: ModuleKey): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/?next=${moduleKey}`);
  if (!session.isSuperAdmin && !session.modules.includes(moduleKey)) {
    redirect("/?error=forbidden");
  }
  return session;
}

/** Use at the top of admin pages. Redirects home if not logged in or not a super admin. */
export async function requireSuperAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/?next=admin");
  if (!session.isSuperAdmin) redirect("/?error=forbidden");
  return session;
}
