# AdMagic Agents

A crew of AI agents that scores your ads before you spend, launches affiliate offers from the winners, and pays creators, agencies and AI agents only for verified results, with a receipt for every payment.

## Try the demo

**Live app:** https://admagic-validator.vercel.app

| | |
| --- | --- |
| Email | `demo@admagic.ai` |
| Password | `admagic-demo` |

The home page is an overview; **Log in** (or **Sign up**) shows and pre-fills these and takes you to the **Workspace** (`/workspace`). It's one shared demo brand: everything you do is visible to other visitors.

What to try in the Workspace, in this order:

1. Click **Budget and wallets**: Guard and Paymaster report today's spend, wallet balances and what affiliates are owed.
2. Click **Re-check my last ad**: the run streams each step (budget check → payment → AdMagic score). It was scored before, so it comes back from cache at $0.
3. Click **Launch an offer from my best ad**: Broker picks your best-scored ad and drafts terms; **Open** takes you to the offer wizard.
4. Open **Limits and access** (Guard) to see every payment, everything refused, and the scoped tokens you can revoke.
5. **Settings → Payments**: Qatom is the default payment method.

Scoring a **new** ad link costs a real AdMagic analysis and counts against the demo's daily budget; repeats are free. Payments run in Qatom test mode, so no real money moves.

## The agents

| Agent | Job | Page |
| --- | --- | --- |
| **Scout** | Scores ads with AdMagic's neural analysis (single or 2–5 to compare) | Scored ads |
| **Broker** | Turns winners into affiliate offers; tracks qualified clicks and sales | Offers, Affiliates, Performance |
| **Paymaster** | Releases holds and pays verified affiliates, one receipt per payout | Payouts |
| **Guard** | Daily budget, phone approval above the wallet limit, scoped tokens, the refused log | Limits and access |

You talk to them in the Workspace composer: paste an ad link to score it, 2–5 links to compare, or ask to launch an offer, release payouts, or check status. Plain rules map your words to these tasks (`lib/agent.ts`), so a run never guesses. Each run streams its real steps from `/api/agent/run`.

## How it works

Validate any Meta ad in one click, then pay the people who sell it, all with receipts.

A Chrome extension scores Meta Ad Library ads with AdMagic's neural analysis, paid per use through Qatom. The same Next.js app lets the brand turn a validated ad into an affiliate offer and pay creators, agencies and AI agents for verified clicks and sales through Qatom.

Built for the Agentic Payments Hackathon Toronto, **Use** track (with a light Control layer).

- How money moves: [docs/value-flow.md](docs/value-flow.md)
- Security and failure modes: [docs/security.md](docs/security.md)
- Two-minute demo: [docs/demo-script.md](docs/demo-script.md)
- Reference: [build spec](docs/reference/AdMagic-Validator-Build-Spec.pdf) · [AdMagic on Qatom use case](docs/reference/AdMagic-on-Qatom-use-case-v1.0.pdf)

## What's in the repo

| Path | What |
| --- | --- |
| `app/api/validate`, `compare`, `purchase/[id]`, `budget`, `receipts` | Validator API: auth → cache → budget → pay (Qatom) → analyze (AdMagic) |
| `app/api/affiliates/...`, `app/r/[code]` | Offers, affiliates, tracked links, dwell beacon, signed webhooks, payouts, stats |
| `app/api/qatom/score`, `compare` | Fulfilment for the Qatom catalog items "AdMagic: Score one ad" (`{ image_url, objective? }`) and "AdMagic: Compare ad creatives" (`{ image_urls, objective? }`). Qatom calls them after the buyer pays, with `Authorization: Bearer $QATOM_FULFILMENT_SECRET` |
| `app/api/mcp/[transport]` | MCP tools for AI-agent affiliates |
| `app/api/pair`, `app/api/tokens` | Extension pairing and scoped, revocable tokens |
| `app/page.tsx` | Public landing page (overview, log in, sign up) |
| `app/workspace`, `app/Mission.tsx`, `app/api/agent/run` | Agent workspace: composer, streamed runs, crew, guardrails, activity feed |
| `app/validator`, `app/affiliates`, `app/activity`, `app/settings`, `app/demo-store/[offerId]`, `app/login` | Agent pages, settings and the demo store |
| `lib/qatom.ts` | `QatomClient` interface, `MockQatomClient`, `LiveQatomClient` (TODO) |
| `lib/admagic.ts` | AdMagic client; mock until the real endpoints are wired (`TODO(admagic)`) |
| `lib/rules.ts` | Pure money and fraud rules (tested in `tests/`) |
| `extension/` | Chrome extension (Manifest V3), built to `extension/dist` |

## Setup

```bash
npm install
cp .env.example .env.local   # or: vercel env pull .env.local
npm run db:push              # create tables (needs DATABASE_URL)
npm run seed                 # demo offer, 3 affiliates, prints an agent MCP token once
npm run dev
```

Both `QATOM_MODE` and `ADMAGIC_MODE` default to `mock`, so the whole flow runs before the live APIs are wired. In mock mode, payments over $2 wait 3 seconds for a fake phone approval.

Tests: `npm test`.

### Deploy on Vercel

1. Import this repo in Vercel (framework: Next.js).
2. Storage → add Postgres (Neon). `DATABASE_URL` is added for you.
3. Add the variables from `.env.example` for Production and Preview.
4. `vercel.json` runs `/api/cron/release-holds` once a day, the most the Hobby plan allows (protected by `CRON_SECRET`). Holds are also released on every read and by the **Release due payouts** button, so the 2-minute demo hold never waits on the cron.

### Load the extension

```bash
npm run ext:build
```

Then open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `extension/dist`. In the popup, set the backend URL (your Vercel URL or `http://localhost:3000`). On the app's **Activity** page, click **Pair new extension** and enter the 6-digit code in the popup. Put the extension's ID in `EXTENSION_ORIGIN`.

### Connect an AI-agent affiliate

Create a token on **Activity → Access** (or use the one `npm run seed` prints), then add the MCP server in your client:

```json
{ "admagic-affiliates": { "url": "https://<your-app>/api/mcp/mcp", "headers": { "Authorization": "Bearer <agent token>" } } }
```

Tools: `list_affiliate_offers`, `get_affiliate_link(offer_id, qatom_account_id)`, `get_affiliate_earnings(qatom_account_id)`.

## Qatom catalogues

We are listing three catalogues on Qatom ([qatom.ai/learn](https://qatom.ai/learn)):

| Catalogue | AdMagic tools | In this repo |
| --- | --- | --- |
| **Analyze**: score, verdict, what works, what to change | `admagic_analyze_creative`, `admagic_get_analysis`, `admagic_creative_feedback`, `admagic_usage` | Validator API + extension (`lib/admagic.ts`) |
| **Design Lab**: build creatives from insights or prompts | `admagic_design_prompt`, `admagic_generate_image`, `admagic_get_job`, `admagic_generate_copy` | Not built yet |
| **Attribution and affiliate payouts** (new, not in AdMagic) | none | Affiliates API, `/r/{code}`, webhooks, payouts, MCP tools |

## AdMagic connection

`ADMAGIC_MODE=live` calls AdMagic's MCP endpoint (`ADMAGIC_MCP_URL`, JSON-RPC `tools/call`, `Authorization: Bearer $ADMAGIC_API_KEY`).

- Image score → `admagic_analyze_creative` with `image_url` and `objective` (default `engagement`).
- Compare → one `admagic_analyze_creative` per creative, ranked (AdMagic has no compare tool).
- Video → not offered: AdMagic has no video tool yet, so `/api/validate` refuses video before paying.
- Heatmap → drawn only for attention elements that come back with a box.
- `toAnalysis()` in `lib/admagic.ts` maps the live response (checked 2026-11-14): `score`, `verdict`, `scores` (five dimensions), `attention.elements[].sharePct` and `box` (in % of the image). Re-check with `npm run check:admagic` (costs 1 analysis).

## Still to wire

- `lib/qatom.ts`: `LiveQatomClient` once the Qatom team confirms purchase, payout, approval polling and account verification calls.
