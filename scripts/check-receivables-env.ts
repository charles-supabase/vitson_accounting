// Run with: npm run check-env
// Loads .env.local the same way Next.js does and reports what the server will see.
// It never prints secret values.
import { describeKeyProblem, resolvePrivateKey } from "../lib/receivables-import/googleKey";

async function main() {
  try {
    const mod: any = await import("@next/env");
    const loadEnvConfig = mod.loadEnvConfig ?? mod.default?.loadEnvConfig;
    loadEnvConfig(process.cwd(), true);
  } catch {
    console.log("(Could not load @next/env; using the current environment only.)");
  }

  const present = (name: string) => (process.env[name]?.trim() ? "set" : "MISSING");

  console.log("Working folder:", process.cwd());
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SPREADSHEET_ID",
    "GOOGLE_SHEET_NAME",
  ]) {
    console.log(`${name}: ${present(name)}`);
  }

  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  console.log(`GOOGLE_PRIVATE_KEY: ${present("GOOGLE_PRIVATE_KEY")}`);
  console.log(`GOOGLE_PRIVATE_KEY_BASE64: ${present("GOOGLE_PRIVATE_KEY_BASE64")}`);
  console.log(
    `  raw value: ${rawKey.length} characters, ${(rawKey.match(/\n/g) || []).length} real line breaks, ` +
      `${(rawKey.match(/\\n/g) || []).length} literal "\\n" sequences`,
  );

  const problem = describeKeyProblem(resolvePrivateKey());
  console.log(problem ? `\nPRIVATE KEY PROBLEM: ${problem}` : "\nPrivate key: OK (parses correctly)");
  if (problem) process.exitCode = 1;
}

void main();
