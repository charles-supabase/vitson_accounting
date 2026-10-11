/**
 * tbl_Alias.associated_customer is TEXT: the CUSTOMER NUMBERS (tbl_Customer.customer_no) of the customers linked to an
 * alias, separated by commas, e.g. "38,98,99". They are compared as whole numbers without leading zeros ("008" = 8),
 * the same way the job order import compares customer codes, and an Access numAlias is one of these numbers.
 * These helpers are the one place that reads and writes the text.
 */

/** "38, 98,99" -> [38, 98, 99]. Anything that is not a whole number is ignored; duplicates are dropped. */
export function parseCustomerNos(text: string | null | undefined): number[] {
  const out: number[] = [];
  for (const part of String(text ?? "").split(",")) {
    const t = part.trim();
    if (!/^\d+$/.test(t)) continue;
    const n = Number(t);
    if (Number.isSafeInteger(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** [99, 8, 98, 8] -> "8,98,99" (unique, ascending, comma separated, no spaces). */
export function formatCustomerNos(nos: number[]): string {
  return Array.from(new Set(nos)).sort((a, b) => a - b).join(",");
}

/** True when the number is one of the whole numbers in the text ("1" is NOT found in "11,21"). */
export function aliasLinksCustomer(text: string | null | undefined, customerNo: number): boolean {
  return parseCustomerNos(text).includes(customerNo);
}

/** tbl_Customer.customer_no as a number: leading zeros dropped ("008" -> 8); null when it is not a whole number. */
export function customerNoToNumber(customerNo: string | null | undefined): number | null {
  const t = String(customerNo ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
