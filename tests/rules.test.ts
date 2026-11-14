import { describe, expect, it } from 'vitest';
import {
  checkToken, pairingValid, fromQatom, overBudget, torontoMidnight, signBody, verifySignature,
  isQualifiedClick, conversionEarnings, initialEarning, refundAction, payableTotal, PAIRING_MS,
} from '../lib/rules';
import { MockQatomClient } from '../lib/qatom';

const now = new Date('2026-11-15T15:00:00Z');
const offer = { cpcUsd: 0.1, cpaUsd: 5, revsharePct: 10, payoutMode: 'hold' as const, holdMinutes: 2, dailyCapPerAffiliateUsd: 20 };

describe('tokens', () => {
  const ok = { scopes: ['buy'], expiresAt: new Date(now.getTime() + 1000), revokedAt: null };
  it('accepts an active token with the scope', () => expect(checkToken(ok, 'buy', now)).toBe('ok'));
  it('missing scope -> 403 path', () => expect(checkToken(ok, 'offers:read', now)).toBe('missing_scope'));
  it('revoked token -> 401 path', () => expect(checkToken({ ...ok, revokedAt: now }, 'buy', now)).toBe('revoked'));
  it('expired token', () => expect(checkToken({ ...ok, expiresAt: now }, 'buy', now)).toBe('expired'));
  it('unknown token', () => expect(checkToken(undefined, 'buy', now)).toBe('missing'));
  it('pairing code expires after 5 min and is single use', () => {
    const p = { expiresAt: new Date(now.getTime() + PAIRING_MS), usedAt: null };
    expect(pairingValid(p, now)).toBe(true);
    expect(pairingValid(p, new Date(now.getTime() + PAIRING_MS))).toBe(false);
    expect(pairingValid({ ...p, usedAt: now }, now)).toBe(false);
  });
});

describe('budget', () => {
  it('402 when spend + price exceeds the limit', () => {
    expect(overBudget(9.5, 0.99, 10)).toBe(true);
    expect(overBudget(9.01, 0.99, 10)).toBe(false); // float-safe at the edge
  });
  it('day starts at Toronto midnight', () => {
    expect(torontoMidnight(now).toISOString()).toBe('2026-11-15T05:00:00.000Z'); // EST, UTC-5
    expect(torontoMidnight(new Date('2026-07-01T03:00:00Z')).toISOString()).toBe('2026-06-30T04:00:00.000Z'); // EDT, still June 30 in Toronto
  });
});

describe('webhooks', () => {
  const raw = JSON.stringify({ order_id: 'o1' });
  it('accepts a good signature', () => expect(verifySignature(raw, signBody(raw, 's'), 's')).toBe(true));
  it('rejects a bad or missing signature', () => {
    expect(verifySignature(raw, signBody(raw, 'other'), 's')).toBe(false);
    expect(verifySignature(raw, null, 's')).toBe(false);
    expect(verifySignature(raw + ' ', signBody(raw, 's'), 's')).toBe(false);
  });
});

describe('clicks', () => {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it('needs 5 s of dwell after the click', () => {
    expect(isQualifiedClick({ clickAt: ago(4000), alreadyQualifiedToday: false, now }).ok).toBe(false);
    expect(isQualifiedClick({ clickAt: ago(5000), alreadyQualifiedToday: false, now }).ok).toBe(true);
  });
  it('dedupes a second qualified click from the same visitor today', () =>
    expect(isQualifiedClick({ clickAt: ago(9000), alreadyQualifiedToday: true, now })).toEqual({ ok: false, reason: 'click_dedupe' }));
  it('needs a logged click', () => expect(isQualifiedClick({ clickAt: undefined, alreadyQualifiedToday: false, now }).ok).toBe(false));
});

describe('earnings', () => {
  it('pays CPA and revenue share on one sale', () =>
    expect(conversionEarnings(offer, 49)).toEqual([{ kind: 'cpa', amountUsd: 5 }, { kind: 'revshare', amountUsd: 4.9 }]));
  it('hold mode releases after hold_minutes', () => {
    const e = initialEarning(offer, { amountUsd: 5, earnedTodayUsd: 0, now });
    expect(e.status).toBe('pending_hold');
    expect(e.releaseAt!.getTime() - now.getTime()).toBe(120_000);
  });
  it('over the daily cap -> blocked', () => expect(initialEarning(offer, { amountUsd: 5, earnedTodayUsd: 16, now }).status).toBe('blocked'));
  it('refund claws back during hold, negative balance after payout', () => {
    expect(refundAction('pending_hold')).toBe('claw_back');
    expect(refundAction('blocked')).toBe('claw_back');
    expect(refundAction('paid')).toBe('negative_balance');
    expect(refundAction('clawed_back')).toBe('none');
  });
  it('negative balance waits for future earnings', () => expect(payableTotal([-5, 3])).toBeLessThan(0));
});

describe('mock Qatom', () => {
  it('a retry with the same idempotency key never pays twice', async () => {
    const q = new MockQatomClient(10);
    const a = await q.payAccount({ fromWalletId: 'w', toAccountId: 'x', amountUsd: 1, memo: '', idempotencyKey: 'payout-1' });
    const b = await q.payAccount({ fromWalletId: 'w', toAccountId: 'x', amountUsd: 1, memo: '', idempotencyKey: 'payout-1' });
    expect(a.status).toBe('paid');
    expect(a).toEqual(b);
    expect((await q.getWalletBalance('w')).balanceUsd).toBe(9);
  });
  it('over $2 waits for phone approval, then is paid', async () => {
    let t = 1_000_000;
    const q = new MockQatomClient(10, () => t);
    const p = await q.purchase({ walletId: 'w', itemId: 'c', priceUsd: 2.99, input: {}, idempotencyKey: 'k' });
    expect(p.status).toBe('pending_approval');
    t += 3000;
    expect((await q.getPurchase(p.purchaseId)).status).toBe('paid');
  });
  it('wallet ceiling -> failed', async () => {
    const q = new MockQatomClient(0.5);
    expect((await q.purchase({ walletId: 'w', itemId: 'i', priceUsd: 0.99, input: {}, idempotencyKey: 'k' })).status).toBe('failed');
  });
});

describe('qatom fulfilment secret', () => {
  it('accepts the saved header', () => expect(fromQatom('Bearer s3cret', 's3cret')).toBe(true));
  it('rejects a wrong or missing header', () => {
    expect(fromQatom('Bearer nope', 's3cret')).toBe(false);
    expect(fromQatom(null, 's3cret')).toBe(false);
  });
  it('refuses everything when no secret is configured', () => expect(fromQatom('Bearer ', undefined)).toBe(false));
});
