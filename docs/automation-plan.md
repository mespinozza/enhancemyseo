# Automate Tools — Implementation Plan

Status: **phases 1 and 2 built**, not yet deployed. See "Deployment steps" below for what
has to happen before an automation can fire.

Built:

| Piece | Where |
| --- | --- |
| Types and constants | `frontend/src/lib/automation/types.ts` |
| Schedule math | `frontend/src/lib/automation/schedule.ts` |
| Headless runner | `frontend/src/lib/automation/runner.ts` |
| Cron endpoint | `frontend/src/app/api/automation/tick/route.ts` |
| Run now endpoint | `frontend/src/app/api/automation/run-now/route.ts` |
| Client CRUD | `frontend/src/lib/firebase/automations.ts` |
| Form | `frontend/src/components/automation/AutomationForm.tsx` |
| Page | `frontend/src/app/dashboard/automate/page.tsx` |
| Topic selection, pure | `frontend/src/lib/automation/selection.ts` |
| Search Console client | `frontend/src/lib/gsc/client.ts` |
| Signed OAuth state | `frontend/src/lib/gsc/state.ts` |
| OAuth + status routes | `frontend/src/app/api/gsc/{connect,callback,status,disconnect}` |
| Railway cron entry point | `frontend/scripts/automation-cron.mjs` |
| Gate test (56 checks) | `frontend/scripts/verify-automation-schedule.ts` |

Goal: let a user configure recurring article generation that runs server-side on a
schedule, with an optional and off-by-default push to Shopify, scoped per account so it
keeps running with no browser open.

## What exists today

Established by reading the codebase, not assumed:

- **No scheduler of any kind.** No `vercel.json`, no `functions/` directory, no queue.
  The only machine-authenticated route in the app is the Stripe webhook, which verifies
  a `stripe-signature` header.
- **No Google Search Console integration.** No OAuth flow, no `googleapis` dependency,
  no stored Google refresh tokens. The Google sign-in present is Firebase Auth for
  login and grants no Search Console access. Current keyword "search volume" and
  "difficulty" values are Claude estimates, not measured data.
- **Generation is browser-shaped.** `POST /api/generate-article` authenticates with a
  Firebase ID token, and it does *not* persist the article — the dashboard page creates
  the `blogs` document first and writes `title`/`content` back afterward. Any headless
  caller must replicate those Firestore steps.
- **Generation is slow.** One Claude call for topic breakdown, optional Shopify and
  website crawling, one large Claude call for the article, then a fact-check loop of up
  to three Perplexity + Claude iterations. No `maxDuration` is set anywhere.
- **Article usage is metered server-side** in `generate-article/route.ts` against
  monthly per-tier limits, and incremented only when generation reports no issues.

## Platform constraints (Railway)

Confirmed against Railway's docs, because the design depends on them:

- **Cron jobs start a service on a schedule and expect it to exit.** Minimum interval
  is 5 minutes, schedules are evaluated in UTC, and if a previous run is still active
  the next is skipped. Cron is a separate service, not a route in the web service.
- **HTTP requests are capped at 15 minutes**, and are closed after **5 minutes with no
  data transferred**. A silent long request will be killed well before generation
  finishes.
- **The web service is a long-running Node process**, not a serverless function. Work
  started during a request keeps running after the response is sent. This is the single
  most useful property available and the design leans on it.

## Architecture

```
Railway cron service ──POST /api/automation/tick──▶ Next.js web service
  (tiny, exits immediately)   (CRON_SECRET header)     │
                                                       ├─ claim due automations (txn)
                                                       ├─ respond 200 immediately
                                                       └─ process claimed jobs in the
                                                          background of the Node process
                                                             │
                                                             ├─ mint ID token for the
                                                             │  owning uid
                                                             ├─ create blogs doc
                                                             ├─ self-call generation
                                                             │  over localhost
                                                             ├─ write title + content
                                                             └─ optional Shopify push
```

Three decisions worth stating explicitly:

**The tick endpoint responds before doing the work.** This sidesteps both HTTP limits
entirely: the cron request lasts milliseconds, and generation runs in the Node process
with no request attached. On a serverless host this would be impossible, which is why
the Railway answer changed the design.

**Generation is reached by self-calling the existing route over localhost**, with an ID
token minted via Admin SDK `createCustomToken` exchanged through the Firebase REST
`signInWithCustomToken` endpoint. The alternative — extracting the ~7,000-line route
into an importable module — is a large, risky refactor of the most valuable code in the
app. Self-calling costs one loopback request and leaves that route untouched, including
its usage metering. Because the call is to localhost it never touches Railway's edge
proxy, so the 5- and 15-minute limits do not apply.

**Firestore is the job store.** Runs are documents with a status, a claim timestamp, and
an attempt count. A restart mid-generation leaves a stale `running` record, which a
reaper resets to `queued` after 30 minutes. No Redis, no queue service.

## Data model

### `automations/{automationId}`

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | string | Owner; drives all security rules |
| `brandId` | string | Which brand profile to generate for |
| `name` | string | User-facing label |
| `enabled` | boolean | Off until explicitly turned on |
| `trigger` | `'topicList' \| 'gscTraffic'` | Pluggable condition source |
| `topics` | string[] | For `topicList`: rotated in order, position tracked |
| `topicCursor` | number | Next index in `topics` |
| `gsc` | object | For `gscTraffic`: see phase 2 |
| `frequency` | `'daily' \| 'weekly'` | |
| `hourUtc` | number | 0–23; UI collects local time and converts |
| `daysOfWeek` | number[] | For `weekly` |
| `articlesPerRun` | number | Capped (proposed max 3) |
| `contentType` | string | Same options as the articles page |
| `toneOfVoice` | string? | |
| `instructions` | string? | |
| `contentSelection` | object | Mirrors the articles page shape |
| `autoPushToShopify` | boolean | **Default false** |
| `shopifyBlogId` | string? | Required only when auto-push is on |
| `shopifyStatus` | `'draft' \| 'published'` | **Default `draft`** |
| `lastRunAt` | Timestamp? | |
| `nextRunAt` | Timestamp | Indexed; the tick query reads this |

### `automationRuns/{runId}`

| Field | Type | Notes |
| --- | --- | --- |
| `userId`, `automationId` | string | |
| `status` | `'queued' \| 'running' \| 'succeeded' \| 'failed' \| 'skipped'` | |
| `claimedAt` | Timestamp? | Stale-claim detection |
| `attempts` | number | |
| `keyword` | string | What it decided to write about, and why |
| `triggerReason` | string | e.g. "Top query, 412 clicks in 30 days" |
| `blogId` | string? | Article produced |
| `pushedToShopify` | boolean | |
| `error` | string? | Surfaced verbatim in the UI |

`skipped` is a first-class outcome, not a failure: the most common reason will be the
account hitting its monthly article limit, and that should read as "skipped, limit
reached" rather than an error.

### Security rules

Both collections need explicit rules. The catch-all at the bottom of `firestore.rules`
grants read to any signed-in user, so without them one account's automations would be
readable by every other account — the same trap the article revisions rule exists to
avoid. Writes to `automationRuns` should be server-only.

## Phasing

The user picks the trigger source per automation, so both phases coexist rather than one
replacing the other. `gscTraffic` appears in the form from the start, showing a
"Connect Google Search Console" prompt until the brand has a token. This is worth doing
in this order because it means daily automation works before the OAuth integration
exists, and because not every automation should be traffic-driven — "three articles a
week from this topic list" is a legitimate configuration on its own.

### Phase 1 — Engine, `topicList` trigger, UI

1. Firestore rules for `automations` and `automationRuns`.
2. `lib/automation/` — schedule math (next run from frequency + hour + weekdays),
   job claiming, the runner.
3. `POST /api/automation/tick` — `CRON_SECRET` auth, claim, respond, process.
4. Token minting helper for headless generation.
5. `POST /api/automation/run-now` — same runner, one automation, ID-token auth, so a
   user can test a configuration without waiting for the schedule.
6. UI: list, create/edit form, enable toggle, run history with errors, Run now.
7. A `scripts/automation-cron.ts` entry point for the Railway cron service, which does
   nothing but POST the tick endpoint and exit.

### Phase 2 — Google Search Console trigger (built)

The trigger is chosen per automation, so both sources coexist.

- OAuth uses `webmasters.readonly` with `access_type=offline` and `prompt=consent`, which
  is what actually produces a refresh token. Without those, a returning user gets a
  one-hour access token and the automation quietly stops working.
- The callback is a plain browser redirect with no Authorization header, so identity rides
  in an HMAC-signed `state` parameter that expires after 10 minutes. Unsigned state would
  let anyone attach their own Search Console account to someone else's brand.
- **Refresh tokens are stored in `gscConnections`, not on the brand profile**, and the
  rules deny clients all access. A brand profile is read by the browser; a Search Console
  refresh token is long-lived credentials for an entire web property.
- The owner field in those documents is named `ownerUid`, not `userId`, so the generic
  `match /{collection}/{document}` owner rule cannot match the collection either.
- Queries are ranked by clicks or impressions over a trailing window, filtered by a
  minimum threshold, and **de-duplicated against keywords already written for that brand**.
  Without that last step a traffic-driven automation would rewrite its single best query
  every run, since that query stays top of the list.
- The window ends three days ago because Search Console data lags; asking through today
  returns partial rows and makes a healthy property look empty.
- Search Console returning nothing worth writing is recorded as a `skipped` run with the
  reason, not a failure.

## Deployment steps (Phase 1)

Nothing fires until all three of these are done.

1. Set `CRON_SECRET` on the web service to a long random string. Until it is set, the
   tick endpoint returns 503 rather than running anything, so a missing secret fails
   closed rather than leaving the endpoint open.

2. Create a new Railway service from this repo with root directory `frontend`, start
   command:

```bash
npm run automation:cron
```

   and a cron schedule of:

```text
*/5 * * * *
```

   Every 5 minutes keeps the feedback loop short while testing, since an automation only
   starts at the first tick after it becomes due — on a 15-minute cadence a "test in 5
   minutes" can take 15. Widening it to `*/15 * * * *` later costs nothing but patience.
   The tick is cheap either way: it claims work and exits in about a second, and a
   concurrent batch is skipped rather than duplicated.

   Give it `CRON_SECRET` (same value as the web service) and `AUTOMATION_TICK_URL` set to
   the web service's URL. The script is plain JavaScript run by `node` so the cron
   service needs no build step and cannot fail by not resolving `tsx`. The repo already
   has a Python service in `backend/` on Railway, so a third service is not a new
   pattern here.

3. For the Search Console trigger, create an OAuth 2.0 Web application client in Google
   Cloud (with the Search Console API enabled) and set on the web service:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` set to
   `https://YOUR-APP/api/gsc/callback`. That exact URI must also be listed as an
   authorized redirect URI in Google Cloud, byte for byte. `GOOGLE_OAUTH_STATE_SECRET` is
   optional and falls back to `CRON_SECRET`. Until these exist the trigger reports itself
   as unavailable in the form rather than failing at run time.

   **The consent screen must be published, not left in "Testing".** An External app in
   Testing status has every refresh token capped at 7 days, so automations would run for
   a week and then fail with `invalid_grant`. Publishing removes the cap even while the
   app stays unverified; verification is a separate process and is only required to
   distribute the app publicly, since `webmasters.readonly` is a sensitive scope. A
   `GscAuthError` carrying this explanation is what a run records if it does happen.

   Brands are connected from the brand profile page, not the automation form: the
   connection is brand-level like Shopify credentials, and the OAuth round trip would
   otherwise discard an unsaved automation. The callback returns to a signed `returnTo`
   path restricted to `/dashboard` routes so a signed state cannot become an open
   redirect.

4. Deploy rules and indexes from the repo root:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

   The indexes matter as much as the rules: without them the due-automation query and
   the run history query fail outright.

To sanity-check without waiting for the schedule, use the Run now button, or call the
tick by hand:

```bash
curl -X POST -H "x-cron-secret: YOUR_SECRET" https://YOUR-APP/api/automation/tick
```

Adding `?wait=1` makes the tick block until the batch finishes and return a summary,
which is useful for one quick automation but will be cut off by Railway on a long batch.

A 15-minute tick with hour-granularity scheduling means an automation fires within 15
minutes of its chosen hour, which is well within tolerance for daily content and stays
above Railway's 5-minute minimum.

## Decisions made while building

- **Rescheduling happens at claim time, not after the run.** A crash mid-generation
  therefore costs that slot rather than retrying immediately, which would spend Claude and
  Perplexity credits in a loop. A claim older than 30 minutes is cleared by a reaper so
  the automation is never locked out permanently.
- **A flagged article is never auto-pushed.** When `/api/generate-article` reports
  `hasGenerationIssues`, the article is saved and the Shopify push is withheld with a
  warning on the run, regardless of the auto-push setting. Publishing content the
  fact-check loop already doubted is worse than leaving it in the dashboard.
- **The monthly cap counts successes, not attempts.** A failed generation does not
  consume the allowance.
- **A tier limit stops the whole run.** A 429 from generation is recorded as `skipped`
  rather than `failed`, and the run stops instead of retrying the remaining articles,
  because a monthly limit will not clear mid-run.
- **`nextRunAt` is re-anchored when an automation is switched on**, so one that sat
  paused for a month does not fire the instant it is re-enabled.

## Security rules were rewritten alongside this

Two separate rules let any signed-in user read every other account's data, and both are
now closed. This is a behavioural change to the whole app, not just automations, so the
first deploy needs a smoke test of the dashboard, brand profiles, article generation,
history, the editor, and a public blog page.

- **The catch-all is gone.** `match /{path=**} { allow read, list: if request.auth != null; }`
  granted read on every document in the database to anyone signed in. Because rules are a
  union, no narrower rule could take that away, which made every owner-scoped rule in the
  file decorative.
- **`allow list: if request.auth != null` is gone from `brandProfiles`, `blogs`,
  `history` and `generatedProducts`.** Removing the catch-all alone would not have helped:
  a permissive `list` on `brandProfiles` still allowed any account to enumerate every
  brand profile in the database, Shopify access tokens included. Read is now expressed as
  `request.auth.uid == resource.data.userId`, which still permits the owner-filtered
  queries the app makes, because Firestore accepts a query whose constraints guarantee the
  rule passes.
- **Preserved on purpose:** public read of `published == true` blogs, and a lookup of the
  caller's own `users` document by email, which the subscription check falls back to when
  the UID lookup misses. The email rule is scoped to `request.auth.token.email` so it
  cannot be used to enumerate other accounts.
- **Known fallout:** the diagnostic helpers in `dashboard/history` that probe arbitrary
  collection paths now get permission-denied instead of empty results. They only log, and
  are wrapped in try/catch. The unpublished-blog fallback in `getBySlug` is also denied
  now, which is the correct outcome — it was a path to serving unpublished content.

## Open risks

- **Self-service privilege escalation predates this work and is untouched.** The `users`
  rule allows a signed-in user to write their own document, and `subscription_status` lives
  there, so a user can set their own tier from the browser console. The console helpers in
  `lib/firebase/admin-users.ts` do exactly that by design. Fixing it means moving tier
  writes behind the Admin SDK and denying client writes to that field.

- **Cost.** An enabled daily automation spends Claude and Perplexity credits without
  anyone watching. Monthly usage limits cap paid tiers, but `admin` and `agency` are
  unlimited, so a misconfigured automation on those tiers has no ceiling. Worth a hard
  per-automation monthly cap independent of tier.
- **Quality with no reviewer.** Generated articles currently get eyeballed before
  pushing. Auto-push defaults to off and to `draft` status for this reason, and that
  default should stay uncomfortable to change.
- **`shopify/push-article` trusts its caller.** The route verifies a Firebase ID token,
  then takes `shopifyStoreUrl` and `shopifyAccessToken` straight from the request body
  without checking the caller owns that store. The
  automation runner reads credentials server-side from the brand profile it already
  authorized, so it does not depend on that weakness, but the route should be tightened
  separately.
