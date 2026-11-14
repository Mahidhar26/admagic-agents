# Security and failure modes

One rule: money moves only on the server, after checks, with an idempotency key and a receipt.

## Access

- No wallet keys outside Vercel env vars. The extension and each AI agent hold their own scoped token.
- Tokens are 32 random bytes; only their SHA-256 is stored. They expire in 7 days and **Revoke** takes effect on the next call.
- Scopes: extension = `buy`, `read_own`; AI-agent affiliate = `offers:read`, `links:create`, `earnings:read_own`, tied to its own affiliate and Qatom account.
- Every route and MCP tool checks the token's scope first. Failures return 401/403 and are written to the **Blocked** log.
- Extension pairing uses a 6-digit code, valid 5 minutes, single use, claimed atomically. Pairing locks for 5 minutes after 20 wrong codes.
- Brand pages sit behind one admin password and a signed, HTTP-only session cookie (multi-user sign-in comes after the hackathon).

## Threats and defenses

| Threat | Defense |
| --- | --- |
| Wallet keys stolen from the browser | Keys only on the server; the extension's token can only buy AdMagic items within the budget |
| A page spams hidden or rotating ads to drain the wallet | Click-to-pay only; hidden and small elements get no button; content-hash cache never pays twice |
| Overspending | Daily budget (Toronto day) + Qatom wallet ceiling + phone approval above the limit |
| Other sites calling the API | Scoped bearer token on every call; CORS limited to `EXTENSION_ORIGIN` |
| Server fetching internal URLs via a creative URL | https only, no IP literals or local names, no redirects, 20 s timeout, 50 MB cap |
| Leaked extension or agent token | Limited scope, 7-day expiry, revoke on the Activity page |
| Fake sales | HMAC-SHA256 signed webhooks, constant-time compare, unique `order_id` per offer; signing only on the server |
| Click spam | Dwell measured on the server from the logged click (≥ 5 s), one qualified click per visitor per offer per day, daily cap per affiliate |
| Paying the wrong person | Verified Qatom account required; an agent can only read or link its own account |
| Refund after payout | Hold mode by default; negative balance against future earnings |
| Prompt injection via ad or offer text sent to AI agents | MCP tools return structured JSON only |
| Offer overspend | Total offer budget; reaching it pauses the offer |

## Failure modes

| What fails | What happens |
| --- | --- |
| Payment succeeds, AdMagic errors | Purchase is saved with its receipt; the next call analyzes without paying again (same idempotency key) |
| Phone approval declined or times out | Purchase marked failed, nothing charged, card shows "Not approved" |
| Wallet ceiling reached | 402 with the reason; popup tells the user to top up |
| Qatom down | Purchase fails cleanly; nothing analyzed; cached results still show |
| Ad Library layout changes | No buttons appear; popup offers paste-a-URL |
| Slow video analysis | 202 with the purchase ID; the extension polls `/api/purchase/:id` |
| Webhook sent twice | Duplicate `order_id` ignored, 200 returned, logged to Blocked |
| Affiliate payout fails | Earnings stay attached to the failed payout and are retried with the same payout ID |

## Known limits (hackathon scope)

- The creative URL check blocks IP literals and local names but not DNS names that resolve to private addresses; add an allowlist of ad CDNs before launch.
- The mock Qatom client keeps balances in memory per server instance.
- The visitor hash uses IP + user agent + day; shared IPs can undercount qualified clicks.
