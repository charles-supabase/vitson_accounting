/**
 * Lists server entry points that do not appear to check who is calling.
 * Run from the project root:  npx tsx scripts/audit-access.ts
 * It is a text scan (a hint, not proof): read every line it flags.
 */
import fs from "node:fs";
import path from "node:path";

const MARKERS = /(getSession|checkSession|requireModule|requireSuperAdmin|assertCanImport)\s*\(/;
const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const flagged: string[] = [];

// 1. Server Actions: every exported async function must check the session itself.
for (const file of walk(path.join(root, "actions"))) {
  const src = fs.readFileSync(file, "utf8");
  if (!/^\s*["']use server["']/m.test(src)) continue;
  const parts = src.split(/(?=^export\s+async\s+function\s+)/m).slice(1);
  for (const part of parts) {
    const name = /^export\s+async\s+function\s+(\w+)/.exec(part)?.[1] ?? "?";
    if (!MARKERS.test(part)) flagged.push(`ACTION  ${path.relative(root, file)} :: ${name}()`);
  }
}

// 2. Route handlers: each exported HTTP method must check the session.
for (const file of walk(path.join(root, "app")).filter((f) => /[\\/]route\.ts$/.test(f))) {
  const src = fs.readFileSync(file, "utf8");
  if (!MARKERS.test(src)) flagged.push(`ROUTE   ${path.relative(root, file)}`);
}

// 3. Pages: each page.tsx should call requireModule / requireSuperAdmin (the home page is the login screen).
for (const file of walk(path.join(root, "app")).filter((f) => /[\\/]page\.tsx$/.test(f))) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  if (rel === "app/page.tsx") continue;
  const src = fs.readFileSync(file, "utf8");
  if (!MARKERS.test(src)) flagged.push(`PAGE    ${rel}`);
}

if (flagged.length === 0) console.log("Nothing flagged.");
else {
  console.log(`${flagged.length} entry point(s) with no visible session check:\n`);
  for (const f of flagged) console.log("  " + f);
}
