// Network-style KPIs (Today / Yesterday / Month to date), adapted from the AdMagic affiliate dashboard to this app's tables.
import { and, gte, lt, sql, type AnyColumn } from 'drizzle-orm';
import { db, schema } from './db';
import { torontoMidnight } from './rules';

const P = schema.purchases;
const Ev = schema.affiliateEvents;
const E = schema.affiliateEarnings;
const Po = schema.affiliatePayouts;
const DAY = 86400_000;

export type Window = { start: Date; end?: Date };

export function windows(now = new Date()) {
  const today = torontoMidnight(now);
  const yesterday = torontoMidnight(new Date(today.getTime() - DAY / 2));
  const dayOfMonth = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', day: 'numeric' }).format(now));
  // noon of day 1, so a DST change can't push us into the previous month
  const month = torontoMidnight(new Date(today.getTime() + DAY / 2 - (dayOfMonth - 1) * DAY));
  return { today: { start: today }, yesterday: { start: yesterday, end: today }, month: { start: month } };
}

const inWindow = (col: AnyColumn, w: Window) => and(gte(col, w.start), w.end ? lt(col, w.end) : undefined);

export async function metrics(w: Window) {
  const [[v], [ev], [earn], [paid]] = await Promise.all([
    db.select({
      spendUsd: sql<number>`coalesce(sum(${P.priceUsd}) filter (where ${P.status} = 'paid'), 0)::float`,
      analyses: sql<number>`count(*) filter (where ${P.status} = 'paid')::int`,
    }).from(P).where(inWindow(P.createdAt, w)),
    db.select({
      clicks: sql<number>`count(*) filter (where ${Ev.type} = 'click')::int`,
      qualified: sql<number>`count(*) filter (where ${Ev.type} = 'qualified_click')::int`,
      conversions: sql<number>`count(*) filter (where ${Ev.type} = 'conversion')::int`,
      revenueUsd: sql<number>`coalesce(sum(${Ev.orderValueUsd}) filter (where ${Ev.type} = 'conversion'), 0)::float`,
    }).from(Ev).where(inWindow(Ev.createdAt, w)),
    db.select({ earnedUsd: sql<number>`coalesce(sum(${E.amountUsd}) filter (where ${E.status} <> 'clawed_back'), 0)::float` })
      .from(E).where(inWindow(E.createdAt, w)),
    db.select({ paidUsd: sql<number>`coalesce(sum(${Po.amountUsd}) filter (where ${Po.status} = 'paid'), 0)::float` })
      .from(Po).where(inWindow(Po.createdAt, w)),
  ]);
  return {
    ...v, ...ev, ...earn, ...paid,
    cr: ev.clicks ? ev.conversions / ev.clicks : 0,
    epc: ev.clicks ? ev.revenueUsd / ev.clicks : 0,
    netUsd: ev.revenueUsd - earn.earnedUsd - v.spendUsd,
  };
}
