# Execution Approval And Dual-Environment Review

- Before executing a task, restate its actions, affected environments and verification scope to the user. Wait for explicit confirmation. Stay within that approved scope; ask again for materially different actions.
- There are TWO production environments. Never validate only one and report the entire system healthy:
  - Cloudflare: https://chms1clc.org (public website, Worker, D1 and R2).
  - Vercel + Supabase: https://chms1chineselanguageclubsystem.vercel.app (membership, authentication, private workflows and database permissions).
- After a release, run `node scripts/check-runtime-assets.mjs` and `node scripts/check-production.mjs`. Review the actual mobile and desktop public navigation, member entry and privacy controls. Check the member login page and relevant authorization tests.
- A public HTML 200 response is NOT proof that the app works. Verify its entry module, lazy modules and styles. Vercel builds can change filenames referenced by the Cloudflare snapshot.
- Preserve the user consent requirement, preview analytics exclusion, private-route noindex and existing role permissions. Do not use real member, leave or finance records as disposable test data.
- Report Cloudflare and Vercel/Supabase results separately, including anything not verified. Do not claim a logged-in workflow passed when only a login page or automated fixture was checked.
