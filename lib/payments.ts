import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db';

export type Payment = { at: Date; flow: 'validation' | 'payout'; from: string; to: string; amountUsd: number; status: string; receiptId: string | null; receiptUrl: string | null };

/** Every Qatom payment in both directions, newest first. */
export async function recentPayments(limit = 30): Promise<Payment[]> {
  const [purchases, payouts] = await Promise.all([
    db.select().from(schema.purchases).orderBy(desc(schema.purchases.createdAt)).limit(limit),
    db.select({ p: schema.affiliatePayouts, name: schema.affiliates.displayName }).from(schema.affiliatePayouts)
      .innerJoin(schema.affiliates, eq(schema.affiliates.id, schema.affiliatePayouts.affiliateId))
      .orderBy(desc(schema.affiliatePayouts.createdAt)).limit(limit),
  ]);
  return [
    ...purchases.map((p): Payment => ({ at: p.createdAt, flow: 'validation', from: 'Buyer wallet', to: `AdMagic · ${p.item}`, amountUsd: p.priceUsd, status: p.status, receiptId: p.receiptId, receiptUrl: p.receiptUrl })),
    ...payouts.map(({ p, name }): Payment => ({ at: p.createdAt, flow: 'payout', from: 'Offer wallet', to: name, amountUsd: p.amountUsd, status: p.status, receiptId: p.qatomReceiptId, receiptUrl: p.receiptUrl })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
