import { and, eq, gte, lte, inArray, sql, ne, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from './db';
import { qatom, WALLETS } from './qatom';
import { block } from './auth';
import { initialEarning, payableTotal, torontoMidnight } from './rules';

const E = schema.affiliateEarnings;
type Offer = typeof schema.affiliateOffers.$inferSelect;
type Link = typeof schema.affiliateLinks.$inferSelect;

export const linkUrl = (origin: string, code: string) => `${origin}/r/${code}`;

/** Adds earnings for one verified event, applying the offer budget and the per-affiliate daily cap. */
export async function addEarnings(offer: Offer, link: Link, eventId: string, items: { kind: 'cpc' | 'cpa' | 'revshare'; amountUsd: number }[]) {
  const [{ committed }] = await db.select({ committed: sql<number>`coalesce(sum(${E.amountUsd}), 0)::float` }).from(E)
    .where(and(eq(E.offerId, offer.id), ne(E.status, 'clawed_back'), gt(E.amountUsd, 0)));
  const total = items.reduce((a, i) => a + i.amountUsd, 0);
  if (committed + total > offer.totalBudgetUsd) {
    await db.update(schema.affiliateOffers).set({ status: 'paused' }).where(eq(schema.affiliateOffers.id, offer.id));
    await block(`offer ${offer.name}`, 'offer budget reached, offer paused', { committed, total, budget: offer.totalBudgetUsd });
    return [];
  }
  const [{ today }] = await db.select({ today: sql<number>`coalesce(sum(${E.amountUsd}), 0)::float` }).from(E)
    .where(and(eq(E.offerId, offer.id), eq(E.affiliateId, link.affiliateId), ne(E.status, 'clawed_back'), gte(E.createdAt, torontoMidnight())));
  let earnedToday = today;
  const rows = [];
  for (const i of items) {
    const start = initialEarning(offer, { amountUsd: i.amountUsd, earnedTodayUsd: earnedToday });
    earnedToday += i.amountUsd;
    if (start.status === 'blocked') await block(`affiliate ${link.code}`, 'daily cap reached', { offer: offer.name, amountUsd: i.amountUsd });
    rows.push({ eventId, affiliateId: link.affiliateId, offerId: offer.id, kind: i.kind, amountUsd: i.amountUsd, ...start });
  }
  const inserted = rows.length ? await db.insert(E).values(rows).returning() : [];
  if (offer.payoutMode === 'instant') await payAffiliate(link.affiliateId, offer.id);
  return inserted;
}

/** Pays an affiliate everything payable on one offer (or all offers). One Qatom payment, one receipt. */
export async function payAffiliate(affiliateId: string, offerId?: string) {
  const aff = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, affiliateId) });
  if (!aff?.verified || !aff.qatomAccountId) return null; // no payout without a verified Qatom account; earnings wait as payable

  // a failed payout is retried with the same payout id, so Qatom never pays twice
  let payout = await db.query.affiliatePayouts.findFirst({
    where: and(eq(schema.affiliatePayouts.affiliateId, affiliateId), inArray(schema.affiliatePayouts.status, ['failed', 'pending_approval'])),
  });
  if (!payout) {
    // no offer named = automatic settling, which never touches batch offers (the brand pays those by hand)
    const nonBatch = db.select({ id: schema.affiliateOffers.id }).from(schema.affiliateOffers).where(ne(schema.affiliateOffers.payoutMode, 'batch'));
    const due = await db.select().from(E)
      .where(and(eq(E.affiliateId, affiliateId), eq(E.status, 'payable'), offerId ? eq(E.offerId, offerId) : inArray(E.offerId, nonBatch)));
    const amountUsd = payableTotal(due.map((d) => d.amountUsd));
    if (amountUsd <= 0) return null; // negative balance from a refund after payout waits for future earnings
    [payout] = await db.insert(schema.affiliatePayouts).values({ affiliateId, amountUsd, status: 'pending_approval' }).returning();
    await db.update(E).set({ payoutId: payout.id }).where(inArray(E.id, due.map((d) => d.id)));
  }
  const r = await qatom.payAccount({
    fromWalletId: WALLETS.offer, toAccountId: aff.qatomAccountId, amountUsd: payout.amountUsd,
    memo: `AdMagic affiliate payout ${payout.id}`, idempotencyKey: payout.id,
  });
  await db.update(schema.affiliatePayouts)
    .set({ status: r.status, qatomReceiptId: r.receiptId ?? null, receiptUrl: r.receiptUrl ?? null })
    .where(eq(schema.affiliatePayouts.id, payout.id));
  if (r.status === 'paid') await db.update(E).set({ status: 'paid' }).where(eq(E.payoutId, payout.id));
  if (r.status === 'failed') await block(`payout ${payout.id}`, 'affiliate payout failed', { reason: r.reason });
  return { ...payout, ...r };
}

/** Releases due holds and pays hold/instant offers. Runs on the cron, on every earnings read and from the Release button. */
export async function settle() {
  await db.update(E).set({ status: 'payable' }).where(and(eq(E.status, 'pending_hold'), lte(E.releaseAt, new Date())));
  const due = await db.selectDistinct({ affiliateId: E.affiliateId, offerId: E.offerId }).from(E)
    .innerJoin(schema.affiliateOffers, eq(schema.affiliateOffers.id, E.offerId))
    .where(and(eq(E.status, 'payable'), ne(schema.affiliateOffers.payoutMode, 'batch')));
  const pending = await db.selectDistinct({ affiliateId: schema.affiliatePayouts.affiliateId }).from(schema.affiliatePayouts)
    .where(inArray(schema.affiliatePayouts.status, ['failed', 'pending_approval']));
  const ids = new Set([...due.map((d) => d.affiliateId), ...pending.map((p) => p.affiliateId)]);
  for (const id of ids) await payAffiliate(id);
}

/** Batch mode: pay every affiliate with payable earnings on this offer. */
export async function payBatch(offerId: string) {
  const affs = await db.selectDistinct({ affiliateId: E.affiliateId }).from(E).where(and(eq(E.offerId, offerId), eq(E.status, 'payable')));
  return Promise.all(affs.map((a) => payAffiliate(a.affiliateId, offerId)));
}

export const OfferBody = z.object({
  name: z.string().min(1).max(120),
  creativeUrl: z.url(),
  creativeType: z.enum(['image', 'video']).default('image'),
  analysisId: z.uuid().optional().or(z.literal('').transform(() => undefined)),
  neuralScore: z.coerce.number().int().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
  landingUrl: z.url().optional().or(z.literal('').transform(() => undefined)),
  cpcUsd: z.coerce.number().min(0).max(100).default(0),
  cpaUsd: z.coerce.number().min(0).max(10_000).default(0),
  revsharePct: z.coerce.number().min(0).max(100).default(0),
  payoutMode: z.enum(['hold', 'instant', 'batch']).default('hold'),
  holdMinutes: z.coerce.number().int().min(0).max(60 * 24 * 60).default(2),
  dailyCapPerAffiliateUsd: z.coerce.number().min(0).default(50),
  totalBudgetUsd: z.coerce.number().min(0).default(500),
});
