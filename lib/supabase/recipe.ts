import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for the SECOND Supabase project, "vitson-recipe" (sales confirmations, job tickets,
// fabric info, deliveries). Server-only, same rules as lib/supabase/admin.ts.
// It is created on first use, so a missing setting only affects "Populate from Supabase" and not the rest of the app.
//
// Settings (.env.local on the PC, Environment Variables on Vercel; never in the code or the repo):
//   VITSON_RECIPE_SUPABASE_URL        e.g. https://xxxxxxxx.supabase.co   (Project Settings > API > Project URL)
//   VITSON_RECIPE_SERVICE_ROLE_KEY    the service_role key of vitson-recipe (Project Settings > API Keys)

let client: ReturnType<typeof createClient> | null = null;

export function getRecipeClient() {
  if (client) return client;
  const url = process.env.VITSON_RECIPE_SUPABASE_URL;
  const key = process.env.VITSON_RECIPE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "The vitson-recipe connection is not set up: add VITSON_RECIPE_SUPABASE_URL and VITSON_RECIPE_SERVICE_ROLE_KEY to the environment settings."
    );
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
