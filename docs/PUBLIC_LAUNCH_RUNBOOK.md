# Public-domain launch and rollback

Status: initial checklist prepared on 2026-10-18, Asia/Kuala_Lumpur.
UPDATE: Owner purchased chms1clc.org; Cloudflare registration Active verified.
Custom-domain binding is deployed, but HTTPS validation is pending and indexing
remains disabled. See DOMAIN_ACTIVATION_2026_10_18.md for the authoritative latest
stage, versions and resume gate. Earlier sections below include historical status.
No DNS changes, purchase, indexing changes or production redirects are authorized
by this document. Obtain the owner's cutover decision before applying them.

## Fixed ownership boundaries

- Cloudflare serves the public site and authorized compressed public images.
- Supabase remains the authoritative database, authentication and member backend.
- Vercel retains /member, /blog-admin, member PWA, Firebase push integration and
  source publishing/media fallback endpoints. A public URL change does not move
  the member app or require a new Firebase project/push registration.
- Existing member links stay on the original Vercel origin. Member subdomain and
  PWA migration are a separate later project.
- Public preview remains noindex until a formal host is explicitly activated.

## Before DNS

1. Recheck both quota usage and actual request availability. A persistent past-overage
   notice alone is not evidence of an active restriction. Quota-based restrictions
   lift after the next cycle refills (possibly with a short delay), while grace
   notices can persist across multiple compliant cycles. Repeated overages may
   have no new grace period. See https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy.
2. Prepare a recent encrypted data backup on the owner's connected disk. Do not
   export member data to Git or use a temporary plaintext C-drive copy. Verify
   checksums and archive integrity, retaining the older verified archives.
3. Include source database/Storage, current code and controlled configuration
   recovery material. R2 published snapshots/photos are mutable serving copies,
   not independent database backups. Record R2 bucket/bindings, Worker config,
   platform variable names and where encrypted credential material is kept;
   never put recoverable secrets into this repository or logs.
4. The owner deferred an independent cloud backup on Oct 18. It is not a technical
   dependency for binding a domain, but the single-disk loss risk remains. Full
   isolated database/platform restoration is also not verified by archive tests.
5. Confirm domain ownership, annual renewal, recovery email and account security.
   Do not automatically change credentials, sharing or payment arrangements.

## Stage the formal public host

1. Keep current preview and original Vercel deployment available for rollback.
   Record their deployed versions before changes.
2. Configure the formal Cloudflare public host and TLS. Choose one canonical
   hostname (apex recommended); redirect www to it without dropping path/query.
   Do not invent DNS records: use the actual host-binding instructions returned
   by the deployment platform. Do not delete unrelated MX/TXT records.
3. Separate public and private origins in configuration. The current Worker ORIGIN
   is reused for member/admin redirects, scheduled source refresh, missing-image
   gateway and sitemap links: a global replace to the new domain would create
   loops or break source refresh. Keep private/source paths on Vercel.
4. Update public rendering origin/canonical, WebSite/Organization data, Open Graph
   URLs, sitemap locations and source settings consistently. Rebuild and verify
   the R2 HTML/JSON bundle after configuration changes; changing DNS alone does
   not update server-rendered canonical or cached published HTML.
5. Remove noindex only on the formal public host after acceptance. Keep the
   workers.dev preview noindex. Review current snapshot marker: it also disables
   public statistics and routes member links to Vercel. Do not blindly remove it
   merely to enable indexing, or unintentionally enable analytics/preview PWA.
6. Ensure public aliases and member login return paths do not send users back to
   an obsolete public site. Preserve member hash routes and existing PWA identity.

## Acceptance gate

- GET root, literature, activities, bookroom, news, about and article URLs directly
  as well as through client navigation; check CSS/JS and browser console.
- Check desktop/mobile layout, search, images, gallery, contacts and missing404.
- Compare current published posts/categories/tags, not just total counts.
- Check publish/edit/withdraw synchronization with disposable approved content;
  drafts and private media must remain unavailable to anonymous requests.
- Check /member and /blog-admin buttons and direct URLs still reach Vercel.
- Check headers, canonical, robots, sitemap and public/private indexing policy.
- Keep rollback ready; a few functional requests are not a large-load guarantee.

## SEO and old public routes

After the formal host is approved, verify domain ownership in Search Console,
submit its sitemap and request appropriate recrawling. Leave old verification
available. Search-result site names and sitelinks remain Google's decision.

Use explicit public-route redirects preserving article slugs and queries, only
after new targets succeed. Never use a blanket old-host redirect: exclude member,
admin, APIs, assets, service workers, manifests, notification destinations and
the scheduled source endpoint. Avoid /?app=blog and legacy member hash entry
redirects without browser/PWA testing: HTTP servers cannot see URL fragments.
No implementation for these legacy launch decisions has been activated yet.

Start with limited sharing and observe errors/usage before wider promotion.
Indexing is not required for visiting a correctly functioning HTTPS URL.

## Rollback order

1. Disable the old-public-route redirect first, avoiding loops back to a failed
   new host. Restore the recorded Vercel public configuration/deployment if needed.
2. Roll the formal Worker back to its verified version, or show a controlled
   maintenance response. Keep preview private from search and source API alive.
3. Recheck member login/PWA/push and public synchronization; do not delete R2 or
   original Storage objects and do not restore a database over production.
4. DNS caches and search updates are not instantaneous. Restore canonical/robots
   consistently with the chosen fallback and record the incident.

## Oct 18 read-only observations

- Production readiness: all five checks passed (member, admin, literature,
  robots and sitemap, including expected security/indexing headers).
- Preview bounded normal audit: 12 requests, 424,674 decoded bytes, 13 published
  posts; image revalidation304; withdrawn test article404. First data response
  took 6.145 seconds; this observation is not a new performance benchmark.
- Supabase cycle Sep24-Oct24: uncached egress7.778/5GB; cached0.268/5GB;
  Storage average0.221/1GB; database summary0.088/0.5GB; functions27,644/500,000.
  Grace warning remains, potentially restricting requests from Oct30 if still
  over quota. Increase since the Oct16 observation: about0.017GB uncached and
  0.010GB cached. These are lagging aggregate differences, not visitor costs.
- R2 refreshed dashboard, cycle Oct15-Nov15: 187 objects,16.29MB, ClassA1.66k,
  ClassB6.6k, displayed bill$0.00. This does not assert all services cost nothing.
- D: backup drive was not present; no archive was rechecked or created, and no
  cloud upload, secrets export or plaintext member-data staging was performed.
  This was only the earlier observation: the owner's disk was subsequently found
  as E:, with the same CHMS1-Backups folder. The Oct18 full data archive
  CHMS1-20261018-143106-83921fae.7z was created and encrypted archive verification
  passed. Its SHA-256 was independently matched and its plaintext staging removed.
  The older archives remain. This is not a full isolated restoration.
- Automatic alerts have not been configured. Suggested thresholds in old docs
  are operational guidance, not an existing monitoring system.

## Oct 18 completed hardening (preview only)

The preview was missing CSP, HSTS and Permissions-Policy. It now uses a shared
security header definition for Worker responses and Cloudflare static _headers,
including asset errors that bypass the Worker. CSP retains the fixed original
Vercel asset fallback and existing font/Firebase/Supabase sources, disallows
inline/eval scripts and objects, and denies framing. Device permissions are
disabled. Normal static caching, noindex and the minute schedule are unchanged.

Final deployed Worker version: 40231873-644f-43b5-a5f6-c0547c688d52. This supersedes
the first Worker-only header deployment a1fed0f9-53fb-459e-8212-c2d5d1f92dd5.
Live checks verified headers on home200, public JSON200, app-launch.js200 and
missing static asset404. Edge search returned the expected public article with
no in-viewport broken images or horizontal overflow. No CSP violation appeared
in the captured logs; a pre-existing preview ServiceWorker404 registration
message remains because that endpoint is intentionally not offered by preview.
This is not a claim of full console-error freedom or a push regression on Vercel.

Forty focused tests and targeted lint passed. Screenshot evidence is local and
ignored by Git: test-results/security-search-20261018.png. No real member data,
credentials, Firebase configuration, formal domain or paid plan was changed.

## Platform configuration supplement preparation

The live metadata inventory is in PLATFORM_RECOVERY_INVENTORY_2026_10_18.json.
It records 14 Vercel Production variable names/scopes and the current Supabase
site URL, redirects, signup/provider toggles. Only ten variables exist locally;
the R2 ID/private key are not present in .env.local. Bucket/endpoint are recorded
as configuration, not claimed as recovered credentials.

scripts/backup-platform-to-harddisk.ps1 prepares an explicitly PARTIAL supplement
on the owner's E: disk. It captures filtered current Supabase secret names and
function metadata, Worker deployment IDs, configuration/source and the existing
local environment and validated Firebase service-account JSON. It verifies the
prior database/Storage and Firebase archive hashes. It does not read browser/CLI
login token stores, reveal remote Secret values, reset keys or change settings.
Source Firebase JSON equality with the live server secret remains unverified.

The user must enter an archive encryption password directly into 7-Zip and verify
it. Only after archive verification and SHA-256 creation is the uniquely owned
plaintext staging directory removed. Starting this tool is not backup completion;
check its status log, archive checksum and staging cleanup afterward. Complete
remote secret/Vault material and full platform recovery remain outstanding.

The initial supplement Platform-Config-20261018-163530-7cf2e98a.7z was verified,
its SHA-256 independently matched and its plaintext staging removed. It is still
partial and has no original R2 credentials. The owner subsequently confirmed
having the originals. The optional -IncludeR2Credentials mode takes both values
through local hidden prompts, writes them only into the disk staging area,
checks HeadBucket against the fixed account/bucket, then encrypts a NEW supplement.
It never changes remote credentials or tests writes/deletes. Do not mark this
second supplement complete until its log, checksum and cleanup have been checked.

The second supplement Platform-Config-20261018-163952-e8bb8308.7z contains the
owner-entered original R2 credentials, which passed HeadBucket at 08:41:48 UTC.
The initial archive verification did not complete; verification-only resume
succeeded at 16:43 Malaysia time without redownload or archive overwrite.
Its SHA-256 independently matched and the plaintext staging directory was removed.
Other custom Supabase secret values, Vault material and full recovery remain
outstanding; the historical name-only inventory is not a complete secrets export.

## Latest owner decisions and pre-domain check (Oct 18, 18:40 MYT)

This section supersedes earlier outstanding-status statements, not their historical observations.

- The owner reports Android background notifications worked normally over recent
  days. Record this as owner-observed acceptance, not an agent-run matrix of every
  notification type, role and device. No further real notifications were sent.
- Full Docker/Supabase restoration is explicitly deferred by the owner. Docker
  was not installed; no backup was decrypted in that environment check. The local
  Windows 10 Home machine has only about23.2GiB free on C:, WSL did not report a
  working status, and external E: is exFAT. Do not silently install onto C:,
  format/repartition the backup disk, or label this a completed restore drill.
- The owner also continues to defer an independent cloud backup.
- Platform-Config-20261018-171302-b16f7282.7z contains the named Vault cron secret
  and five scheduler definitions. Its archive test passed, SHA-256 independently
  matched and plaintext staging was removed. Original R2 credentials remain in
  the separately verified earlier supplement. Current Edge Secret equality and
  complete platform restoration are still unverified.
- Public audit script now asserts HTTP status, private-entry destinations,
  noindex protection, sitemap source origin, authorized image fallback and old
  withdrawn-test cleanup. A failed check produces a nonzero CLI exit instead of
  merely printing apparently successful request statistics.
- Live result: 16 sequential GET/HEAD requests, 440994 decoded response bytes,
  13 published posts, six public sections and one article200, image200/304,
  member/admin302 to the exact original Vercel paths, withdrawn test404, no
  private/preview-host sitemap entries, noindex retained. All checks passed.
- Original Vercel entry/security/SEO baseline: all five checks passed. Targeted
  tests:17 passed; no website runtime or domain binding was changed in this step.
- Evidence: test-results/domain-preparation-20261018.json (ignored, no credentials).

Remaining cutover gate: owner purchases/controls the chosen domain, then approve
the actual binding and origin separation, rebuild public SEO/sitemap, validate
TLS and new-domain routes before enabling indexing or old-public-route redirects.
The current Worker deliberately still uses the original Vercel origin for its
preview sitemap as well as private/source endpoints. A global hostname replacement
is not a migration implementation. No formal-domain deployment is activated yet.
