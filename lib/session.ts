import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { COOKIE_NAME, MAX_AGE_SECONDS, decodeSession, encodeSession, type Session } from "./session-token";
import { evaluateAccess, parseOfficeIps, roleFromFlag, type Role } from "./access-policy";
import { getTrustedClientIp } from "./client-ip";

export { encodeSession, decodeSession };
export type { Session };

export type SessionCheck =
  | { ok: true; role: Role; session: Session }
  | {
      ok: false;
      status: 401 | 403 | 503;
      reason: "no_session" | "invalid_session" | "unknown_role" | "office_only" | "lookup_failed";
    };

type Account =
  | { state: "error" }
  | { state: "missing" }
  | { state: "found"; loginName: string; isSuperAdmin: unknown; active: boolean; modules: string[] };

/** One database lookup per request (React cache). The database, not the cookie, decides active/role/modules. */
const loadAccount = cache(async (userId: number): Promise<Account> => {
  const { data: user, error } = await supabaseAdmin
    .from("tbl_User")
    .select("user_login_name, is_super_admin, active")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { state: "error" };
  if (!user) return { state: "missing" };

  const { data: rows, error: moduleError } = await supabaseAdmin
    .from("tbl_User_Module")
    .select("module")
    .eq("user_id", userId);
  if (moduleError) return { state: "error" };

  return {
    state: "found",
    loginName: String(user.user_login_name),
    isSuperAdmin: user.is_super_admin,
    active: user.active === true,
    modules: (rows ?? []).map((r) => String(r.module)),
  };
});

/**
 * The single authorization check. Verifies the signed cookie, re-reads the user from the
 * database (deactivated or demoted users lose access immediately), derives the role from
 * the database, then applies the office IP rule. Fails closed.
 */
export async function checkSession(): Promise<SessionCheck> {
  const store = await cookies();
  const cookieSession = decodeSession(store.get(COOKIE_NAME)?.value);
  if (!cookieSession) return { ok: false, status: 401, reason: "no_session" };

  const account = await loadAccount(cookieSession.userId);
  if (account.state === "error") return { ok: false, status: 503, reason: "lookup_failed" };
  if (account.state === "missing" || !account.active || account.loginName !== cookieSession.loginName) {
    return { ok: false, status: 401, reason: "invalid_session" };
  }

  const decision = evaluateAccess({
    role: roleFromFlag(account.isSuperAdmin),
    clientIp: getTrustedClientIp(await headers()),
    officeIps: parseOfficeIps(process.env.OFFICE_PUBLIC_IP),
  });
  if (!decision.allowed) return { ok: false, status: 403, reason: decision.reason };

  return {
    ok: true,
    role: decision.role,
    session: {
      ...cookieSession,
      isSuperAdmin: decision.role === "admin",
      modules: account.modules,
    },
  };
}

/** Read + fully verify the current session. Returns null unless access is allowed. Existing callers get the new checks automatically. */
export async function getSession(): Promise<Session | null> {
  const check = await checkSession();
  return check.ok ? check.session : null;
}

/** Set the session cookie. Must be called from a server action or route handler. */
export async function setSessionCookie(session: Session) {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
