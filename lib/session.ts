import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

export type Session = {
  userId: number;
  loginName: string;
  isSuperAdmin: boolean;
  modules: string[]; // e.g. ["requisition", "bank"]
  iat: number; // seconds since epoch
};

const COOKIE_NAME = "vitson_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hour session

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing AUTH_SECRET environment variable. Generate one with: openssl rand -hex 32"
    );
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const session: Session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() / 1000 - session.iat > MAX_AGE_SECONDS) return null;
    return session;
  } catch {
    return null;
  }
}

/** Read + verify the current session from the request cookies. Server-side only, async since Next.js 15+. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return decodeSession(token);
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
