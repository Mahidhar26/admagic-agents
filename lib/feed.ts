// One timeline of what each agent did, built from the tables the app already writes. Newest first.
import { desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import type { AgentName } from './agent';

export type FeedItem = { at: Date; agent: AgentName; text: string; count?: number; amountUsd?: number; tone?: 'ok' | 'warn' | 'bad'; receiptUrl?: string | null; href?: string };

export async function feed(limit = 20): Promise<FeedItem[]> {
  const [purchases, payouts, blocked, events, offers] = await Promise.all([
    db.select().from(schema.purchases).orderBy(desc(schema.purchases.createdAt)).limit(limit),
    db.select({ p: schema.affiliatePayouts, name: schema.affiliates.displayName }).from(schema.affiliatePayouts)
      .innerJoin(schema.affiliates, eq(schema.affiliates.id, schema.affiliatePayouts.affiliateId)).orderBy(desc(schema.affiliatePayouts.createdAt)).limit(limit),
    db.select().from(schema.blockedEvents).orderBy(desc(schema.blockedEvents.createdAt)).limit(limit),
    db.select({ e: schema.affiliateEvents, name: schema.affiliates.displayName, type: schema.affiliates.type }).from(schema.affiliateEvents)
      .innerJoin(schema.affiliateLinks, eq(schema.affiliateLinks.id, schema.affiliateEvents.linkId))
      .innerJoin(schema.affiliates, eq(schema.affiliates.id, schema.affiliateLinks.affiliateId))
      .where(inArray(schema.affiliateEvents.type, ['conversion', 'qualified_click', 'refund'])).orderBy(desc(schema.affiliateEvents.createdAt)).limit(limit),
    db.select().from(schema.affiliateOffers).orderBy(desc(schema.affiliateOffers.createdAt)).limit(limit),
  ]);
  const what = { image: 'scored an ad', video: 'scored a video', compare: 'compared creatives' } as const;
  return [
    ...purchases.map((p): FeedItem => ({
      at: p.createdAt, agent: 'scout', amountUsd: p.priceUsd, receiptUrl: p.receiptUrl, href: '/validator',
      text: p.status === 'paid' ? `Paid AdMagic and ${what[p.item]}` : p.status === 'pending_approval' ? `Asked you to approve ${what[p.item].replace(/^\w+ /, 'a ')}` : `Payment refused: ${p.reason ?? 'declined'}`,
      tone: p.status === 'paid' ? 'ok' : p.status === 'pending_approval' ? 'warn' : 'bad',
    })),
    ...payouts.map(({ p, name }): FeedItem => ({
      at: p.createdAt, agent: 'paymaster', amountUsd: p.amountUsd, receiptUrl: p.receiptUrl, href: '/affiliates?tab=payouts',
      text: p.status === 'paid' ? `Paid ${name}` : p.status === 'failed' ? `Payout to ${name} failed, will retry` : `Payout to ${name} waits for approval`,
      tone: p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn',
    })),
    ...blocked.map((b): FeedItem => ({ at: b.createdAt, agent: 'guard', text: `Refused ${b.caller}: ${b.reason}`, tone: 'bad', href: '/activity' })),
    ...events.map(({ e, name, type }): FeedItem => ({
      at: e.createdAt, agent: 'broker', amountUsd: e.orderValueUsd ?? undefined, href: '/affiliates?tab=performance',
      text: e.type === 'conversion' ? `${name}${type === 'agent' ? ' (AI agent)' : ''} drove a sale` : e.type === 'refund' ? `Sale by ${name} was refunded` : `${name} sent a qualified visitor`,
      tone: e.type === 'refund' ? 'warn' : 'ok',
    })),
    ...offers.map((o): FeedItem => ({ at: o.createdAt, agent: 'broker', text: `Launched offer “${o.name}”`, href: '/affiliates?tab=offers' })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())
    // repeats in a row (the same refusal 9 times) collapse into one line with a count
    .reduce<FeedItem[]>((out, f) => {
      const prev = out[out.length - 1];
      if (prev && prev.agent === f.agent && prev.text === f.text && prev.amountUsd === f.amountUsd && !f.receiptUrl) prev.count = (prev.count ?? 1) + 1;
      else out.push(f);
      return out;
    }, [])
    .slice(0, limit);
}
