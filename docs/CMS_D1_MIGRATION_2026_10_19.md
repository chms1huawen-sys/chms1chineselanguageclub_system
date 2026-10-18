# Article CMS Migration

Status: D1 activated on2026-10-19 (Malaysia). All124CMS records verified against
the frozen original source. The public R2 snapshot reports cmsRevision1 with13
published posts; original-photo fields are absent. Browser connection failed
during final UI validation, so a real teacher/media click/upload check remains.

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

## Live Cutover Evidence

- Database c8bc5c2c-6f71-45bf-a938-3d80a7271443 (chms1clc-articles), APAC.
- All124record payloads and keys matched SHA-256:
  0a0f12f36e43f2cea5c694051430d0819944479e2743b8c0953866691356e6c5.
- A second Supabase export after write freeze was byte-identical to the imported
  source. No article state, text, media record or original object was deleted.
- Supabase provider flag is cloudflare-d1; all10legacy CMS tables have the write
  guard. Live function definition excludes chairperson and includes media roles.
- D1 storage after import:372736bytes (about0.36MiB), including CMS metadata.
- Anonymous admin POST returned401; public D1 source and filtered R2 snapshot
  returned200, revision1,13published posts and87media rows with no original paths.
- Deployment commits fc8e6fe and ccd5d5b were pushed. Vercel served the new entry
  bundle and explicit Cloudflare connect CSP. Latest Worker version is recorded
  in the deployment tool output; do not infer a deployment from Git alone.
-54focused tests passed before activation, followed by additional direct-R2
  upload/private-read/delete-boundary and small-image copy regressions.
- No live article edits, deletions, publications, account changes or real photo
  uploads were performed to manufacture an acceptance result.

## Remaining Boundaries

- New image bytes travel through the authenticated Cloudflare Worker into R2,
  not Supabase Storage. This is not a public bucket or a browser-held R2 key.
- Existing Supabase objects remain as historical originals/fallbacks; do not
  delete them until a separate complete media/archive migration is authorized.
- Login and per-request role verification still depend on Supabase Auth/users.
- The existing3MiB public bundle guard remains; split generated exports before
  significant future content growth. D1 storage capacity does not remove it.
- Independent cloud backup and a full recovery drill remain deferred by owner.
  D1 is now part of the required future backup/restore scope.
