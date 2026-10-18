# Article CMS Migration

Status: staged; do not claim cutover until the live checks below are recorded.

## Boundaries

- Article records, all statuses, taxonomy, links, media metadata, settings and
  content-year locks move to the dedicated Cloudflare D1 database.
- Member profiles, authentication, finance, attendance, tasks and push stay in
  Supabase. Existing photo objects remain intact for compatibility and rollback.
- New article/site images use authenticated Cloudflare uploads into private R2,
  with MIME signature, dimensions, size and per-account upload rate checks.
  Limits:10MiB per image,120authenticated requests/uploads per minute and512MiB
  of image bytes per actor per UTC day. File contents do not pass through Supabase.
- Public pages continue to read the filtered R2 snapshot, not draft CMS records.
- Entry is inside Executive Management alongside Finance/Inventory. No public
  gear. Only active teachers and media roles, with no explicit revocation, can
  use the entry or API; chair/vice-chair and custom overrides cannot bypass it.
- Supabase legacy blog_manager is narrowed to the same roles. A provider flag
  rejects legacy CMS writes after cutover without deleting the original data.

## Checked Before Cutover

- 16 posts (13 published, 3 trash), 87 photo rows, 15 categories, 1 tag,
  3 years, 1 settings row, 1 link; 124 total CMS records in the initial export.
- D1 import stays inactive until every record is compared by SHA-256 and count.
- Version conflicts, archive locks, original-photo exclusion, role restrictions,
  old-write freeze and existing media/SSR/security regressions are tested.
- No real article has been edited, deleted, hidden or published by the agent.

## Activation Order

1. Deploy the new Worker/API and backward-compatible frontend/source publisher.
2. Apply supabase_migration_2026_10_18_blog_d1_cutover.sql.
3. Set the legacy provider flag to cloudflare-d1, then export the final source.
4. Prepare/import the inactive D1 data; compare every record and source again.
5. Activate D1; refresh the generated public snapshot and verify published URLs,
   denied anonymous/admin access, member compatibility and role-gated navigation.
6. Retain the original tables/objects. Do not reopen old writes as a casual
   rollback: first export any new D1 edits and reconcile the current source.

Private migration JSON/SQL files are ignored working artifacts in test-results.
They must never be committed, copied into the public runtime or uploaded publicly.
