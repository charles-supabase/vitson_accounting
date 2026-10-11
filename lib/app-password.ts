import "server-only";
import { timingSafeEqual } from "crypto";
import { compare } from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Checks a typed password against the value kept in tbl_App_Settings (setting_key / setting_value).
 * The value can be a bcrypt hash (the safe way) or, as it is in the database today, the plain password.
 * The keys are tried in order and the first one that exists is used, so a feature can have its own
 * password and fall back to a shared one.
 */
export async function verifyAppPassword(
  keys: string[],
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password) return { ok: false, error: "Enter the password." };

  for (const key of keys) {
    const { data, error } = await supabaseAdmin
      .from("tbl_App_Settings")
      .select("setting_value")
      .eq("setting_key", key)
      .maybeSingle();

    if (error) return { ok: false, error: "Could not check the password. Try again." };
    const stored = (data as { setting_value?: string } | null)?.setting_value;
    if (!stored) continue;

    let match: boolean;
    if (/^\$2[abxy]\$/.test(stored)) {
      // pgcrypto writes $2a$ hashes; normalise the other bcrypt prefixes so the library accepts them
      match = await compare(password, stored.replace(/^\$2[bxy]\$/, "$2a$"));
    } else {
      // plain-text value
      const a = Buffer.from(password);
      const b = Buffer.from(stored.trim());
      match = a.length === b.length && timingSafeEqual(a, b);
    }
    return match ? { ok: true } : { ok: false, error: "Incorrect password." };
  }

  return { ok: false, error: `No password is set yet (${keys[0]}). Ask a super admin to set it.` };
}
