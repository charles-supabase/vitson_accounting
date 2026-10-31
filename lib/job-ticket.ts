// Job ticket format A#-#####-#-AA-#  (A = letter or digit, # = digit), e.g. C2-00607-1-BJ-2 or 76-87686-7-BJ-1.
// Only the first part, A#-#####, is required. The rest (-#, -AA, -#) may be left out, e.g. C2-00607 or C2-00607-1.
//
// - formatJobTicketInput(): used while typing. Keeps only characters that fit the next position, upper-cases letters
//   and puts the dashes in by itself as soon as each group is complete.
// - displayJobTicket(): used wherever a job ticket is shown. A ticket in this format gets its dashes; anything else
//   (older tickets in another layout) is shown exactly as stored.
// - isValidJobTicket(): true when at least A#-##### is there and everything typed fits the format.

const SEGMENTS = ["ad", "ddddd", "d", "aa", "d"]; // a = letter or digit, d = digit; a dash follows every group but the last
const REQUIRED_CHARS = 7; // A#-#####

const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlnum = (c: string) => /^[A-Za-z0-9]$/.test(c);

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
    const ok = kind === "d" ? isDigit(ch) : isAlnum(ch);
    if (!ok) continue; // wrong kind of character for this position: ignored
    out += ch.toUpperCase();
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

/** The ticket with dashes when every character fits the format and the required A#-##### is there; otherwise null. */
function strictFormat(value: string): string | null {
  const chars = String(value ?? "").replace(/-/g, "");
  if (chars.length < REQUIRED_CHARS) return null;
  const formatted = formatJobTicketInput(chars, { deleting: true });
  return formatted.replace(/-/g, "").length === chars.length ? formatted : null;
}

/** A job ticket for display: one in this format gets its dashes, everything else is returned unchanged. */
export function displayJobTicket(stored: string | null | undefined): string {
  const s = String(stored ?? "").trim();
  if (!s) return "";
  return strictFormat(s) ?? s;
}

/** True when the value has at least the required A#-##### and everything in it fits the format. */
export function isValidJobTicket(value: string | null | undefined): boolean {
  return strictFormat(String(value ?? "").trim()) !== null;
}

export const isCompleteJobTicket = isValidJobTicket;
