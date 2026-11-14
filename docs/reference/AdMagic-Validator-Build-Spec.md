# AdMagic Validator + Affiliates — Hackathon Build Spec

Nov 14, 2026 · @Ven

## Summary

We are building **AdMagic Validator**, a Chrome extension plus one Next.js app on Vercel. The extension scores Meta ads with AdMagic's neural analysis, paid per use through Qatom. The same app lets brands turn a validated ad into an affiliate offer and pay creators, agencies and AI agents for verified results through Qatom. Target: the **Use** track of the Agentic Payments Hackathon Toronto, with a light Control layer. Submission is due on BuilderBase by **10 AM ET, Sunday Nov 15, 2026**.

**Pitch line:** Validate any Meta ad in one click, then pay the people who sell it, all with Qatom receipts.

| Decision | Locked choice |
| --- | --- |
| Track | Use, with a light Control layer (limits and approval) |
| Where ads come from | Meta Ad Library (public, no login) |
| Who pays AdMagic | Extension → our backend → Qatom. Wallet keys only on the backend |
| AdMagic items sold on Qatom | Neural Score image $0.99, Compare 2–5 ads $2.99, video analysis $1.99, attention heatmap overlay |
| Spending controls | Qatom wallet ceiling + phone approval, daily budget, no double-pay cache, click-to-pay only |
| Value flow (validator) | AdMagic sells on Qatom and keeps 100%; extension is AdMagic's free channel |
| Affiliates | Creators/publishers, agencies/media buyers, AI agents |
| Payout models | Per sale (CPA), per qualified click (CPC), revenue share % |
| Payout timing | Brand picks per offer: hold then release, instant, or batch |
| Conversion source | Demo store sending a signed webhook |
| Fraud checks | Click dedupe + dwell time, signed webhook, per-affiliate caps, verified Qatom identity |
| Stack | **Next.js (TypeScript) on Vercel** + Postgres; Chrome extension (Manifest V3, TypeScript) in the same repo |
| Team | 2 people, about 20 hours |
| Access | One seeded demo brand behind an admin password; scoped, revocable tokens for the extension and each AI agent; one Activity page. Multi-user sign-in (Clerk) after the hackathon. |

One change from the earlier plan: we picked Express, but Vercel runs Next.js route handlers natively. One Next.js app now holds the API, the Affiliates page, the demo store, the tracked-link redirect and the MCP endpoint. Same language, fewer moving parts.

## Architecture

One Next.js app on Vercel sits between every client and every payment; the extension, agents and visitors never touch a wallet.

&#91;embedded content: system architecture · one Vercel app between the extension, AdMagic and Qatom\]

The Validator API pays Qatom for each AdMagic analysis, and the Affiliate API pays affiliates from the brand's offer wallet. Both write to the same Postgres database, which the Affiliates page reads.

## Repo and Vercel setup

One public GitHub repo, a Next.js app at the root (deployed by Vercel), and the extension in its own folder (loaded unpacked, never deployed). Keeping Next.js at the root avoids monorepo settings on Vercel.

```
admagic-validator/
  app/
    affiliates/page.tsx            Affiliates dashboard (4 tabs)
    demo-store/[offerId]/page.tsx  Demo store for live conversions
    r/[code]/route.ts              Tracked-link redirect
    api/validate/route.ts          Score one creative (pays via Qatom)
    api/compare/route.ts           Compare 2-5 creatives
    api/budget/route.ts            Today's spend + limit
    api/receipts/route.ts          Receipt history
    api/pair/route.ts              Pairing code -> extension token
    api/tokens/route.ts            Create / revoke scoped tokens
    activity/page.tsx              Activity: today, analyses, payments, Blocked, Access
    login/page.tsx                 Admin password for the demo brand
    api/affiliates/...             Offers, affiliates, links, stats, payouts
    api/affiliates/beacon/route.ts Dwell-time beacon
    api/affiliates/webhooks/conversion/route.ts
    api/affiliates/webhooks/refund/route.ts
    api/cron/release-holds/route.ts
    api/mcp/[transport]/route.ts   MCP tools for AI-agent affiliates
  lib/
    admagic.ts      Client for our AdMagic MCP endpoints
    qatom.ts        QatomClient interface + Mock + Live
    db/schema.ts    Drizzle tables
    budget.ts  cache.ts  attribution.ts  fraud.ts  hmac.ts  auth.ts
  extension/
    manifest.json  src/content.ts  src/background.ts  src/popup.tsx
  docs/
    value-flow.md  security.md  demo-script.md
  scripts/seed.ts
  vercel.json  .env.example  README.md
```

**Setup steps (Person B, first 30 minutes)**

1. `npx create-next-app@latest admagic-validator --ts --app --tailwind --eslint`, then `git init`, push to a **public** GitHub repo (a public repo is a submission requirement).
2. In Vercel: Add New Project → import the repo → framework Next.js → Deploy. `main` becomes production; every branch and PR gets its own preview URL.
3. In the Vercel project: Storage → add a Postgres database (Neon via the Marketplace). `DATABASE_URL` is added to the project's env vars automatically. Run `vercel env pull .env.local` to use it locally.
4. Add Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`), write `lib/db/schema.ts`, run `drizzle-kit push`.
5. Add the env vars below in Vercel (Production + Preview) and in `.env.example` without values.
6. Add `vercel.json` with a cron that calls `/api/cron/release-holds`, protected by `CRON_SECRET`. Vercel's Hobby plan limits how often crons run, so holds are **also released on every read** of earnings and by a "Release due payouts" button. The 2-minute demo hold never waits on the cron.
7. Video analysis can be slow: set `export const maxDuration = 60` on `api/validate` and `api/compare`, and check your plan's limit.
8. Git flow: Person A works on `ext/*` branches, Person B on `api/*`. Merge to `main` through short PRs; the preview URL is the test target.

**Environment variables**

| Name | What it holds |
| --- | --- |
| `DATABASE_URL` | Postgres connection (added by Vercel) |
| `ADMAGIC_MCP_URL`, `ADMAGIC_API_KEY` | Our existing AdMagic MCP endpoint and key |
| `QATOM_MODE` | `mock` or `live` |
| `QATOM_API_KEY` | Qatom credentials (server only) |
| `QATOM_BUYER_WALLET_ID` | Agent wallet that pays AdMagic for analyses |
| `QATOM_OFFER_WALLET_ID` | Brand wallet that funds affiliate payouts |
| `QATOM_ITEM_IMAGE`, `QATOM_ITEM_VIDEO`, `QATOM_ITEM_COMPARE` | Catalog item IDs for AdMagic's listings |
| `EXTENSION_API_KEY` | Removed: the extension uses a paired device token (see Access control) |
| `EXTENSION_ORIGIN` | `chrome-extension://<extension id>` for CORS |
| `DAILY_BUDGET_USD` | Default daily limit, e.g. 10 |
| `CRON_SECRET` | Protects the cron route |
| `ADMIN_PASSWORD` | Password for the seeded demo brand's web pages |
| `SESSION_SECRET` | Signs the admin session cookie |

Per-offer webhook secrets live in the database, not in env vars.

## Chrome extension

A Manifest V3 extension that only runs on the Meta Ad Library, holds no wallet keys, and buys nothing without a click.

**Manifest essentials**

- `host_permissions`: `https://www.facebook.com/ads/library/*` and the Vercel app URL. Nothing else.
- `permissions`: `storage` (settings and cached results), `activeTab`.
- Content script on the Ad Library; a background service worker makes all calls to the backend; a popup for budget and receipts.
- Build with Vite (or plain `tsc` + copy) into `extension/dist`, then Load unpacked in `chrome://extensions`.

**Content script (Ad Library page)**

1. Watch the page with a `MutationObserver`; the Ad Library loads ads as you scroll.
2. For each ad card, find the creative: the main `<img>` src or `<video>` poster/src. Skip hidden or zero-size elements.
3. Add a small **Validate** button on each card, and a **Select** checkbox for Compare.
4. On click, send `{creativeUrl, type, pageUrl}` to the background worker; never call the backend from the page itself.
5. Show the result as an overlay on the card: Neural Score badge, top 3 insights, attention heatmap drawn on a `<canvas>` over the image, and a **Receipt** link.
6. A **Create offer** button on scored cards opens the Affiliates page with the creative and score pre-filled.

**Background worker**

- Adds the paired device token (`Authorization: Bearer`) and calls `POST /api/validate` or `POST /api/compare`.
- Shows status on the card: Paying → Waiting for phone approval → Analyzing → Done (or the error).
- Keeps the last results in `chrome.storage.local` so reopening the page shows them without paying.

**Popup**

- Today's spend vs. daily limit (from `GET /api/budget`), and a field to change the limit.
- Wallet balance and the last 10 receipts (from `GET /api/receipts`).
- Compare button: enabled when 2–5 cards are selected; shows "$2.99 – needs phone approval".
- Settings: backend URL (preview or production) and **Pair with code**. Shows "Access revoked" if the token is revoked or expired.

**Fallback:** if the Ad Library layout changes and no ads are found, the popup says so and offers a paste-a-URL box. The demo never depends on scraping alone.

## Validator API

Every paid call runs the same five checks in order, and only the fourth one spends money.

1. **Auth:** the `Authorization: Bearer` token matches an active row in `api_tokens` (not revoked or expired) and has the `buy` scope. Otherwise 401 or 403, logged to the Blocked panel.
2. **Cache:** download the creative, take a SHA-256 of its bytes (not the URL; Meta URLs change). If an analysis for that hash and item exists, return it with its original receipt and `cached: true`. No payment.
3. **Budget:** if today's spend + item price exceeds the daily limit, return 402 with spend and limit.
4. **Pay:** `qatom.purchase({walletId: QATOM_BUYER_WALLET_ID, itemId, idempotencyKey: hash+item})`. Results: `paid` → continue; `pending_approval` → return 202 and let the extension poll; `failed` (wallet ceiling hit, declined) → 402 with the reason.
5. **Analyze:** call our AdMagic MCP tool with the creative URL; save the result, hash, receipt ID and price; return it.

**Routes**

| Route | Input | Output |
| --- | --- | --- |
| `POST /api/validate` | `{creativeUrl, type: image or video, withHeatmap?}` | `{score, insights[], heatmap?, emotionCurve?, receiptId, receiptUrl, priceUsd, cached}` |
| `POST /api/compare` | `{creativeUrls: 2-5}` | `{ranking[{url, score}], winnerUrl, receiptId, priceUsd}` |
| `GET /api/purchase/:id` | — | Status while waiting for phone approval |
| `GET /api/budget` | — | `{spentTodayUsd, limitUsd, walletBalanceUsd}` |
| `PUT /api/budget` | `{limitUsd}` | Updated limit |
| `GET /api/receipts` | `?limit=10` | Recent purchases with receipt links |

**Tables:** `analyses` (id, creative\_hash, item, creative\_url, result\_json, receipt\_id, price\_usd, created\_at; unique on hash + item) and `purchases` (id, item, price\_usd, status, receipt\_id, idempotency\_key, created\_at). Today's spend = sum of paid `purchases` since midnight Toronto time.

**AdMagic client (`lib/admagic.ts`):** one function per tool we already have (score image, analyze video, compare, heatmap). Fill in the real MCP tool names and response shapes; map them to the output types above so the extension never sees AdMagic's raw format.

## Affiliate attribution

Brands turn a validated ad into an offer; affiliates earn per verified result; Qatom pays them from the brand's offer wallet with a receipt each time. The AdMagic score shows on every offer so affiliates pick strong creatives.

**Metrics and how they are used**

| Metric | Use | Why |
| --- | --- | --- |
| Conversion / sale | Pays CPA | Hardest to fake; clear value |
| Order value | Pays revenue share % | Rewards bigger orders |
| Qualified click (unique, 5 s+ on page) | Pays CPC, capped daily | Plain clicks are easy to fake |
| New vs. returning customer | Shown; bonus later | Brands value new customers more |
| Add to cart / lead | Shown only | A middle step for long sales |
| AdMagic Neural Score | Shown on each offer | Ties the two halves of the product |
| Likes, shares, comments | Not paid | Easy to fake; Meta doesn't share them per affiliate |
| Views / impressions | Not paid | Can't be verified from a link |
| Refunds | Claw back during hold | Protects the brand |

**Affiliate types:** `creator` (creators and publishers), `agency` (agencies and media buyers), `agent` (AI agents, who get offers and links through our MCP tools). All three must have a verified Qatom account before any payout.

**Attribution rules**

- Last click wins, 30-day window. `/r/{code}` logs the click, sets a first-party cookie, and redirects to the landing page with `?aff={code}`.
- **Qualified click:** the landing page beacon reports 5+ seconds on page, and it's the first qualified click from that visitor (hash of IP + user agent + day) for that offer that day.
- **CPA:** fixed amount per sale. **Revenue share:** % of order value. An offer can carry both, and both are paid.
- **Refund:** inside the hold window the earning becomes `clawed_back`; after payout it's recorded as a negative balance against future earnings.

**Payout timing (brand picks per offer)**

- **Hold then release:** earning waits `hold_minutes` (2 for the demo, 7–30 days for real), then is paid. Released by the cron, on every read, or by the Release button.
- **Instant:** paid as soon as the event is verified.
- **Batch:** earnings add up until the brand clicks **Pay affiliates**; one payment and one receipt per affiliate.

**Fraud checks before any payout**

1. Click dedupe + dwell time, as above.
2. Signed webhooks: `X-AdMagic-Signature: sha256=<HMAC of raw body with the offer's secret>`, checked in constant time; duplicate `order_id` rejected.
3. Per-affiliate daily cap per offer: above it, earnings become `blocked` until the brand approves (phone approval through Qatom for large amounts).
4. Verified identity: no payout without a verified `qatom_account_id`; earnings wait as `payable` until then.
5. Offer total budget: reached → offer auto-pauses.

**Tables**

- `affiliate_offers`: creative\_url, creative\_type, analysis\_id, neural\_score, landing\_url, cpc\_usd, cpa\_usd, revshare\_pct, payout\_mode (hold/instant/batch), hold\_minutes, daily\_cap\_per\_affiliate\_usd, total\_budget\_usd, webhook\_secret, status
- `affiliates`: type, display\_name, qatom\_account\_id, verified
- `affiliate_links`: offer\_id, affiliate\_id, code (unique)
- `affiliate_events`: link\_id, type (click, qualified\_click, conversion, refund), visitor\_hash, order\_id (unique per offer), order\_value\_usd, is\_new\_customer, dwell\_ms
- `affiliate_earnings`: event\_id, affiliate\_id, offer\_id, amount\_usd, status (pending\_hold, payable, paid, clawed\_back, blocked), release\_at, payout\_id
- `affiliate_payouts`: affiliate\_id, amount\_usd, qatom\_receipt\_id, status (pending\_approval, paid, failed)

**Routes**

| Route | Access | Purpose |
| --- | --- | --- |
| `GET/POST /api/affiliates/offers`, `PATCH .../offers/:id` | Brand | Create and edit offers |
| `GET/POST /api/affiliates`, `POST .../:id/verify` | Brand | Invite and verify affiliates |
| `POST /api/affiliates/links` | Brand | Create a tracked link |
| `GET /r/:code` | Public | Log click, set cookie, redirect |
| `POST /api/affiliates/beacon` | Public | Dwell time for qualified clicks |
| `POST /api/affiliates/webhooks/conversion` | Public, signed | Record a sale |
| `POST /api/affiliates/webhooks/refund` | Public, signed | Record a refund |
| `POST /api/affiliates/payouts/batch` | Brand | Pay all payable earnings for an offer |
| `POST /api/affiliates/payouts/release` | Brand | Release holds that are due |
| `GET /api/affiliates/stats?offer_id=` | Brand | Totals per metric and per affiliate |

**MCP tools for AI-agent affiliates** (at `/api/mcp`): `list_affiliate_offers`, `get_affiliate_link(offer_id, qatom_account_id)`, `get_affiliate_earnings(qatom_account_id)`.

**Affiliates page (`/affiliates`)**, four tabs:

1. **Offers:** creative thumbnail, Neural Score badge, payout terms, mode, spend vs. budget, status. New offer form; webhook URL and secret shown once.
2. **Affiliates:** by type, verification status, links, earnings. Invite creates a tracked link.
3. **Performance:** tiles for clicks, qualified clicks, conversions, conversion rate, revenue, payouts, and return on payouts (revenue ÷ payouts); a chart over time; a table per affiliate.
4. **Payouts:** earnings by status, a countdown on holds, Pay affiliates button, Approve/Reject on blocked rows, a receipt link on each paid row.

**Demo store (`/demo-store/:offerId`):** the offer's creative as a product, **Buy $49** and **Refund** buttons. The server signs and sends the webhooks (never the browser), and the page sends the dwell beacon.

## Access control and Activity page

No user sign-up for the hackathon: the app runs one seeded demo brand account, and every caller (the extension and each AI agent) gets its own scoped, revocable token. Control over money and agents is what the Security criterion scores (25%); a login page isn't. Multi-user sign-in with Clerk is the post-hackathon step and nothing here blocks it.

**Why not multi-user sign-in now:** no judging criterion rewards it, judges see one logged-in account anyway, it adds 3+ hours (`user_id` on every table and query, extension session sync, per-user wallets), and it adds live-demo failure points (redirects, expired sessions).

**Brand access to the web app:** one demo brand, seeded. Pages are protected by a single admin password (env `ADMIN_PASSWORD`) set in a signed, HTTP-only cookie. Good enough for a demo; replaced by Clerk later.

**Scoped tokens**

| Caller | How it gets a token | Can do | Can't do | Limits |
| --- | --- | --- | --- | --- |
| Chrome extension | Pairing: Settings shows a 6-digit code (valid 5 min); the popup sends it to `POST /api/pair` and gets a token | Buy AdMagic items, read its own results and budget | Create offers, pay affiliates, change budget | Daily budget, wallet ceiling, expires in 7 days |
| AI-agent affiliate | Brand creates it in the Access panel of the Activity page; shown once | `list_affiliate_offers`, `get_affiliate_link`, `get_affiliate_earnings` (its own only) | Move money, see other affiliates, edit offers | Per-agent daily payout cap; paid only to its verified Qatom account |
| Brand campaign agent (optional) | Same as above, with the `buy` scope | Buy AdMagic items from its own Qatom wallet | Affiliate payouts | Its Qatom wallet's hard ceiling + phone approval above the limit |

- Tokens are random 32-byte strings; only their SHA-256 is stored (`api_tokens`: id, name, kind, scopes\[\], token\_hash, expires\_at, last\_used\_at, revoked\_at).
- Every API route and MCP tool checks the token's scopes before anything else. A missing scope returns 403 and is written to the Blocked log.
- **Revoke** on any token takes effect on the next call. The demo shows it once: revoke the extension, click Validate, see "Access revoked".

**Activity page (`/activity`)** — the one place to see everything, and the closing screen of the demo.

| Panel | Shows |
| --- | --- |
| Today | Spend vs. daily budget, wallet balances (buyer and offer wallets), number of analyses, affiliate revenue vs. payouts |
| Analyses | Every scored ad: thumbnail, score, top insight, price, cached or paid, receipt link |
| Payments | Every Qatom payment in both directions (to AdMagic, to affiliates), status, phone approvals |
| Blocked | Every refused attempt and why: over budget, bad webhook signature, duplicate order, click spam, cap reached, missing scope, revoked token |
| Access | Paired extensions and agent tokens with scopes, last used, Revoke button; Pair new extension shows a code |

It reads the same tables as the rest of the app (plus `blocked_events`: id, caller, reason, detail\_json, created\_at), so it adds one page and one table, about 1.5 hours in total with the token work.

## Qatom integration and value flow

Two money flows run through Qatom, and every payment in both carries a Qatom receipt.

| Flow | Who pays | Who gets paid | For what | Price |
| --- | --- | --- | --- | --- |
| Validation | Brand's agent wallet (`QATOM_BUYER_WALLET_ID`) | AdMagic (keeps 100%) | One AdMagic analysis | $0.99 image, $1.99 video, $2.99 Compare |
| Affiliate payouts | Brand's offer wallet (`QATOM_OFFER_WALLET_ID`) | Creator, agency or AI agent | Verified clicks and sales | Set per offer (CPC, CPA, revenue share %) |

**What Qatom gives us (live today, per the Qatom use-case PDF):** catalog listing and agent discovery through the Qatom MCP, per-call USD pricing, agent wallets whose balance is a hard ceiling, phone approval in the Qatom Authenticator app, a receipt on every purchase, settlement in under a second, and split payouts.

**AdMagic's listings (seller side):** in AdMagic's Qatom seller account, create "Neural Score, image" ($0.99), "Neural Analysis, video" ($1.99) and "Compare" ($2.99). Each points at our AdMagic MCP tool or an HTTPS endpoint. The Qatom team approves them. Put the item IDs in env vars.

**One module, swappable (`lib/qatom.ts`):**

```ts
interface QatomClient {
  purchase(p: { walletId: string; itemId: string; input: unknown; idempotencyKey: string }):
    Promise<{ status: 'paid' | 'pending_approval' | 'failed'; purchaseId: string; receiptId?: string; receiptUrl?: string; output?: unknown; reason?: string }>;
  getPurchase(purchaseId: string): Promise<{ status: 'paid' | 'pending_approval' | 'failed'; receiptId?: string; output?: unknown }>;
  payAccount(p: { fromWalletId: string; toAccountId: string; amountUsd: number; memo: string; idempotencyKey: string }):
    Promise<{ status: 'paid' | 'pending_approval' | 'failed'; receiptId?: string; receiptUrl?: string }>;
  getWalletBalance(walletId: string): Promise<{ balanceUsd: number }>;
  verifyAccount(accountId: string): Promise<{ verified: boolean }>;
}
```

- `QATOM_MODE=mock` uses `MockQatomClient` (in-memory balance, fake receipts, 3-second fake phone approval for amounts over $2) so both people can build before the live API is wired.
- `QATOM_MODE=live` uses the real Qatom API or MCP. Wire this as soon as the Qatom team confirms the calls.
- Idempotency keys: `hash + item` for analyses, the payout ID for affiliate payouts. A retry never pays twice.

**If Qatom can't pay one account directly:** fall back to split payouts on a sale. The demo store "sale" becomes a Qatom purchase by the visitor, with the affiliate's share split at settlement. Confirm which works on site (see Open questions).

## Security and failure modes

The required write-up (`docs/security.md`) rests on one rule: money moves only on the server, after checks, with an idempotency key and a receipt.

**Threats and defenses**

| Threat | Defense |
| --- | --- |
| Wallet keys stolen from the browser | Keys only in Vercel env vars; the extension holds a scoped device token that can only buy AdMagic items within the budget |
| A page spams hidden or rotating ads to drain the wallet | Click-to-pay only; hidden elements get no button; hash cache never pays twice for the same image |
| Overspending | Daily budget on our side + Qatom wallet ceiling + phone approval above the limit |
| Other sites calling our API | Scoped bearer token on every call; CORS limited to `EXTENSION_ORIGIN` |
| Leaked extension or agent token | It only buys AdMagic items within the daily budget; revoke it on the Activity page; tokens expire in 7 days |
| Fake sales | HMAC-signed webhooks, constant-time compare, unique `order_id`; signing only on the server |
| Click spam by an affiliate | Unique visitor per day + 5 s dwell + daily cap per affiliate |
| Paying the wrong person | Verified Qatom account required; payouts go to that account only |
| Refund after payout | Hold mode by default for real offers; negative balance against future earnings |
| Prompt injection via ad text sent to AI agents | MCP tools return structured data only; offer text is never treated as instructions |

**Failure modes**

| What fails | What happens |
| --- | --- |
| Payment succeeds, AdMagic errors | Purchase saved with its receipt; retry analysis without paying again (same idempotency key) |
| Phone approval times out or is declined | Purchase marked failed; nothing is charged; card shows "Not approved" |
| Wallet ceiling reached | 402 with balance; popup shows "Top up the wallet" |
| Qatom down | Purchase fails cleanly; nothing analyzed; cached results still show |
| Ad Library layout changes | No buttons appear; popup offers paste-a-URL |
| Vercel function timeout on video | Return 202 with the purchase ID; extension polls `/api/purchase/:id` |
| Webhook sent twice | Duplicate `order_id` ignored, 200 returned |
| Affiliate payout fails | Earning stays `payable`; retry with the same payout ID |

## Timeline and team split

The must-have demo (image score, Compare, receipts, limits, affiliate payout) works by 2 AM Sunday, with the validator flow done by 6 PM while still on site. The morning is for the backup video, the write-up and submission.

&#91;embedded content: build timeline · 2 people, Sat 2 PM to Sun 10 AM\]

If time slips, cut in this order: video analysis and heatmap, then batch payouts, then revenue share. Keep CPA, CPC, hold-then-release, the signed webhook and the AI-agent affiliate.

## Demo script and submission

The two-minute demo shows both money flows live, with real USD in small amounts.

1. **Hook (15 s):** "Brands guess which ad will work, then pay affiliates for clicks they can't verify. We fix both with AdMagic and Qatom."
2. **Validate (30 s):** Meta Ad Library → click Validate on an ad → "Paying $0.99" → score, insights and heatmap appear with a receipt link. Click it again: cached, $0.
3. **Compare (20 s):** select 3 ads → Compare $2.99 → phone approval in Qatom Authenticator → winner highlighted.
4. **Offer (15 s):** Create offer on the winner: $0.10 per qualified click, $5 per sale, 10% revenue share, hold 2 minutes.
5. **AI-agent affiliate (20 s):** Claude, connected to our MCP, calls `list_affiliate_offers` and `get_affiliate_link`. Open the link, wait 5 s, Buy $49 in the demo store.
6. **Payout (20 s):** Payouts tab shows the earning on hold with a countdown → released → paid through Qatom with a receipt. Show AdMagic's sales in its Qatom seller account. End on the Activity page: every payment, the Blocked log, and a live revoke of the extension token.

Backup: a recorded video of the full run, in case the venue Wi-Fi or a live service fails.

**Submission checklist (BuilderBase, by 10 AM ET Sunday)**

- [ ] Working demo: production Vercel URL + extension zip in GitHub Releases
- [ ] Public GitHub repo with README: what it is, setup, env vars, how to load the extension
- [ ] Payment and value-flow explanation (`docs/value-flow.md` + the diagram)
- [ ] Security and failure-mode analysis (`docs/security.md`)
- [ ] Demo video (2 min)
- [ ] Track named: Use
- [ ] Rehearsed live presentation for judges and the full audience if we're a finalist

## Coding-agent prompt

Paste this into Claude Code (or Cursor) in the empty repo. It is self-contained, so the agent doesn't need this doc. Fill in the two AdMagic lines first.

```text
Build "AdMagic Validator" for a hackathon due Sun Nov 15 2026, 10 AM ET. Favor a working end-to-end demo over completeness.

STACK
- Next.js (App Router, TypeScript, Tailwind) at the repo root, deployed on Vercel.
- Postgres via DATABASE_URL (Neon on Vercel) with Drizzle ORM (@neondatabase/serverless). Migrations with drizzle-kit push.
- Chrome extension (Manifest V3, TypeScript, built with Vite) in /extension, output /extension/dist. Not deployed.
- MCP server route at app/api/mcp/[transport]/route.ts (use the mcp-handler package or the official MCP TypeScript SDK).
- Validate all inputs with zod. All money logic on the server only.

ADMAGIC (fill in)
- Our MCP endpoint: <ADMAGIC_MCP_URL>. Tools and response shapes: <paste tool names + example JSON>.
- Wrap them in lib/admagic.ts: scoreImage(url), analyzeVideo(url), compare(urls), heatmap(url). Normalize output to {score, insights[], heatmap?, emotionCurve?}.

QATOM
- lib/qatom.ts exports interface QatomClient { purchase({walletId,itemId,input,idempotencyKey}); getPurchase(id); payAccount({fromWalletId,toAccountId,amountUsd,memo,idempotencyKey}); getWalletBalance(walletId); verifyAccount(accountId) }.
- purchase/payAccount return {status: 'paid'|'pending_approval'|'failed', receiptId?, receiptUrl?, reason?}.
- QATOM_MODE=mock -> MockQatomClient: in-memory balance from env, fake receipt IDs, amounts > $2 return pending_approval and auto-approve after 3 s. QATOM_MODE=live -> LiveQatomClient with TODOs for the real API.
- Credentials only from server env vars. Never expose them to the browser or extension.

PART 1 - VALIDATOR API
POST /api/validate {creativeUrl, type:'image'|'video', withHeatmap?} and POST /api/compare {creativeUrls: 2-5}. Run in order:
1) auth: Authorization: Bearer token whose sha256 matches an api_tokens row that is not revoked or expired and has scope 'buy'; else 401/403 and insert a blocked_events row;
2) cache: fetch the creative, SHA-256 its bytes; if analyses has (hash,item) return it with its receipt and cached:true;
3) budget: if today's paid spend (America/Toronto day) + price > limit -> 402;
4) pay: qatom.purchase with idempotencyKey = hash+item; pending_approval -> 202 + purchaseId; failed -> 402 with reason;
5) analyze via lib/admagic.ts, save, return {score, insights, heatmap?, receiptId, receiptUrl, priceUsd, cached}.
Also: GET /api/purchase/:id, GET/PUT /api/budget, GET /api/receipts. Prices: image 0.99, video 1.99, compare 2.99. export const maxDuration = 60 on validate and compare.
Tables: analyses (unique creative_hash+item), purchases, settings (daily limit).

PART 2 - CHROME EXTENSION
- host_permissions: https://www.facebook.com/ads/library/* and the app URL. permissions: storage, activeTab.
- Content script: MutationObserver on Meta Ad Library; for each visible ad card find the main img/video; add Validate button and a Select checkbox. Skip hidden/zero-size elements.
- Background worker makes all backend calls with the paired device token (Authorization: Bearer); shows Paying / Waiting for phone approval / Analyzing / Done on the card; polls /api/purchase/:id on 202.
- Overlay: score badge, top 3 insights, heatmap on a canvas over the image, Receipt link, Create offer button (opens /affiliates?new=1&creative=...&score=...).
- Popup: spend vs daily limit (editable), wallet balance, last 10 receipts, Compare button (2-5 selected, labeled "$2.99 - needs phone approval"), settings for backend URL and a Pair-with-code field (shows 'Access revoked' on 401), paste-a-URL fallback.
- Nothing is ever bought without a user click.

PART 3 - AFFILIATES
Tables: affiliate_offers (creative_url, creative_type, analysis_id, neural_score, landing_url, cpc_usd, cpa_usd, revshare_pct, payout_mode hold|instant|batch, hold_minutes default 2, daily_cap_per_affiliate_usd, total_budget_usd, webhook_secret, status), affiliates (type creator|agency|agent, display_name, qatom_account_id, verified), affiliate_links (offer_id, affiliate_id, unique code), affiliate_events (link_id, type click|qualified_click|conversion|refund, visitor_hash, order_id unique per offer, order_value_usd, is_new_customer, dwell_ms), affiliate_earnings (event_id, affiliate_id, offer_id, amount_usd, status pending_hold|payable|paid|clawed_back|blocked, release_at, payout_id), affiliate_payouts (affiliate_id, amount_usd, qatom_receipt_id, status).
Rules:
- Last click, 30-day cookie. GET /r/:code logs click, sets cookie, redirects to landing_url?aff=code.
- Qualified click = beacon reports dwell >= 5000 ms AND first qualified click for sha256(ip+ua+date) on that offer today -> CPC earning.
- Conversion webhook -> CPA + revshare_pct * order_value earnings. Refund webhook -> clawed_back if still on hold, else negative balance.
- Webhooks: header X-AdMagic-Signature: sha256=<HMAC-SHA256(raw body, offer.webhook_secret)>, constant-time compare, reject duplicate order_id (return 200).
- Over daily cap per affiliate per offer -> blocked until brand approves. Unverified affiliate -> stays payable. Offer budget reached -> auto-pause.
- Payout modes: hold (release when release_at passes: on every earnings read, a Release button, and a Vercel cron at /api/cron/release-holds guarded by CRON_SECRET), instant (pay on verified event), batch (POST /api/affiliates/payouts/batch, one payment per affiliate).
- Payments via qatom.payAccount from QATOM_OFFER_WALLET_ID with idempotencyKey = payout id.
Routes: offers CRUD, affiliates CRUD + verify, links, beacon, conversion + refund webhooks, payouts batch + release, stats.
MCP tools: list_affiliate_offers, get_affiliate_link(offer_id, qatom_account_id), get_affiliate_earnings(qatom_account_id). Return structured JSON only.
Page /affiliates with tabs: Offers (thumbnail, score badge, terms, mode, spend vs budget, New offer form, webhook secret shown once), Affiliates (by type, verified, links, earnings, Invite), Performance (tiles: clicks, qualified clicks, conversions, conversion rate, revenue, payouts, revenue/payouts; chart over time; per-affiliate table), Payouts (by status, hold countdown, Pay affiliates, Approve/Reject blocked, receipt links).
Demo store /demo-store/[offerId]: creative as product, Buy $49 and Refund buttons that call a server action which signs and sends the webhook with a fresh order_id; page sends the dwell beacon.

PART 3B - ACCESS CONTROL AND ACTIVITY (no user sign-up)
- Single seeded demo brand. Web pages behind /login with ADMIN_PASSWORD, session in a signed HTTP-only cookie (SESSION_SECRET). No multi-user auth.
- Table api_tokens (id, name, kind extension|agent, scopes text[], token_hash, expires_at, last_used_at, revoked_at). Store only sha256 of a random 32-byte token; show the raw token once.
- Scopes: extension = ['buy','read_own']; AI-agent affiliate = ['offers:read','links:create','earnings:read_own'] tied to its affiliate_id; optional brand campaign agent = ['buy'] with its own Qatom wallet. No token can move money except through the server's checks.
- Pairing: Activity page shows a 6-digit code (valid 5 min, single use); POST /api/pair {code} returns an extension token (expires in 7 days).
- Every API route and MCP tool checks scopes first; failures -> 403 + blocked_events row. Revoke = set revoked_at; takes effect on the next call.
- Table blocked_events (id, caller, reason, detail_json, created_at). Also write rows for: over budget, bad webhook signature, duplicate order_id, click dedupe, cap reached, revoked/expired token.
- Page /activity with panels: Today (spend vs budget, both wallet balances, analyses count, affiliate revenue vs payouts), Analyses (thumbnail, score, top insight, price, cached/paid, receipt link), Payments (all Qatom payments both directions, status, approvals), Blocked (reason + detail), Access (tokens with scopes, last used, Revoke; Pair new extension; Create agent token).

PART 4 - REPO HYGIENE
- .env.example with: DATABASE_URL, ADMAGIC_MCP_URL, ADMAGIC_API_KEY, QATOM_MODE, QATOM_API_KEY, QATOM_BUYER_WALLET_ID, QATOM_OFFER_WALLET_ID, QATOM_ITEM_IMAGE, QATOM_ITEM_VIDEO, QATOM_ITEM_COMPARE, ADMIN_PASSWORD, SESSION_SECRET, EXTENSION_ORIGIN, DAILY_BUDGET_USD, CRON_SECRET.
- vercel.json with the cron. scripts/seed.ts: one offer (CPC 0.10, CPA 5, revshare 10%, hold 2 min) and three affiliates (creator, agency, agent) with links.
- Tests (vitest): cache hit doesn't pay, budget 402, click dedupe, dwell threshold, bad signature, duplicate order_id, refund clawback in hold, cap -> blocked, unverified not paid, idempotent payout retry, missing scope -> 403, revoked token -> 401, pairing code expires after 5 min.
- README: what it is, setup, Vercel deploy, loading the extension, demo steps. docs/value-flow.md and docs/security.md.

WORK ORDER
1) Repo scaffold, DB schema, mock Qatom, lib/admagic.ts. 2) /api/validate end to end with mock. 3) Extension Validate + overlay. 4) Compare + popup. 5) Affiliates tables, /r, beacon, webhooks, demo store. 6) Payout modes + /affiliates page. 7) MCP tools + scoped tokens, pairing, /activity page. 8) Live Qatom wiring. 9) Heatmap + video. Commit after each step with a clear message.
```

## Open questions

Ask these at the venue before 6 PM today; the first two decide how `lib/qatom.ts` is wired.

**Qatom team**

- [ ] How does a backend buy a catalog item: Qatom MCP, a REST API, or an SDK? What do the request and response look like, and where is the receipt?
- [ ] Can a backend pay another Qatom account directly (affiliate payouts), or only through split payouts on a sale?
- [ ] How do we trigger and poll phone approval from a backend purchase?
- [ ] Can AdMagic's three items be listed and approved this afternoon?
- [ ] Is there a test mode, or do we demo with small real USD amounts? How do we fund the two wallets?
- [ ] How do we check that an affiliate's Qatom account exists and is verified?

**AdMagic (our side)**

- [ ] Exact MCP tool names, inputs and outputs for image score, video analysis, Compare and heatmap.
- [ ] Typical response time for video analysis (decides whether we need the 202 + polling path).
- [ ] Daily capacity the private beta can take from outside traffic.
- [ ] Does the heatmap come back as an image, a grid of values, or coordinates?
