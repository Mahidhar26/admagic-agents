# Two-minute demo

Both money flows live, with real USD in small amounts, driven from the agent workspace. Payments use the default method in **Settings → Payments** (Qatom).

1. **Hook (15 s):** "Brands guess which ad will work, then pay affiliates for clicks they can't verify. AdMagic gives them a crew of agents that fixes both, and every payment has a receipt."
2. **Workspace (10 s):** open `/`. Point at the crew (Scout, Broker, Paymaster, Guard) and the guardrails: daily budget, phone approval above the wallet's limit, verified payout accounts only.
3. **Score (25 s):** paste a Meta Ad Library image link → **Run**. The run streams: Guard checks the budget → Scout pays $0.99 for one analysis (receipt) → Neural Score and insights. Run it again: served from cache, $0.
4. **Compare (20 s):** click **Compare my last 3 ads** ($2.99). The run stops at **Needs you**: approve on the phone, run again, winner highlighted. (Or show Compare from the extension's side panel on the Ad Library.)
5. **Offer (15 s):** Broker's **Open** step → offer wizard pre-filled with the winner: $0.10 per qualified click, $5 per sale, 10% share, hold 2 minutes → **Create offer**.
6. **AI-agent affiliate (20 s):** Claude, connected to `/api/mcp/mcp`, calls `list_affiliate_offers` and `get_affiliate_link`. Open the link, wait 5 s, **Buy $49** in the demo store. The workspace feed shows the sale.
7. **Payout (15 s):** type **Release due payouts** → Paymaster pays the affiliate with a receipt (or shows the hold countdown on Payouts).
8. **Close on Guard (10 s):** **Limits and access** shows every payment, everything refused, and a live revoke of the extension token (click Validate in the extension → "Access revoked").

Backup: a recorded video of the full run.

## Before going on stage

- Restart `next dev` (or use the Vercel URL) so the latest styles load.
- Tidy the data: pause test offers, keep the seeded demo offer and affiliates. `npm run seed` only adds; it doesn't clear.
- Pair the extension against the production URL; keep the seeded agent token for the MCP client.
- Fund both wallets; check the daily budget under **Limits and access**.
- Run **Re-check my last ad** once: it should come back from cache at $0.
