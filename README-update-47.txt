vitson-update-47 (branch: feature/office-ip-access)
Add to package.json "scripts":   "test:access": "tsx --test tests/access-policy.test.ts"
Changed:  lib/session.ts, lib/auth.ts, actions/auth.ts, lib/receivables-import/guard.ts
New:      lib/session-token.ts, lib/access-policy.ts, lib/client-ip.ts, app/api/access-check/route.ts,
          tests/access-policy.test.ts, scripts/audit-access.ts, docs/office-access.md,
          supabase/migrations/20261012000000_revoke_public_table_grants.sql (NOT applied)
