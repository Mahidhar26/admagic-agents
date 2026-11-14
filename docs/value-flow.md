# Payment and value flow

Two money flows run through Qatom, and every payment in both carries a Qatom receipt.

```
 Chrome extension ──(scoped token)──┐
 AI-agent affiliate ──(MCP token)───┤
 Demo store ──(signed webhook)──────┤
                                    ▼
                    Next.js app on Vercel (holds all wallet keys)
                      │                               │
     Validation flow  │                               │  Affiliate flow
                      ▼                               ▼
     Buyer wallet ──Qatom──▶ AdMagic        Offer wallet ──Qatom──▶ creator / agency / AI agent
     ($0.99 / $1.99 / $2.99, receipt)        (CPC, CPA, revenue share, receipt)
```

| Flow | Who pays | Who gets paid | For what | Price |
| --- | --- | --- | --- | --- |
| Validation | Brand's agent wallet (`QATOM_BUYER_WALLET_ID`) | AdMagic (keeps 100%) | One AdMagic analysis | $0.99 image, $1.99 video, $2.99 Compare |
| Affiliate payouts | Brand's offer wallet (`QATOM_OFFER_WALLET_ID`) | Creator, agency or AI agent | Verified qualified clicks and sales | Per offer: CPC, CPA, revenue share % |

## Validation

1. The extension sends a creative URL with its paired token.
2. The server hashes the creative's bytes. A creative already analyzed returns the saved result and its original receipt: `cached: true`, no payment.
3. Today's spend (Toronto day) plus the price must fit the daily budget.
4. The server buys the AdMagic item on Qatom with idempotency key `hash:item`. Above the wallet's limit, the owner approves on their phone; the extension polls until then.
5. The server calls AdMagic, saves the result with the receipt, and returns it.

AdMagic sells on Qatom and keeps the full price; the extension is AdMagic's free distribution channel.

## Affiliates

1. The brand turns a scored ad into an offer (AdMagic score shown on the offer) with CPC, CPA and/or revenue share, a payout timing (hold, instant or batch), a daily cap per affiliate and a total budget.
2. Affiliates (creators, agencies, AI agents via MCP) get a tracked link `/r/{code}`. Last click wins for 30 days.
3. A **qualified click** is a logged click from a visitor who stays 5 s, once per visitor per offer per day → CPC.
4. A **sale** arrives as an HMAC-signed webhook → CPA + revenue share of the order value.
5. Payout: **hold** releases after `hold_minutes`; **instant** pays at once; **batch** waits for **Pay affiliates**. One Qatom payment and receipt per affiliate per payout, idempotency key = payout ID.
6. A **refund** claws back earnings still on hold; after payout it becomes a negative balance against future earnings.

No affiliate is paid without a verified Qatom account; their earnings wait as `payable` until then.
