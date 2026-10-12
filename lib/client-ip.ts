import net from "node:net";

/**
 * Client IP helpers. Pure functions (no server-only import) so they can be unit tested.
 *
 * Trust model: on Vercel the edge network overwrites X-Forwarded-For (and sets
 * X-Vercel-Forwarded-For to the same value), so a visitor cannot forge them.
 * Anywhere else (local `npm run start`, another host, a proxy in front of Vercel)
 * we have no trusted source, so we return null and regular users are denied.
 */

const V4_OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const V4_RE = new RegExp(`^${V4_OCTET}(\\.${V4_OCTET}){3}$`);

function normalizeV4(value: string): string | null {
  return V4_RE.test(value) ? value : null; // no leading zeros, no spaces
}

function normalizeV6(value: string): string | null {
  if (value.includes("%")) return null; // zone ids are not public addresses
  if (!net.isIPv6(value)) return null;
  let s = value.toLowerCase();

  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = normalizeV4(tail);
    if (!v4) return null;
    const [a, b, c, d] = v4.split(".").map(Number);
    s = `${s.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is the same client as the plain IPv4 address.
  if (nums.slice(0, 5).every((n) => n === 0) && nums[5] === 0xffff) {
    return `${nums[6] >> 8}.${nums[6] & 255}.${nums[7] >> 8}.${nums[7] & 255}`;
  }
  return nums.map((n) => n.toString(16)).join(":");
}

/** Canonical text form of one IP address, or null if the value is not exactly one valid IP. */
export function normalizeIp(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value || value.length > 45) return null;
  if (value.includes(":")) return normalizeV6(value);
  return normalizeV4(value);
}

type HeaderReader = { get(name: string): string | null };

/**
 * The client IP as seen by Vercel, or null when it cannot be trusted:
 * not running on Vercel, header missing, malformed, a list of several addresses,
 * or the two Vercel headers disagree.
 */
export function getTrustedClientIp(
  headers: HeaderReader,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.VERCEL !== "1") return null;
  const raw = [headers.get("x-vercel-forwarded-for"), headers.get("x-forwarded-for")].filter(
    (v): v is string => v !== null,
  );
  if (raw.length === 0) return null;
  const parsed = raw.map(normalizeIp);
  if (parsed.some((p) => p === null)) return null;
  if (new Set(parsed).size !== 1) return null;
  return parsed[0];
}
