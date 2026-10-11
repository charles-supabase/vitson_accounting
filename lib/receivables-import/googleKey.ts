import { createPrivateKey } from "node:crypto";

/**
 * Turns whatever was stored in the environment into a proper PEM string:
 * strips wrapping quotes, converts literal "\n" sequences to real newlines,
 * and removes carriage returns.
 */
export function normalizePrivateKey(raw: unknown): string {
  let key = String(raw ?? "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");
  return key.trim() ? `${key.trim()}\n` : "";
}

/**
 * Reads the key from GOOGLE_PRIVATE_KEY_BASE64 (preferred, immune to quoting
 * and newline problems) or GOOGLE_PRIVATE_KEY.
 */
export function resolvePrivateKey(env: Record<string, string | undefined> = process.env): string {
  const b64 = env.GOOGLE_PRIVATE_KEY_BASE64?.trim();
  if (b64) return normalizePrivateKey(Buffer.from(b64, "base64").toString("utf8"));
  return normalizePrivateKey(env.GOOGLE_PRIVATE_KEY);
}

/** Returns null if the key is usable, otherwise a short description. Never includes key material. */
export function describeKeyProblem(pem: string): string | null {
  if (!pem) return "the key is empty";
  if (!pem.includes("-----BEGIN PRIVATE KEY-----") || !pem.includes("-----END PRIVATE KEY-----")) {
    return "the key does not contain the -----BEGIN PRIVATE KEY----- / -----END PRIVATE KEY----- lines";
  }
  try {
    createPrivateKey(pem);
    return null;
  } catch {
    return "the key text cannot be parsed (it is probably incomplete or altered while copying)";
  }
}
