/** TIN numbers are stored and typed as digits only; they are shown with a "-" after every 3 digits (123-456-789-000). */

/** Digits only, at most 15 (the limit used by the Aliases page). */
export function tinDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 15);
}

/** "123456789000" -> "123-456-789-000". Anything that is not a digit is ignored. */
export function formatTin(value: unknown): string {
  const digits = tinDigits(value);
  return digits.match(/.{1,3}/g)?.join("-") ?? "";
}
