# Public site isolation rollout

## Automatic preview (Oct 16, supersedes the manual preview below)

The preview Worker now reads a pre-rendered public bundle inside the same
checksum-protected, conditional-write R2 snapshot object. The Vercel publishing
path renders HTML and transformed public JSON before the atomic snapshot write;
render failure is a synchronization failure, not a false success. Readers never
combine HTML from one revision with JSON from another stored revision.

- Studio saves still go to the existing Supabase database, then synchronize R2.
  Successful synchronization updates the preview without a Cloudflare redeploy.
- The Worker reads R2 through an internal binding; no additional API token is
  stored in Vercel or exposed to browsers. Public snapshot responses omit the
  server-only pre-rendered bundle.
- Worker memory cache is 15 seconds; client data cache remains 30 seconds and
  image browser cache is 30 seconds. Existing open tabs/downloaded files cannot
  be retracted. Missing/unpublished routes do not fall back to old exported HTML.
- Only snapshot-listed compressed images with matching verification markers are
  served from R2. A newly published image not yet mirrored redirects through the
  existing authorized production gateway once; original downloads stay unchanged.
- A Cloudflare Cron Trigger runs every minute, making a HEAD refresh request to
  the fixed production public endpoint. It transfers no article JSON body.
  This checks scheduled publication without visitors, normally within 1-2 minutes,
  not an exact-second SLA. Provider outages/cron propagation can delay execution.
- Direct database edits outside the studio retain hourly reconciliation. The
  existing save/retry workflow is still required for immediate synchronization.
- Each minute also checks only the published-post count and latest update time.
  This recovers a publication whose database commit succeeded but R2 write failed,
  without re-downloading every article each minute. External post edits can be
  detected this way; settings/taxonomy-only external changes still reconcile hourly.
- Dynamic page/data/image requests now invoke a lightweight Worker and therefore
  count toward Workers Free's request/CPU limits. This is NOT unlimited static
  hosting. JS/CSS assets continue using Static Assets. No paid plan was enabled.
- The template is generated from the current frontend build. When application
  code/assets change, rebuild and redeploy preview assets too. Missing hashed
  JS/CSS files may redirect to the production origin; content changes need no
  redeploy. All preview routes remain noindex, member/admin redirect to production,
  and preview PWA manifests/service worker return 404 to avoid a second install.
- The combined snapshot including HTML must remain below 3 MiB; larger exports
  fail explicitly rather than silently truncate public data.

Deploy runtime assets with:

```powershell
npm run build
node scripts/prepare-cloudflare-runtime.mjs
npx wrangler deploy --config cloudflare/public-preview/wrangler.jsonc
```

The original point-in-time export and its instructions below are retained as
historical recovery tooling, not the current preview's publication mechanism.

Automatic-preview verification on Oct 16: 41 focused tests and 30 security tests
passed; build, targeted lint and secret scanning passed. All 19 live page routes
and 93 verified R2 image HEAD requests returned 200 without image redirects.
Public JSON excludes the server HTML bundle. Missing/unpublished article and
unlisted image paths return 404; member/admin redirect to the unchanged original
site. Browser search returned the matching published story; the 390-pixel viewport
had no horizontal overflow or visible broken images. No production stories were
created, edited or withdrawn for testing: mutation cases use isolated fixtures.

The actual Wrangler runtime scheduled handler was invoked against the production
public refresh endpoint and returned outcome=ok. This caught and fixed an edge
runtime incompatibility with redirect=error (manual + explicit status checking is
used instead). Cloudflare's own Cron events then succeeded at 21:47:44, 21:48:44
and 21:49:44 Malaysia time on Oct 16. The preview's checkedAt advanced to 21:49:48
and was only 12 seconds old at the final status check, without another manual
refresh. The production homepage still returned 200 using r2-snapshot-v1.
The current packed object is approximately 843 kB, below its 3 MiB limit.
Platform guidance allows up to 15 minutes for new triggers:
https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Scope and current boundaries

The original Vercel domain, member routes, PWA origin, Supabase schema and private
business records stay unchanged. No source photos or records are deleted.

1. Vercel now has an R2-backed public snapshot path. It renders existing SEO HTML
   from that snapshot and exposes the same public data for the React frontend.
2. Publishing, editing, taxonomy/settings changes and media mutations in the studio
   synchronize the public copy after the original operation. Failures explicitly
   distinguish "saved" from "publicly synchronized" and offer a retry without
   repeating a database mutation.
3. Published image authorization can use the snapshot; verified R2 hits no longer
   need Supabase. Unlisted/draft images fail closed. Private studio previews and
   member-only download links continue using authenticated Supabase requests.
4. A fully static Cloudflare preview exporter is provided separately. This is a
   point-in-time preview, NOT an automatically updated second production website.

The owner renewed Cloudflare CLI login on Oct 16 and the static preview was
deployed using that authorization. An Object Read & Write R2 credential alone
does NOT grant permission to deploy Workers/Static Assets. No paid plan was
enabled and no formal domain or PWA entrypoint switched.

## Snapshot contract

- Storage key: private `public-site/v1/current.json` in the existing R2 bucket.
- Only anonymous published posts and their media/public links are exported.
  Explicit field selection removes creator/editor IDs, original paths, member links,
  arbitrary settings/book metadata, drafts, scheduled text, hidden and trashed posts.
- Object size is capped at 3 MiB; each source table is capped at 10,000 rows. Larger
  sites must split indexes/articles rather than silently produce a partial copy.
- SHA-256 protects stored JSON; conditional ETag writes prevent blind replacement
  by an older concurrent build. Invalid data is not used as a public snapshot.
- A manager must have a valid Supabase user token plus `blog_manager()` permission
  to force synchronization. Cross-origin POST is rejected. An instance-local actor
  cooldown reduces repeat submissions; it is not a global hard billing cap.
- Public GET cannot submit data or choose a Storage key. Missing data is seeded
  from the anonymous source only. Existing source files are never moved/deleted.

## Freshness and scheduled publishing

- Original database saves are synchronous. Public sync follows them before studio
  success is reported. Retry only synchronization if it fails after a successful save.
- Public HTML/JSON use at most 30-second shared caches; client JSON memory cache is
  30 seconds. Server snapshot memory is checked every 30 seconds. Already loaded
  pages do not magically retract text that a visitor has already downloaded.
- Scheduled publication is checked in background at most once per minute per fresh
  stored check timestamp, while public traffic exists. It does NOT guarantee a
  publication runs at the exact minute in the absence of visitors.
- Full source reconciliation happens hourly while traffic exists; direct SQL or
  external edits outside the studio may take that long unless synchronization is
  explicitly triggered. A durable revision/outbox + independent scheduler is a
  later prerequisite for strict unattended publication guarantees.
- During Supabase failure, return the last valid public snapshot rather than wait
  for it. Member actions still need Supabase. During R2 failure, retain the original
  anonymous backend fallback; no data is discarded.
- Image signed links remain valid for up to five minutes after issue. Snapshot/cache
  propagation adds roughly another minute before all instances stop issuing links.
  This is bounded eventual withdrawal, not instant revocation of downloaded content.

## Rollback

Set `PUBLIC_SITE_DISABLED=true` in Vercel Production and redeploy to use original
public data queries/Storage authorization. This keeps image originals and all records.
Do not delete the R2 bucket, verification markers or Supabase source objects.

## Static Cloudflare preview

```powershell
npm run build
node --env-file=.env.local scripts/export-public-site.mjs https://chms1chineselanguageclubsystem.vercel.app test-results/cloudflare-public-preview-v2
```

The exporter accepts a NEW output directory only, reads the public snapshot, copies
compressed R2 images (maximum 1,000 objects/30 MiB), verifies each checksum and builds
real HTML for the six public sections plus each article. The React public data and
image references are rewritten to static local files, including rich-text photos.
Original download permissions and member/admin destinations stay on the Vercel site.
All preview responses have noindex/nofollow and canonical URLs retain the formal site.
Preview analytics are disabled so acceptance tests do not become production visits.
The live site's optional consent-based statistics still use the existing Supabase
endpoint and remain nonblocking; this small remaining dependency is not migrated.

The output has a static `/api/blog-public` JSON asset, `_headers`, `_redirects`,
`sitemap.xml`, local images and the existing compiled CSS/JS. It needs no D1 database,
no Supabase service key, no R2 public bucket and no dynamic Worker for normal reads.

With valid Cloudflare CLI authorization, deploy only the preview:

```powershell
npx wrangler login
npx wrangler deploy --config cloudflare/public-preview/wrangler.jsonc
```

Current preview: https://chms1clc-public-preview.chms1chineselanguageclub-system.workers.dev

The Oct 16 export includes 19 pages (six sections and 13 published posts),
93 checksum-verified images totaling 15,426,008 bytes. Root-level site images
are included as well as post images. Static SSR image URLs are local while
canonical URLs retain the formal origin. Existing exports are preserved;
choose a new output directory and update the config for subsequent exports.

Verification: six section routes, an article and a local site image return 200;
missing pages return 404; member/admin routes redirect to the formal Vercel
origin. The JSON endpoint has the correct MIME type. Responses carry noindex.
The package has 228 files, a largest file of 1,225,122 bytes and 331 checked
local HTML asset references. Desktop browser rendering and a 390 x 844 mobile
viewport were checked; mobile menu opens, visible images load, and no horizontal
overflow or Supabase/Vercel media image URLs were found in the rendered homepage.
Function/security suites passed (32 and 30 tests). This is not a load test.

Do not call it the final migration: automated static re-export/deployment on publish,
edit, withdrawal and scheduled release still needs authenticated deployment access
and integration. A manual preview must never replace the live continuously updated
website until those controls and desktop/mobile acceptance tests are in place.
