// Job ticket format A#-#####-#-AA-#  (A = letter, # = digit), e.g. C2-00607-1-BJ-2.
//
// - formatJobTicketInput(): used while typing. Keeps only characters that fit the next position (letter or digit),
//   upper-cases letters and puts the dashes in by itself as soon as each group is complete.
// - displayJobTicket(): used wherever a job ticket is shown. A complete ticket (11 characters) is shown with its
//   dashes; anything else (older tickets in another layout) is shown exactly as stored.

const SEGMENTS = ["ld", "ddddd", "d", "ll", "d"]; // l = letter, d = digit; a dash follows every group but the last

const isDigit = (c: string) => c >= "0" && c <= "9";
const isLetter = (c: string) => /^[A-Za-z]$/.test(c);

/**
 * @param raw     what is in the input box now
 * @param opts.deleting  true when the user is deleting (backspace / cut): no dash is added after a finished group,
 *                       so the dash can be deleted along with the character before it.
 */
export function formatJobTicketInput(raw: string, opts: { deleting?: boolean } = {}): string {
  const chars = String(raw ?? "").replace(/[^A-Za-z0-9]/g, "");
  let out = "";
  let si = 0; // segment
  let pi = 0; // position inside the segment
  for (const ch of chars) {
    if (si >= SEGMENTS.length) break;
    const kind = SEGMENTS[si][pi];
    const ok = kind === "d" ? isDigit(ch) : isLetter(ch);
    if (!ok) continue; // wrong kind of character for this position: ignored
    out += kind === "l" ? ch.toUpperCase() : ch;
    pi++;
    if (pi === SEGMENTS[si].length) {
      si++;
      pi = 0;
      if (si < SEGMENTS.length) out += "-"; // the dash appears as soon as the group is complete
    }
  }
  if (opts.deleting && out.endsWith("-")) out = out.slice(0, -1);
  return out;
}

/** A job ticket for display: a complete ticket gets its dashes, everything else is returned unchanged. */
export function displayJobTicket(stored: string | null | undefined): string {
  const s = String(stored ?? "").trim();
  if (!s) return "";
  const chars = s.replace(/-/g, "");
  if (!/^[A-Za-z]\d{7}[A-Za-z]{2}\d$/.test(chars)) return s;
  const u = chars.toUpperCase();
  return `${u.slice(0, 2)}-${u.slice(2, 7)}-${u.slice(7, 8)}-${u.slice(8, 10)}-${u.slice(10, 11)}`;
}

/** True when the value is a complete job ticket in the A#-#####-#-AA-# format. */
export function isCompleteJobTicket(value: string): boolean {
  return /^[A-Z]\d-\d{5}-\d-[A-Z]{2}-\d$/.test(value);
}
