# Public site isolation rollout

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

Cloudflare CLI login was expired on Oct 16. An Object Read & Write R2 credential
does NOT grant permission to deploy Workers/Static Assets. No broader token was
created, no paid plan enabled and no formal domain or PWA entrypoint switched.

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
node --env-file=.env.local scripts/export-public-site.mjs https://chms1chineselanguageclubsystem.vercel.app test-results/cloudflare-public-preview
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

After the owner renews Cloudflare CLI authorization, deploy only the preview:

```powershell
npx wrangler login
npx wrangler deploy --config cloudflare/public-preview/wrangler.jsonc
```

Do not call it the final migration: automated static re-export/deployment on publish,
edit, withdrawal and scheduled release still needs authenticated deployment access
and integration. A manual preview must never replace the live continuously updated
website until those controls and desktop/mobile acceptance tests are in place.
