# Vitson Purchase Order

Requisition → Approval → Purchase Order → Receiving → Plant Receiving → Voucher → Bank/Check → Payment.

## Status

**Phase 3, step 1** of the build: app shell, custom auth (login modal per module,
bcrypt-hashed passwords, signed session cookie), and two of the master-data admin
screens (Suppliers, Items) as a working pattern. The five business modules
(Requisition, Purchase Order, Receiving, Voucher, Bank) currently render a
placeholder page confirming access — their real screens are the next phase of work.

This project was generated in a sandboxed environment with no network access, so it
has **not been run, installed, or built here**. Run it locally before relying on it —
see "First run" below, and report anything that doesn't compile.

## Setup

Requires **Node.js 20 or newer** (Next.js 16 dropped Node 18 support).

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API. Keep this secret; it bypasses RLS.
   - `AUTH_SECRET` — run `openssl rand -hex 32` and paste the result.
3. `npm run dev` and open http://localhost:3000

## First run

Because this hasn't been built/typechecked yet in this environment, do a
`npm run build` first and fix anything it flags before assuming the app is correct —
in particular the Supabase nested-select typings in `app/admin/suppliers/page.tsx`
and `app/admin/items/page.tsx` are typed as `any` for now and worth tightening once
you're generating real types with `supabase gen types typescript`.

## How auth works here

There's no Supabase Auth in use. `tbl_User` holds login names and bcrypt password
hashes; `tbl_User_Module` maps each user to the modules (`requisition`,
`purchase_order`, `receiving`, `voucher`, `bank`) they can open. Clicking a locked
module tile on the dashboard opens a login modal; a successful login sets an
httpOnly, HMAC-signed session cookie (`lib/session.ts`) good for 12 hours. All
database access goes through the service-role Supabase client
(`lib/supabase/admin.ts`), used only in server actions and server components —
never shipped to the browser.

## Database

All migrations so far were applied directly via the Supabase MCP connection, not
tracked as files in this repo yet. Worth setting up the Supabase CLI
(`supabase migration list` / `supabase db pull`) once you're working from VS Code,
so future schema changes are tracked alongside the app code.
