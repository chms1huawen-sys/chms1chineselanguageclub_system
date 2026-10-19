# Promotion Readiness Check

Observed on 2026-10-19, Malaysia time. This is not a guarantee of capacity.

## Bounded Public Test

- Script: scripts/check-public-burst.mjs. Public GET requests only, no login,
  writes, origin redirects or social publishing. Stops on failure or byte limit.
- 24 requests with concurrency 4, capped at 4 MiB decoded bodies. All returned200.
- Decoded bodies:818769bytes. Median122ms; sample95th percentile655ms.
- Six public sections, public snapshot and favicon were included.
- A separate public image check returned200 with ETag and private max-age30;
  If-None-Match returned304 with zero body bytes.
- Public HTML/snapshot use no-store deliberately to preserve prompt withdrawal.
  Do not apply long shared caches without testing hidden-content removal again.
- Ignored detailed evidence: test-results/public-burst-20261019.json.
- This single-client sample does not establish maximum concurrent visitors,
  geographic latency, sustained load capacity or exact billable wire egress.

## Live Dashboard Observations

- Workers:2788requests today of100000; billable usage currently$0.00.
- R2:187objects,16.73MB; current period Oct15-Nov15. ClassA2.73k,
  ClassB17.26k; billable usage currently$0.00. Dashboards may lag.
- Supabase billing period Sep24-Oct24: uncached egress8.155/5GB(163%),
  cached egress0.279/5GB. Period-average Storage0.229/1GB; Database summary
  0.092/0.5GB, with current project database size87.33MB.
- Supabase still displays an egress grace-period warning: restrictions may
  apply from Oct30 if the organization remains above quota, returning402.
  Public R2 pages working does not eliminate Auth/member/CMS dependencies.
  Moving files does not subtract historical egress already consumed.
- No paid plan, billing setting, access policy or automatic monitor was changed.

## Social Links And Remaining Work

- Instagram public profile currently advertises goo.su/Lkvi. Its final target
  was not verified; do not call it an old-site link without following it.
- Facebook public Intro displays email and Instagram, not chms1clc.org.
- Both social sites were signed out. No profile was modified or post sent.
  A page administrator should set the website field to https://chms1clc.org/.
- Keep the two acceptance records private: one draft with an uploaded photo,
  one text-only hidden publication test. Neither was deleted in this check.
- New full backups, independent cloud backup and restore drill remain deferred
  by the owner. Supabase quota risk is unresolved, not an all-clear for promotion.
