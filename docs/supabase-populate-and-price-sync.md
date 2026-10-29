# Job Orders: Populate from Supabase + tbl_customer_price sync (update 62)

## 1. New settings (.env.local on the PC and Environment Variables on Vercel)

```
VITSON_RECIPE_SUPABASE_URL=https://<vitson-recipe project ref>.supabase.co
VITSON_RECIPE_SERVICE_ROLE_KEY=<service_role key of vitson-recipe>
```
Server-only. Never use a NEXT_PUBLIC_ prefix. Restart `npm run dev` / redeploy after adding them.

## 2. Webhook: vitson-recipe.tbl_customer_price -> charles-supabase's Project

### 2a. Run in the SQL Editor of charles-supabase's Project

```sql
begin;

create table if not exists public.tbl_customer_price (
  id            bigint primary key,            -- same id as in vitson-recipe
  customer_id   bigint,
  dye_process_id bigint,
  fabric_id     bigint,
  tone_id       bigint,
  unit_price    double precision,
  synced_at     timestamptz not null default now()
);

alter table public.tbl_customer_price enable row level security;
revoke all on table public.tbl_customer_price from anon, authenticated;

commit;
```
(No foreign keys on purpose: a price row must never fail to sync because a customer or tone is missing here.)

### 2b. Edge Function in charles-supabase's Project, name: `sync-customer-price`
Deploy with JWT verification OFF (it is protected by its own secret instead), and add the secret
`WEBHOOK_SECRET` (any long random text) under Edge Functions > Secrets.

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const p = await req.json(); // { type: INSERT | UPDATE | DELETE, record, old_record, ... }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (p.type === "DELETE") {
    const { error } = await db.from("tbl_customer_price").delete().eq("id", p.old_record.id);
    if (error) return new Response(error.message, { status: 500 });
    return new Response("ok");
  }

  const r = p.record;
  const { error } = await db.from("tbl_customer_price").upsert({
    id: r.id,
    customer_id: r.customer_id,
    dye_process_id: r.dye_process_id,
    fabric_id: r.fabric_id,
    tone_id: r.tone_id,
    unit_price: r.unit_price,
    synced_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) return new Response(error.message, { status: 500 });
  return new Response("ok");
});
```

### 2c. Database Webhook in vitson-recipe (Database > Webhooks > Create)
- Table: `tbl_customer_price`, events: Insert, Update, Delete
- Type: HTTP Request, method POST
- URL: `https://xsknxirraveijgvbdfxs.supabase.co/functions/v1/sync-customer-price`
- Header: `x-webhook-secret` = the same value as WEBHOOK_SECRET (plus Content-Type: application/json)

### 2d. Copy the rows that already exist (run in vitson-recipe's SQL Editor)
```sql
update public.tbl_customer_price set unit_price = unit_price;
```
This fires an UPDATE webhook for every existing row.

## 3. How Populate from Supabase decides
- Source rows: vitson-recipe `tbl_Delivery` with date_delivery in the month and copied = false; copied is set to true afterwards.
- Unit price: the ticket's own unit_price; when empty, tbl_customer_price by customer + dye process + fabric + tone (read directly from vitson-recipe); no match = ticket skipped and listed.
- Skipped and listed (nothing is half-copied): missing sales confirmation, customer / dye / fabric / tone not in the app, no color, no delivered rolls.
- Duplicates: access_job_order_link_id and access_sales_id may repeat (they can equal Access ids). job_ticket never duplicates: a ticket already in the app is replaced in place and listed under "Changed records"; two job orders with the same ticket in one run are not both copied.
- The app keeps one delivery per job order: if a job order has several uncopied deliveries in the month, the latest is copied and the others are listed and stay uncopied.
