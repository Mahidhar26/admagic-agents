import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';

const Ev = schema.affiliateEvents;
const E = schema.affiliateEarnings;
const L = schema.affiliateLinks;
const A = schema.affiliates;

/** Totals per metric, per affiliate and per day. Optionally for one offer. */
export async function getStats(offerId?: string) {
  const evWhere = offerId ? eq(Ev.offerId, offerId) : undefined;
  const count = (t: string) => sql<number>`count(*) filter (where ${Ev.type} = ${t})::int`;
  const revenue = sql<number>`coalesce(sum(${Ev.orderValueUsd}) filter (where ${Ev.type} = 'conversion'), 0)::float`;

  const [totals] = await db.select({
    clicks: count('click'), qualifiedClicks: count('qualified_click'), conversions: count('conversion'), refunds: count('refund'),
    newCustomers: sql<number>`count(*) filter (where ${Ev.type} = 'conversion' and ${Ev.isNewCustomer})::int`, revenueUsd: revenue,
  }).from(Ev).where(evWhere);

  const [{ payoutsUsd }] = await db.select({ payoutsUsd: sql<number>`coalesce(sum(${E.amountUsd}), 0)::float` })
    .from(E).where(and(eq(E.status, 'paid'), offerId ? eq(E.offerId, offerId) : undefined));

  const byAffiliate = await db.select({
    affiliateId: A.id, name: A.displayName, type: A.type, verified: A.verified,
    clicks: count('click'), qualifiedClicks: count('qualified_click'), conversions: count('conversion'), revenueUsd: revenue,
  }).from(Ev).innerJoin(L, eq(L.id, Ev.linkId)).innerJoin(A, eq(A.id, L.affiliateId)).where(evWhere).groupBy(A.id);

  const byDay = await db.select({
    day: sql<string>`to_char(${Ev.createdAt} at time zone 'America/Toronto', 'YYYY-MM-DD')`,
    clicks: count('click'), conversions: count('conversion'),
  }).from(Ev).where(evWhere).groupBy(sql`1`).orderBy(sql`1`);

  return {
    ...totals,
    conversionRate: totals.clicks ? totals.conversions / totals.clicks : 0,
    payoutsUsd,
    returnOnPayouts: payoutsUsd ? totals.revenueUsd / payoutsUsd : null,
    byAffiliate,
    byDay,
  };
}
