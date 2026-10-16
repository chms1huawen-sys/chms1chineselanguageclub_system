# Public traffic preflight - Oct 16

## Follow-up: deployed and checked at approximately 23:04 Malaysia time

Connectivity recovered. Commit 562db34 was pushed to GitHub and the preview Worker
was deployed successfully as version 6fa479bb-5296-4a39-a2b5-22a864defbf0. The minute
schedule and original domains remain unchanged. No plan upgrade was performed.

The post-deployment audit made 12 sequential read-only requests and received
424,674 decoded body bytes across the entire audit (NOT the size of one browser
visit). Public JSON, home, literature, activities, bookroom and an article returned
200. A verified image returned 200, followed by body-free 304 for its matching ETag.
Member HEAD redirected only to the existing Vercel site. The test article was
absent from public JSON and sitemap and its detail URL returned 404. Report:
`test-results/public-traffic-audit-20261016-deployed.json` (ignored by Git).
The earlier `-before.json` run overlapped deployment and is not a valid performance
baseline. Do not claim a speedup from comparing those two runs. All 45 focused
tests were rerun successfully after deployment.

Read-only dashboard observations (counters can lag and continue changing):

| Account metric | Observed value / window |
| --- | --- |
| Workers requests today | 258 / 100,000 (approximately 0.258%) |
| Workers billed amount | $0.00, Oct 15-Nov 15 |
| Cloudflare account Worker errors | 0 shown for last 24 hours |
| Cloudflare account CPU P90 | 17 ms shown for last 24 hours; not post-deploy-only and not a load-test result |
| R2 bucket objects / size | 187 objects / 16.3 MB |
| R2 billed amount | $0.00, Oct 15-Nov 15 |
| R2 operations in current period | Class A 398; Class B approximately 3.09k |
| R2 billing usage storage tile | 14.58 MB; different aggregate/refresh from current bucket size |
| Supabase billing cycle | Sep 24-Oct 24 |
| Supabase uncached egress | 7.761 / 5 GB, approximately 2.761 GB over |
| Supabase cached egress | 0.258 / 5 GB |
| Supabase last 7 days | 0.287 GB uncached; 0.047 GB cached |
| Supabase warning | Grace ends Oct 30; restrictions/402 may apply if still over quota |
| Vercel team last 30 days | CDN requests about 30k / 1M; invocations about 2.1k / 1M; fast data transfer about 176 MB / 100 GB |

These do not establish future capacity. In particular the Supabase warning remains
unresolved: moving subsequent reads does not erase historical overage. Do not
interpret a low R2 bill as permission to ignore the original backend's risk.
Do not promise restrictions will automatically disappear at the next cycle.

No high-concurrency or load test was run. Formal cutover and indexing remain off.
The original failure report below is retained as historical diagnostic context.

## Initial connectivity failure (resolved)

This is a code-path and local-test audit, not a load test or an account usage
report. Live checks from this computer timed out for the preview, the formal
Vercel site and api.cloudflare.com. Browser navigation also timed out. This does
not by itself establish that either hosted website is down. Current account
usage, remaining quota and the owner's test-article cleanup could not be verified.
Do not substitute previous usage observations for current billing counters.

## Request ownership

| Workflow | Current path | Remaining dependency |
| --- | --- | --- |
| Preview HTML / public JSON | Worker -> private R2 published bundle | Worker request/CPU limits; R2 reads |
| Existing verified public image | Worker -> R2 image + verification marker | Worker request; two R2 object reads |
| New image without a verified copy | Authorized production media gateway -> first mirror | Vercel; Supabase on first copy/fallback |
| JS/CSS present in preview asset deployment | Cloudflare Static Assets | Does not require an R2 snapshot read |
| Missing hashed JS/CSS asset | Production asset fallback | Vercel; not proof that all traffic is isolated |
| Preview search | Browser filters public JSON | No new database search request in the normal success path |
| Public statistics | Disabled on preview | Production consent-based statistics still use Supabase |
| Member / studio | Original Vercel application | Supabase authentication/database and member media |
| Scheduled publication | Cloudflare minute trigger -> Vercel HEAD refresh | Supabase due RPC + tiny post-revision query |
| Studio save | Supabase mutation -> authenticated R2 synchronization | Original database remains authoritative |

The formal Vercel site's R2-backed data path is not the same as serving the whole
website on Cloudflare. Before cutover, visits to its public URL still invoke
Vercel handlers and can issue additional media gateway requests. Neither R2
egress pricing nor compressed photos imply unlimited Worker capacity.

## Prepared optimizations

- Concurrent cold Worker requests now share one pending R2 snapshot read instead
  of downloading/parsing the same bundle once per arriving image/data request.
  The isolated test sends 12 simultaneous reads and asserts one snapshot fetch.
- Public JSON is serialized once per cached revision and photo references are
  indexed once, rather than repeating that work for every response.
- Conditional image requests check current public authorization and the verified
  marker before returning 304. Matching ETags skip downloading the image body
  from R2 and skip resending it to the client. A changed ETag still gets a body.
- The existing 15-second Worker snapshot cache and 30-second image browser cache
  are not extended. Draft/unlisted images are still denied before any 304 reply.

These changes passed 45 focused tests, targeted lint and Wrangler deployment dry
run locally. They must not be described as live until a real deployment succeeds.
The subsequent GitHub push failed to connect to github.com:443. Wrangler's real
deployment also stopped because its expired OAuth token could not be refreshed
while the auth server was unreachable; stored credentials were left unchanged.
The optimization is locally committed, not uploaded or deployed. Do not rotate
credentials, change proxy/security settings or enable billing to work around this.
They reduce redundant R2 reads/CPU/body bytes, not the count of HTTP requests that
actually reach the Worker. A 304 still consumes a Worker request and metadata reads.

## Reference size, not current usage

The local frontend build's entry plus public-page dependency graph contains
29 unique JS/CSS files: 583,897 raw bytes, approximately 164,138 gzip bytes using
local compression. The previous public export JSON is 188,400 bytes (13 posts;
export generated at 2026-10-16T13:10:42Z). These are reference artifacts, not a
live browser waterfall, exact billable transfer, current content count or quota.
Images, fonts, browser caching, dynamic imports and runtime requests change the
actual first-page payload. Do not multiply these values by visitor count and
present the result as measured platform egress.

## Bounded normal audit

```powershell
node scripts/audit-public-traffic.mjs test-results/public-traffic-audit-NEW.json
```

The read-only audit is fixed to the preview origin, sequential, at most 16 requests
and 3 MiB decoded bodies, with a 15-second per-request timeout. It does not follow
redirects or call the publishing/refresh endpoint. It checks representative pages,
one image, an ETag revalidation, the member redirect, sitemap and the known test
article's removal. It stops on the first unavailable public JSON source. Generated
reports are ignored by Git and existing files are not overwritten. The attempted
live run stopped on its first request with UND_ERR_CONNECT_TIMEOUT; no successful
live report was produced.

## Next gate: authorization before load testing

After connectivity recovers: run the bounded audit, check actual Cloudflare,
Vercel and Supabase account counters, deploy/verify these optimizations, then
agree the load-test ceiling. A proposed first test is preview read-only traffic,
1/2/5 requests per second for 60 seconds each, no more than 5 concurrent requests,
500 requests total and 50 MiB decoded downloads. Stop on quota/rate-limit signals,
CPU-limit errors, repeated 5xx responses or excessive latency. No authenticated
member operations, uploads, mutations, source refresh requests or external
redirect targets should be exercised. This proposal has NOT been executed or
approved by the owner yet and is not evidence of production capacity.

Do not cut over the public domain, enable indexing or recommend broad promotion
based only on functional tests. Keep the current formal URL/PWA and rollback path.
