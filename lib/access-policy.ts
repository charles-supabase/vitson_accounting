import { normalizeIp } from "./client-ip";

/**
 * The office rule, as pure functions:
 *   admin  -> allowed from anywhere
 *   user   -> allowed only when the verified client IP is one of OFFICE_PUBLIC_IP
 *   anything else (unknown role, missing/malformed IP, unset OFFICE_PUBLIC_IP) -> denied
 * There is deliberately no environment switch that bypasses this.
 */

export type Role = "admin" | "user";

export type PolicyResult =
  | { allowed: true; role: Role }
  | { allowed: false; reason: "unknown_role" | "office_only" };

/** OFFICE_PUBLIC_IP: one address, or several separated by commas (e.g. an IPv4 and an IPv6). Invalid entries are ignored, never treated as wildcards. */
export function parseOfficeIps(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const ip = normalizeIp(part);
    if (ip) out.add(ip);
  }
  return out;
}

/** Role comes only from the database flag tbl_User.is_super_admin; anything that is not a real boolean is denied. */
export function roleFromFlag(isSuperAdmin: unknown): Role | null {
  if (isSuperAdmin === true) return "admin";
  if (isSuperAdmin === false) return "user";
  return null;
}

export function evaluateAccess(input: {
  role: unknown;
  clientIp: string | null;
  officeIps: Set<string>;
}): PolicyResult {
  if (input.role === "admin") return { allowed: true, role: "admin" };
  if (input.role === "user") {
    const ip = normalizeIp(input.clientIp);
    if (ip !== null && input.officeIps.has(ip)) return { allowed: true, role: "user" };
    return { allowed: false, reason: "office_only" };
  }
  return { allowed: false, reason: "unknown_role" };
}
