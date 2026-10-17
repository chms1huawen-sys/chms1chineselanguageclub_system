# Public preview pre-cutover checks - Oct 17

## Scope and result

Read-only checks covered the deployed Cloudflare preview. No real article was
published, edited or withdrawn; the original domain, PWA and indexing settings
were not switched. No plan upgrade or load test was performed.

- The bounded HTTP audit made 12 requests, reading 424,674 decoded body bytes.
  Public JSON, home, literature, activities, bookroom and one article returned
  200. Image GET returned 200 and conditional GET returned body-free 304.
- Sitemap returned 200. The withdrawn test article remained absent from public
  JSON and sitemap, with its detail URL returning 404.
- Both public APIs contained 13 published posts. IDs, slugs, titles, bodies,
  statuses, category IDs, tags, content types and publication/update timestamps
  matched. Category and tag arrays also matched exactly.
- Automatic status was enabled. At 10:47 UTC its last source check was
  10:47:48 UTC, with the current bundle generated at 10:45:48 UTC.
- Edge desktop (1358px) and mobile viewport (390x844) checks found no horizontal
  overflow or broken in-viewport homepage images after loading completed.
  Mobile menu opened and its bookroom link navigated correctly.
- Searching for an existing public title returned the corresponding story.
  Book details and the expandable purchase contact section displayed Instagram,
  Facebook and Gmail. About also displayed the three contact links. External
  services were not contacted and no email was sent.

## Defect found and fixed

HTTP HEAD /member already redirected to Vercel, but that was insufficient:
the hydrated SPA intercepted a normal member-entry click and rendered its login
view on the preview origin. This was reproduced in the browser before repair.

The early app-launch script now captures clicks and auxiliary clicks only when
the server's public-static-preview marker is present. Same-origin /member and
/blog-admin links are changed to the fixed existing Vercel origin before SPA
bubbling handlers run. Public/external links and unmarked production/PWA pages
keep their existing behavior. Paths, queries and fragments are preserved.
This does not change accounts, authentication permissions or credentials.

Only app-launch.js changed among deployed static assets. Preview deployment
version: 19aab2e8-0a85-4071-8972-bfeb06bad978. The minute scheduler is unchanged.
Browser verification after deployment: clicking the About member-login entry
navigated to the original Vercel /member#/login?return=%2Fabout address. An
existing authenticated session subsequently returned to Vercel /about normally.
No credentials were entered. The browser viewport override was reset afterward.

Targeted lint, frontend build and 38 focused automated tests passed. Regression
tests cover normal/auxiliary clicks, preserved private fragments, non-preview
behavior and preventing preview member SPA interception. Existing tests cover
atomic publication, drafts, withdrawal, image access and scheduled retry.
Those automated source-change tests are not a claim of fresh production edits.

Local evidence (ignored by Git):
- test-results/public-precutover-20261017.json
- test-results/precutover-member-fixed-20261017.png
- test-results/precutover-home-20261017.png

## Remaining decision and limits

Keep preview noindex and the current formal URL until the owner chooses the
public entrance/domain and approves cutover. Domain migration, SEO redirects
and final canonical/sitemap changes have not been applied. The existing member
PWA remains on Vercel. The historical Supabase quota warning is not resolved by
these functional checks; account usage was not remeasured in this pass.
