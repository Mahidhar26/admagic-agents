# AdMagic Validator + Affiliates

Validate any Meta ad in one click, then pay the people who sell it, all with Qatom receipts.

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
| `app/affiliates`, `app/activity`, `app/demo-store/[offerId]`, `app/login` | Brand pages and the demo store |
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
4. `vercel.json` runs `/api/cron/release-holds` hourly (protected by `CRON_SECRET`). Holds are also released on every read and by the **Release due payouts** button, so the 2-minute demo hold never waits on the cron.

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
