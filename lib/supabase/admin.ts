import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. This bypasses RLS entirely and must NEVER be imported
// into a client component or exposed to the browser. It is used exclusively
// inside server actions and server components. The `server-only` import above
// makes the build fail loudly if this file is ever pulled into client code.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
