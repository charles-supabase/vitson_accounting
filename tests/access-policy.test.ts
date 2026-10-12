import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIp, getTrustedClientIp } from "../lib/client-ip";
import { evaluateAccess, parseOfficeIps, roleFromFlag } from "../lib/access-policy";
import { decodeSession, encodeSession, MAX_AGE_SECONDS, type Session } from "../lib/session-token";

// Documentation-only addresses (RFC 5737 / RFC 3849). The real office IP is never in the repo.
const OFFICE = "203.0.113.10";
const OTHER = "198.51.100.7";
const OFFICE_V6 = "2001:db8::10";

const office = parseOfficeIps(OFFICE);
const h = (map: Record<string, string>) => ({ get: (k: string) => map[k.toLowerCase()] ?? null });
const VERCEL = { VERCEL: "1" } as Record<string, string | undefined>;

test("admin is allowed outside and inside the office, even with no IP", () => {
  assert.equal(evaluateAccess({ role: "admin", clientIp: OTHER, officeIps: office }).allowed, true);
  assert.equal(evaluateAccess({ role: "admin", clientIp: OFFICE, officeIps: office }).allowed, true);
  assert.equal(evaluateAccess({ role: "admin", clientIp: null, officeIps: new Set() }).allowed, true);
});

test("regular user: office IP allowed, any other IP denied", () => {
  assert.equal(evaluateAccess({ role: "user", clientIp: OFFICE, officeIps: office }).allowed, true);
  const r = evaluateAccess({ role: "user", clientIp: OTHER, officeIps: office });
  assert.deepEqual(r, { allowed: false, reason: "office_only" });
});

test("regular user: missing, malformed or untrusted IP is denied", () => {
  for (const ip of [null, "", "not-an-ip", "203.0.113.10, 198.51.100.7", "203.0.113.010", "203.0.113.10:443"]) {
    assert.equal(evaluateAccess({ role: "user", clientIp: ip, officeIps: office }).allowed, false, String(ip));
  }
});

test("regular user is denied when OFFICE_PUBLIC_IP is unset or invalid", () => {
  for (const raw of [undefined, "", "   ", "garbage", "0.0.0.0/0", "*"]) {
    assert.equal(evaluateAccess({ role: "user", clientIp: OFFICE, officeIps: parseOfficeIps(raw) }).allowed, false, String(raw));
  }
});

test("unknown roles are denied", () => {
  for (const role of [undefined, null, "", "superuser", "ADMIN", "Admin", 1, true, {}]) {
    const r = evaluateAccess({ role, clientIp: OFFICE, officeIps: office });
    assert.deepEqual(r, { allowed: false, reason: "unknown_role" }, String(role));
  }
  assert.equal(roleFromFlag(true), "admin");
  assert.equal(roleFromFlag(false), "user");
  for (const v of [null, undefined, "true", 1, 0, "admin"]) assert.equal(roleFromFlag(v), null, String(v));
});

test("no environment variable creates a bypass", () => {
  const before = { ...process.env };
  process.env.NODE_ENV = "development";
  process.env.BYPASS_OFFICE_IP = "1";
  process.env.SKIP_IP_CHECK = "true";
  assert.equal(evaluateAccess({ role: "user", clientIp: OTHER, officeIps: office }).allowed, false);
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": OFFICE }), process.env), null);
  process.env = before as NodeJS.ProcessEnv;
});

test("IP normalisation and safe comparison", () => {
  assert.equal(normalizeIp(" 203.0.113.10 "), "203.0.113.10");
  assert.equal(normalizeIp("::ffff:203.0.113.10"), "203.0.113.10");
  assert.equal(normalizeIp("2001:DB8:0:0:0:0:0:10"), "2001:db8:0:0:0:0:0:10");
  assert.equal(normalizeIp("2001:db8::10"), "2001:db8:0:0:0:0:0:10");
  assert.equal(normalizeIp("::1"), "0:0:0:0:0:0:0:1");
  for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "1.2.3.4/24", "fe80::1%eth0", "[2001:db8::10]", "2001:db8::10::1", "a, b", 5, null, undefined]) {
    assert.equal(normalizeIp(bad), null, String(bad));
  }
  // an IPv6 office address matches however the client writes it
  const v6 = parseOfficeIps(`${OFFICE}, ${OFFICE_V6}`);
  assert.equal(evaluateAccess({ role: "user", clientIp: "2001:0db8:0000:0000:0000:0000:0000:0010", officeIps: v6 }).allowed, true);
  assert.equal(evaluateAccess({ role: "user", clientIp: "2001:db8::11", officeIps: v6 }).allowed, false);
});

test("trusted client IP: only on Vercel, only one consistent valid address", () => {
  assert.equal(getTrustedClientIp(h({ "x-vercel-forwarded-for": OFFICE }), VERCEL), OFFICE);
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": OFFICE }), VERCEL), OFFICE);
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": OFFICE, "x-vercel-forwarded-for": OFFICE }), VERCEL), OFFICE);
  assert.equal(getTrustedClientIp(h({}), VERCEL), null);
});

test("forged headers cannot bypass the restriction", () => {
  // not on Vercel (local start, other host): headers are never trusted
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": OFFICE, "x-real-ip": OFFICE, "x-vercel-forwarded-for": OFFICE }), {}), null);
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": OFFICE }), { VERCEL: "0" }), null);
  // on Vercel: lists, disagreeing headers and junk are rejected
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": `${OFFICE}, ${OTHER}` }), VERCEL), null);
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": `${OTHER}, ${OFFICE}` }), VERCEL), null);
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": OFFICE, "x-vercel-forwarded-for": OTHER }), VERCEL), null);
  assert.equal(getTrustedClientIp(h({ "x-forwarded-for": "garbage" }), VERCEL), null);
  // other client-set headers are ignored entirely
  assert.equal(getTrustedClientIp(h({ "x-real-ip": OFFICE, "cf-connecting-ip": OFFICE, forwarded: `for=${OFFICE}` }), VERCEL), null);
});

process.env.AUTH_SECRET = "unit-test-secret-not-used-anywhere-else";
const now = () => Math.floor(Date.now() / 1000);
const base: Session = { userId: 7, loginName: "juan", isSuperAdmin: false, modules: ["bank"], iat: now() };

test("session token: valid round trip", () => {
  assert.deepEqual(decodeSession(encodeSession(base)), base);
});

test("session token: unauthenticated / tampered / invalid tokens are rejected", () => {
  assert.equal(decodeSession(undefined), null);
  assert.equal(decodeSession(""), null);
  assert.equal(decodeSession("garbage"), null);
  const token = encodeSession(base);
  const [payload, sig] = token.split(".");
  // self-promotion: edit the payload to isSuperAdmin:true but keep the old signature
  const forged = Buffer.from(JSON.stringify({ ...base, isSuperAdmin: true })).toString("base64url");
  assert.equal(decodeSession(`${forged}.${sig}`), null);
  assert.equal(decodeSession(`${payload}.${"0".repeat(sig.length)}`), null);
  assert.equal(decodeSession(`${payload}.${sig}.extra`), null);
  assert.equal(decodeSession(`${payload}.`), null);
  // signed with a different secret
  process.env.AUTH_SECRET = "another-secret";
  const other = encodeSession(base);
  process.env.AUTH_SECRET = "unit-test-secret-not-used-anywhere-else";
  assert.equal(decodeSession(other), null);
});

test("session token: expired, future-dated and wrongly shaped sessions are rejected", () => {
  assert.equal(decodeSession(encodeSession({ ...base, iat: now() - MAX_AGE_SECONDS - 5 })), null);
  assert.equal(decodeSession(encodeSession({ ...base, iat: now() + 3600 })), null);
  for (const bad of [
    { ...base, modules: "bank" },
    { ...base, isSuperAdmin: "true" },
    { ...base, userId: "7" },
    { ...base, loginName: 5 },
    { ...base, iat: "now" },
    null,
  ]) {
    assert.equal(decodeSession(encodeSession(bad as unknown as Session)), null, JSON.stringify(bad));
  }
});
