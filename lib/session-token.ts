import crypto from "node:crypto";

/** Signed cookie token (HMAC-SHA256). No server-only import so it can be unit tested. */

export type Session = {
  userId: number;
  loginName: string;
  isSuperAdmin: boolean;
  modules: string[]; // e.g. ["requisition", "bank"]
  iat: number; // seconds since epoch
};

export const COOKIE_NAME = "vitson_session";
export const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hour session
const CLOCK_SKEW_SECONDS = 5 * 60;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET environment variable. Generate one with: openssl rand -hex 32");
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function isValidShape(s: any): s is Session {
  return (
    s !== null &&
    typeof s === "object" &&
    Number.isSafeInteger(s.userId) &&
    typeof s.loginName === "string" &&
    typeof s.isSuperAdmin === "boolean" &&
    Array.isArray(s.modules) &&
    s.modules.every((m: unknown) => typeof m === "string") &&
    Number.isFinite(s.iat)
  );
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(sign(payload));
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isValidShape(session)) return null;
    const age = Date.now() / 1000 - session.iat;
    if (age > MAX_AGE_SECONDS || age < -CLOCK_SKEW_SECONDS) return null;
    return session;
  } catch {
    return null;
  }
}
