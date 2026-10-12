# Office-only access (Vercel)

Rule: **admin = anywhere; regular user = only from the office IP; everything else denied.**

## How it works
- Login stays custom (HMAC-signed cookie `vitson_session`, bcrypt passwords checked by `verify_user_login`). Nothing was replaced.
- `lib/session.ts > checkSession()` is the single check: verify cookie signature/expiry, re-read the user from `tbl_User`
  (must exist, `active`, same login name), derive the role from `tbl_User.is_super_admin` (never from the cookie), then apply the IP rule.
  `getSession()`, `requireModule()`, `requireSuperAdmin()` and the AR import route all go through it, so every existing caller is covered.
- Modules are also re-read from `tbl_User_Module` on each request, so removing a module or deactivating a user takes effect immediately.
- Login (`actions/auth.ts`) applies the same rule, so an outside regular user is stopped at sign-in.
- API routes get 401 (no/invalid session), 403 (not allowed), 503 (user lookup failed). Fail closed on any doubt.

## Client IP (trust model)
- Read only on Vercel (`VERCEL=1`): `x-vercel-forwarded-for` / `x-forwarded-for`, which Vercel overwrites at its edge.
- Rejected (regular users denied): not on Vercel, header missing, malformed, a list of several IPs, or the two headers disagree.
- Not supported: any proxy/CDN (e.g. Cloudflare) in front of Vercel; the app would see the proxy's IP. Remove the proxy or ask for a redesign.
- Local `npm run start` is not Vercel, so **regular users cannot sign in locally**; admins can. Test regular users on a Vercel preview.

## Environment variables
| Name | Where | Notes |
|---|---|---|
| `OFFICE_PUBLIC_IP` | Vercel (server-only, no `NEXT_PUBLIC_`) | One IP, or several separated by commas (e.g. IPv4 and IPv6). Unset/invalid = regular users denied. |
| `AUTH_SECRET` | Vercel | Use a different value per environment. |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Names are as assumed in the handoff. |
| Google vars | Vercel | As in docs/receivables-import.md. |

Preview deployments: set their own `OFFICE_PUBLIC_IP`; do not reuse the production service-role key or `AUTH_SECRET` unless you accept that previews act on production data.

## Checking what Vercel sees
Sign in as an admin from the office and open `/api/access-check`. It shows the detected IP, whether it is IPv4 or IPv6 and whether it matches (it never prints the configured value).

## Tests
`npm run test:access` (pure logic: roles, IP parsing, forged headers, token tampering/expiry). `npx tsx scripts/audit-access.ts` lists server actions, routes and pages with no visible session check (login/logout are expected).
