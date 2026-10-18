# Domain Activation: chms1clc.org

Last observation: 2026-10-18 21:48 MYT. Binding and HTTPS acceptance completed;
public apex indexing enabled. UPDATE: old root homepage now retired as described
below. UPDATE: public-section/article redirects are now deployed (84f87f6);
Search Console ownership and sitemap submission are still pending owner input.

## Ownership And Boundaries

- Owner confirmed purchase. Cloudflare dashboard reports Active, Free plan,
  registration expiration October 18, 2027. Initial DNS table was empty.
- Custom domains chms1clc.org and www.chms1clc.org are bound to the existing
  chms1clc-public-preview Worker. No unrelated DNS records were replaced.
- www and HTTP apex requests redirect to HTTPS apex, preserving path/query.
- Member/admin redirects, image fallback, and scheduled source refresh remain
  on the original Vercel origin. Supabase/Auth/Firebase/PWA identity is unchanged.
- Original Vercel public sections/articles now permanently redirect as recorded
  below. New-host indexing is enabled; Search Console verification is not done.

## Deployed Configuration

- Source commit4550617: observed Production Ready in Vercel, build17seconds.
- Cloudflare initial binding version d19b17d4-4a9d-440b-90ec-c705259dbcd8.
- Cloudflare HTTPS-guard Worker version9bfd56a2-652e-4dfa-a6ed-c9d8b24de26d includes
  the HTTP-to-HTTPS guard. No paid certificate or plan was purchased.
- PUBLIC_SITE_INDEXABLE was false during certificate issuance and initial checks;
  it is now true after acceptance, deployed as1e74040d-a4a4-47e9-98ab-24e8d9c3ed17.
- The workers.dev host always stays noindex even when the apex is later indexable.
- R2 snapshot now atomically contains separate formal-host HTML, with canonical,
  Open Graph and structured-data URLs using https://chms1clc.org. Public content
  and photo allowlist remain shared; drafts/member links remain omitted.
- Actual published R2 bundle inspected:19formal pages, correct root canonical,
  size1277954bytes, below the existing3MiB publication guard. This guard still
  applies as content grows; a larger site will require splitting the export.

## Checks And Outstanding Gate

- Build and targeted lint passed. Full non-browser suite:70files,206tests passed,
  failures/skips0. Focused Worker tests rerun after HTTPS guard:15passed.
- Real source refresh HEAD200; checkedAt advanced. Public resolvers1.1.1.1 and
  8.8.8.8 resolve new hosts to Cloudflare. This computer's normal resolver/browser
  still returned name-not-resolved. Local DNS cache was cleared; no DNS server,
  hosts file or browser security settings were changed.
- Initial direct verified TLS handshake was not successful. Cloudflare Edge Certificates
  initially reported Pending Validation(TXT) for Universal and managed Worker
  certificates. No certificate errors were bypassed. Universal subsequently became
  Active, and this computer's normal DNS/verified HTTPS requests now succeed.
- Cloudflare full-setup Universal SSL documentation gives an issuance window of
  15minutes to24hours after activation, not a guaranteed completion time:
  https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/enable-universal-ssl/
- Evidence: test-results/domain-regression-20261018.log,
  test-results/domain-bundle-20261018.json,
  test-results/domain-certificate-pending-20261018.png (ignored, no secrets).

## Completed HTTPS Acceptance

- Normal HTTPS apex200, www308 with exact path/query preservation. The earlier
  resolver/certificate failure was transient activation delay, not worked around
  by changing hosts, DNS server settings, certificate checks or paid services.
- Six sections plus article200;13published posts in public data; correct new-host
  canonical for every checked route. Sitemap/robots advertise only the new public
  origin. Private routes remain302 to Vercel and noindex; missing article404;
  search noindex; workers.dev noindex; image200 and conditional304.
- Final live HTTP acceptance:18sequential reads, all passed. This is not a load test.
- Browser acceptance: all six sections at1440px and360px (12loaded checks) have
  nonempty content, no skeleton and no horizontal overflow. Desktop home visible
  images loaded. Mobile menu navigation and search for the existing public story
  succeeded; article body loaded. No errors/warnings captured in observed sessions.
- This is emulated responsive browser acceptance, not new physical-device push
  testing. A hidden desktop-only language button caused one automation selector
  timeout on mobile; switching to the visible mobile-menu control completed checks.
- A separate bounded preview audit timed out once; focused repeat source/preview
  HEAD checks returned200. Final normal-domain18checks include preview200/noindex.
- Final evidence: test-results/domain-live-acceptance-20261018.json,
  test-results/domain-browser-acceptance-20261018.json,
  test-results/domain-live-home-desktop-20261018.png,
  test-results/domain-live-home-mobile-20261018.png (ignored).

## Resume Order

1. Configure Search Console ownership/sitemap. Scoped old-public redirects are
   complete. Keep member/PWA/API/asset/service-worker routes untouched.
2. Confirm the owner's final new-domain acceptance and monitor real traffic/errors
   and the next Supabase quota cycle before broad promotion.

If validation remains pending beyond the vendor's stated window, investigate DCV
and public delegation first. Do not toggle SSL protection off or buy an upgrade
as an unreviewed workaround. The original site remains the fallback meanwhile.

## Member Exit And Public Home Correction

Owner reported member exits still used the old public host. The common publicHomeUrl
helper still returned a relative old-host path; custom-domain binding cannot update
such client links. Commit9594b90 now targets https://chms1clc.org/ from the original
member/admin host, including installed member PWA. Public/preview/local pages keep
their own relative home navigation. Successful explicit sign-out also redirects to
the new public home; an auth error displays a retry notice and does not navigate as
if sign-out succeeded. Member manifest/start URL, Firebase registration, member
host and blog-login return/download permissions remain unchanged.

24focused tests, build and targeted lint passed. Vercel9594b90 observed Production
Ready (26seconds). Cloudflare asset deployment0a0c215c-4117-4b97-aaf5-3a325023ae08.
Browser verified the actual Blog admin return-home href and clicked it through to
the new domain, with full client content loaded and no captured console errors.
No real member sign-out was triggered during agent verification; the auth error
guard/navigation wiring was checked by tests/source assertions. Existing open
member documents must reload to run the new client code; no reinstall is needed.
Screenshot: test-results/member-return-new-home-20261018.png (ignored).

## Old Homepage Retired

Owner authorized closing the old homepage. Commit2c993d2 replaces only Vercel's
root public renderer with legacy-home.html plus home-redirect.js. It no longer
loads old homepage content, React, or the public-source database at that route.
Normal browsers immediately replace the root URL with https://chms1clc.org/,
preserving query/anchor. With JavaScript disabled, a plain link points to the
new site; the old content is still absent.

This is intentionally a200/noindex browser bridge, NOT a blanket HTTP301/308.
Servers cannot inspect URL fragments: old /#/member-route links and auth tokens
must first be identified in the browser and stay on /member at the source origin.
An unconditional root HTTP redirect could move such PWA/auth launches to the
public origin. The bridge uses an external same-origin script under existing CSP,
no-store/noindex,follow, and a canonical to the new homepage. Auth token values
are never forwarded to the public host. Synthetic callbacks were tested only in
an isolated JS VM; no real auth link was submitted.

Commit72465f5 also removes the retired old root from the old sitemap, retaining
the not-yet-migrated old sections/articles. Both commits observed Production
Ready (16seconds each).14focused tests, build and targeted lint passed.
Browser verified old root -> new domain and old /#/login -> source/member#/login,
with the actual login button visible. Member/admin, manifest, Firebase worker,
source-public API and redirect script all returned200. No account sign-in or
sign-out, push delivery, private data mutation or Cloudflare redeploy occurred.
The new site's live sitemap continues to include its own root.

Only the old homepage is retired in this step; old public sections/articles still
work until a separately scoped migration. Do not close the source Vercel project.
Proof: test-results/old-home-retired-20261018.png (ignored).

## Public Section And Article Moves

Commit84f87f6 deployed permanent308 redirects from the original Vercel public
sections and valid /blog/:slug URLs to corresponding chms1clc.org paths. Query
parameters are preserved; internal routing parameters are omitted. Redirects
run before database/R2 reads. Root remains the browser bridge described above.

Member article returns use member_view=1 on the original host, served no-store
and noindex,nofollow. This marker is not authorization: existing session/RLS
checks still govern original images and member downloads. Auth callback queries
stay on the original /member route. Generic public login opens the member app;
static public member-hash launches also stay on the original member origin.

33 focused tests, build and targeted lint passed. Cloudflare version:
a5870953-d953-44c5-bb2b-ebfa308b4226. Live HTTP checks confirmed all five section
redirects and an existing article308, preserved tracking query, member-view200,
and unchanged member/admin/public-source API200 with noindex. Browser opening
the old article URL reached the corresponding new-domain article. No real
member sign-in/out, private download, push or data mutation was performed.
The final production-checker run passed member/admin/literature/robots checks,
but the old-host sitemap request exceeded its15second timeout. That run is not
an all-pass result and does not establish new Search Console sitemap acceptance.

Search Console: opened Add property > Add a website > Domain/URL prefix form
in the owner's existing account. No property value, ownership verification,
DNS TXT, sitemap submission or Change of Address was submitted. Owner is being
guided to enter chms1clc.org in Domain, without a protocol or path.
Handoff screenshot: test-results/search-console-domain-step-20261018.png (ignored).
