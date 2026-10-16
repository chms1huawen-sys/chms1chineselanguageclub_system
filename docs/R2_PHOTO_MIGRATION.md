# R2 photo migration preparation

The later public snapshot rollout replaces per-view Supabase checks for eligible
published R2 hits. See `PUBLIC_SITE_CLOUDFLARE.md` for the current authorization,
cache/withdrawal window, rollback and deployment boundaries. The results below
describe the initial photo-only migration.

Status (2026-10-16): first deployment and transfer verified on the production domain.
All 86 images / 14,528,085 bytes passed destination size, MIME and SHA-256 checks.
The owner created the private bucket and saved four server-only R2 variables in
Vercel Production. No source deletion or database rewrite.

## Verified rollout results

- Initial commit `d38a8be` pushed to `main`; the production API returned provider=r2
  and verification data. GitHub-triggered deployment worked without a Pro upgrade.
- `backups/r2-photos-result-20261016.json` (ignored, local only) completed with 86
  unique verified image keys, zero transfer/checksum failures. All are blog-photos;
  the inventory contained no current blog-site-media references.
- Homepage, literature, bookroom and about HTTP responses were 200. The first three
  contained the new image gateway in server-rendered content. About had no matching
  current Storage image. No R2 secret names appeared in these HTML responses or
  the client build assets.
- Live receipt, avatar and nonexistent-photo gateway probes returned 404 without
  a redirect. Published-to-hidden transitions, R2 outage fallback and new eligible
  target behavior are covered by unit mocks, not by modifying production content.
- Production build, targeted lint, 26 related tests and 30 security tests passed;
  secret scan found no working-tree, history or exposed-environment credentials.
- Browser-based desktop/mobile visual QA could not run: the browser connector still
  fails to initialize its request-header policy (403). No alternate browser security
  bypass or live account/session extraction was used. Phone rendering and a real
  newly published upload should still receive owner acceptance testing.

## Delivery and rollout

- `/api/blog-media` always authorizes with the existing ANONYMOUS Supabase Storage
  policy before reading R2. A studio/member session is never forwarded. Draft and
  hidden images cannot be made public through this endpoint.
- Eligible targets are `blog-photos` and `blog-site-media` only. Receipts, avatars,
  inventory, backups and other buckets cannot be selected through the query string.
- On a public image's first GET, download at most 10 MiB from the authorized source,
  conditionally copy to `photos-v1/<source-bucket>/<path>`, read back and compare
  byte length, MIME and SHA-256. Write a zero-byte `.verified` marker only after
  verification. Existing objects are NOT overwritten. If verification was interrupted,
  re-read both source and destination and write the marker only when they match;
  invalid metadata, mismatched bytes or MIME fail closed without an overwrite.
- Later requests use R2 only when both object metadata and its verification marker
  agree. HEAD never copies. Concurrent GETs share a copy within an instance; R2's
  conditional write also protects against other instances. Two small objects are
  created per copied image (image plus verification marker).
- Return a five-minute R2 signed URL, with no-store JSON and a four-minute browser
  URL cache. Redirects are private and cached at most one minute. Withdrawal blocks
  new links immediately subject to existing Storage policies; links already issued
  can work for up to five minutes. This is not instantaneous revocation.
- R2 errors use the authorized Supabase source and a one-minute instance-level
  retry backoff. Missing configuration uses Supabase. Set `R2_PHOTOS_DISABLED=true`
  in Production and redeploy to roll back delivery without deleting anything.
- New uploads STILL use the existing validated Supabase upload service. Once public
  and first displayed, their display copies automatically use this R2 flow. This
  phase reduces repeated image egress, NOT Supabase storage or database requests.
  Direct-to-R2-only uploads and removing source originals are explicitly NOT part
  of this rollback-safe rollout.
- Public React images, SEO/SSR images and customized login photos route project
  site-media URLs through the gateway. Local bundled images and external image
  providers are unchanged. Studio cropping and original-download links are unchanged.

## Deployment checklist

1. Run targeted tests, production build, lint and secret scanning. Verify R2 SDK and
   server secrets do not appear in browser assets.
2. Push the reviewed commit to the connected repository; verify the Vercel build is
   Ready and assigned to the production domain. No Pro upgrade is needed.
3. Re-inventory immediately before copying (unique report filename). The Oct 16
   inventory is 86 files / 14,528,085 bytes, zero blocked; no images were downloaded.
4. Prewarm through the deployed gateway; this script needs NO local R2 credentials:

```powershell
node scripts/warm-r2-photos.mjs backups/r2-photos-plan-20261016.json https://chms1chineselanguageclubsystem.vercel.app backups/r2-photos-result-20261016.json
```

The script refuses plans over 30 MiB or 1,000 files, duplicates and private buckets.
It stops on the first fallback or mismatch, verifies R2's response byte length,
MIME and SHA-256, and saves progress without signed URLs or secrets. Re-run with a
new report name to resume: already verified objects are reused, not overwritten.
The first source copy consumes about 14.5 MB Supabase egress; destination verification
also reads that amount from R2. No full bucket listing or deletion is performed.

5. Test a public story and site/login photos on desktop/mobile; confirm provider=r2.
   Confirm draft/hidden/deleted requests are denied and temporarily unavailable R2
   falls back. Do not claim live privacy tests passed based only on unit mocks.
6. Monitor Storage egress and fallback rate after deployment. The present batch is
   not proof that every inline/book-specific media field has been migrated.

## Observed usage on 2026-10-15

Supabase organization usage, "Last 7 days" (chart labels Oct 8-15; today partial):
- Uncached egress: 0.459 GB. Cached egress: 0.061 GB.
- Current billing cycle Sep 24-Oct 24: uncached 7.724 / 5 GB; cached 0.251 / 5 GB.
- Oct 12 tooltip: Storage 98.934 MB (87.9%), PostgREST 13.32 MB (11.8%).
- Oct 14 tooltip: Storage 35.824 MB (81.6%), PostgREST 7.658 MB (17.4%).
- Dashboard warning: grace period ends Oct 30; restrictions possible if over quota.
- Read-only candidate inventory: 86 image objects, 14,528,085 bytes (about 14.5 MB),
  32 media rows with optimized display copies, zero blocked objects. No image downloads.

This is not a traffic growth forecast or proof that compression alone caused the
improvement. The breakdown includes cached traffic, unlike the uncached total.
Dashboard data can lag by one hour. Daily chart dates follow the dashboard's zone.

## Read-only inventory

Run in the repository, using existing local anonymous Supabase configuration:

```powershell
node --env-file=.env.local scripts/prepare-r2-photos.mjs --output backups/r2-photos-plan-20261015.json
node --test tests/r2PhotoPlan.test.mjs
```

The inventory reads published posts/albums, public settings and Storage object
metadata. It does NOT download images. The generated report stays under the ignored
backups directory and cannot overwrite an existing report. No server secret is needed.
It prioritizes display_path over original photos. Private member uploads, receipts,
draft/hidden-only media, external providers and unused site assets are out of scope.
This first batch covers registered article/album media, their covers and site-setting
image URLs. Review inline rich-text images, book-specific fields and static bundled
assets separately before claiming complete website coverage.
Blocked entries must be resolved before copying. Re-run immediately before migration.

## Required before any live migration

1. Confirm Cloudflare account and R2 terms/billing with the owner. Free allowance is
   not a hard spending cap. Do not enable paid services without approval.
2. Keep blog-photos in a PRIVATE R2 bucket initially. Existing Supabase photos are
   private and access depends on published status; a public bucket would weaken this.
   Use a server/Worker gateway that checks access and issues short-lived delivery URLs.
   Never copy service-role or R2 keys into VITE_ variables or the browser.
3. Scope a transfer credential to the destination bucket only. No source-delete rights
   are required. The owner must approve new credentials/access at creation time.
4. Copy compressed display photos, not all originals. Downloading the source consumes
   Supabase egress once. Use the plan size as a minimum transfer estimate, not a quota guarantee.
5. Verify each destination object's byte size, MIME type and SHA-256 against downloaded
   source bytes. Resume by verified object, never blindly overwrite an existing object.
6. Stage delivery integration for api/blog-media.js, signBlogImage, and direct site-media
   URLs. Preserve photo crops, original downloads, album privacy and bilingual settings.
   New uploads also need a controlled delivery path; a one-time copy alone is insufficient.
7. Test published, draft, hidden, withdrawn and newly uploaded photos; verify rollback,
   mobile rendering, CORS, cache expiry and failure fallback before production cutover.
8. Withdrawal and deletion must invalidate delivery access/cache within an agreed window.
   Do not cache private member data publicly. Public site images and private backup data
   must have separate buckets/access policies.
9. Switch only verified photo references via an explicit mapping. Preserve Supabase
   originals and existing database paths during the initial rollback period.
10. Compare daily Storage and PostgREST egress after cutover. R2 does not eliminate
    public-page database reads, Auth, Realtime or function egress.

The owner authorized the non-destructive photo rollout on Oct 16. Purchases,
deleting source objects, publishing private media and changes to member-system
workflows are outside this rollout.
