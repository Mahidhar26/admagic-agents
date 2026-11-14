# Two-minute demo

Both money flows live, with real USD in small amounts.

1. **Hook (15 s):** "Brands guess which ad will work, then pay affiliates for clicks they can't verify. We fix both with AdMagic and Qatom."
2. **Validate (30 s):** Meta Ad Library → **Validate** on an ad → "Paying $0.99" → score, insights and heatmap with a receipt link. Click again: cached, $0.
3. **Compare (20 s):** select 3 ads → popup **Compare $2.99** → phone approval in Qatom Authenticator → winner highlighted.
4. **Offer (15 s):** **Create offer** on the winner: $0.10 per qualified click, $5 per sale, 10% revenue share, hold 2 minutes.
5. **AI-agent affiliate (20 s):** Claude, connected to `/api/mcp/mcp`, calls `list_affiliate_offers` and `get_affiliate_link`. Open the link, wait 5 s, **Buy $49** in the demo store.
6. **Payout (20 s):** Affiliates → Payouts shows the earning on hold with a countdown → released → paid through Qatom with a receipt. Show AdMagic's sales in its Qatom seller account. End on **Activity**: every payment, the Blocked log, and a live revoke of the extension token (click Validate → "Access revoked").

Backup: a recorded video of the full run.

## Before going on stage

- `npm run seed` on the production database; keep the printed agent token.
- Pair the extension against the production URL.
- Fund both Qatom wallets; check the daily budget on Activity.
