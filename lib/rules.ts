/** Pure decision rules, kept free of I/O so tests can cover them directly. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- tokens ----
export type TokenRow = { scopes: string[]; expiresAt: Date | null; revokedAt: Date | null };
export type TokenCheck = 'ok' | 'missing' | 'revoked' | 'expired' | 'missing_scope';

export function checkToken(row: TokenRow | undefined, scope: string, now = new Date()): TokenCheck {
  if (!row) return 'missing';
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt && row.expiresAt <= now) return 'expired';
  return row.scopes.includes(scope) ? 'ok' : 'missing_scope';
}

export const PAIRING_MS = 5 * 60_000;
export const pairingValid = (p: { expiresAt: Date; usedAt: Date | null } | undefined, now = new Date()) =>
  !!p && !p.usedAt && p.expiresAt > now;

// ---- budget ----
/** Start of today in Toronto, as a UTC Date. */
export function torontoMidnight(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000; // Toronto wall clock minus real time
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offset);
}

export const overBudget = (spentTodayUsd: number, priceUsd: number, limitUsd: number) =>
  round2(spentTodayUsd + priceUsd) > limitUsd;

// ---- webhooks ----
export const signBody = (raw: string, secret: string) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

export function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(signBody(raw, secret));
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Qatom's fulfilment call carries the Authorization header saved on the catalog item. */
export function fromQatom(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(sha256(header)); // hash first so lengths match for timingSafeEqual
  const b = Buffer.from(sha256(`Bearer ${secret}`));
  return timingSafeEqual(a, b);
}

// ---- clicks ----
export const QUALIFIED_DWELL_MS = 5000;
export const visitorHash = (ip: string, ua: string, now = new Date()) =>
  sha256(`${ip}|${ua}|${now.toISOString().slice(0, 10)}`);

/** Qualified = a click from this visitor at least 5 s ago, and no qualified click from them on this offer today. */
export function isQualifiedClick(p: { clickAt: Date | undefined; alreadyQualifiedToday: boolean; now?: Date }) {
  const now = p.now ?? new Date();
  if (!p.clickAt) return { ok: false, reason: 'no_click' } as const;
  if (now.getTime() - p.clickAt.getTime() < QUALIFIED_DWELL_MS) return { ok: false, reason: 'dwell_too_short' } as const;
  if (p.alreadyQualifiedToday) return { ok: false, reason: 'click_dedupe' } as const;
  return { ok: true } as const;
}

// ---- earnings ----
type Offer = { cpcUsd: number; cpaUsd: number; revsharePct: number; payoutMode: 'hold' | 'instant' | 'batch'; holdMinutes: number; dailyCapPerAffiliateUsd: number };

export function conversionEarnings(offer: Offer, orderValueUsd: number) {
  const out: { kind: 'cpa' | 'revshare'; amountUsd: number }[] = [];
  if (offer.cpaUsd > 0) out.push({ kind: 'cpa', amountUsd: round2(offer.cpaUsd) });
  if (offer.revsharePct > 0) out.push({ kind: 'revshare', amountUsd: round2((orderValueUsd * offer.revsharePct) / 100) });
  return out;
}

/** Status a new earning starts in. Over the daily cap → blocked until the brand approves. */
export function initialEarning(offer: Offer, p: { amountUsd: number; earnedTodayUsd: number; now?: Date }) {
  const now = p.now ?? new Date();
  if (round2(p.earnedTodayUsd + p.amountUsd) > offer.dailyCapPerAffiliateUsd) return { status: 'blocked' as const, releaseAt: null };
  if (offer.payoutMode === 'hold') return { status: 'pending_hold' as const, releaseAt: new Date(now.getTime() + offer.holdMinutes * 60_000) };
  return { status: 'payable' as const, releaseAt: null };
}

/** What a refund does to one earning of the refunded order. */
export const refundAction = (status: string) =>
  status === 'paid' ? 'negative_balance' : status === 'clawed_back' ? 'none' : 'claw_back';

/** Sum of an affiliate's payable earnings (negatives from refunds after payout included). Pay only if positive. */
export const payableTotal = (amounts: number[]) => round2(amounts.reduce((a, b) => a + b, 0));
