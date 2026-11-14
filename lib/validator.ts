import { and, eq, gte, sum, desc } from 'drizzle-orm';
import { db, schema } from './db';
import { qatom, ITEMS, WALLETS } from './qatom';
import * as admagic from './admagic';
import { block } from './auth';
import { overBudget, sha256, torontoMidnight } from './rules';

type Item = keyof typeof ITEMS;
type Input = { urls: string[]; type: 'image' | 'video'; objective?: admagic.Objective };
type Purchase = typeof schema.purchases.$inferSelect;

const MAX_BYTES = 50 * 1024 * 1024;

export async function hashCreative(url: string) {
  const u = new URL(url);
  // shortcut: blocks IP literals and local names, not DNS that resolves to a private IP; add an allowlist of ad CDNs before real launch
  if (u.protocol !== 'https:' || /^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname)) {
    throw new Error('Creative URL must be a public https URL');
  }
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Could not download the creative (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('Creative is too large');
  return sha256(bytes); // bytes, not URL: Meta URLs change
}

export async function dailyLimit() {
  const s = await db.query.settings.findFirst();
  return s?.dailyLimitUsd ?? Number(process.env.DAILY_BUDGET_USD ?? 10);
}

export async function spentToday() {
  const [r] = await db.select({ total: sum(schema.purchases.priceUsd) }).from(schema.purchases)
    .where(and(eq(schema.purchases.status, 'paid'), gte(schema.purchases.createdAt, torontoMidnight())));
  return Number(r?.total ?? 0);
}

const shape = (a: typeof schema.analyses.$inferSelect, cached: boolean) =>
  ({ ...(a.result as object), analysisId: a.id, receiptId: a.receiptId, receiptUrl: a.receiptUrl, priceUsd: a.priceUsd, cached });

/** The five checks in order (auth happens in the route); only step 4 spends money. */
export async function runPaid(item: Item, input: Input, caller: string) {
  // 2) cache, keyed on content
  const hashes = await Promise.all(input.urls.map(hashCreative));
  const hash = item === 'compare' ? sha256([...hashes].sort().join('|')) : hashes[0];
  const hit = await db.query.analyses.findFirst({ where: and(eq(schema.analyses.creativeHash, hash), eq(schema.analyses.item, item)) });
  if (hit) return { status: 200, body: shape(hit, true) };

  const idempotencyKey = `${hash}:${item}`;
  const existing = await db.query.purchases.findFirst({ where: eq(schema.purchases.idempotencyKey, idempotencyKey) });
  if (existing && existing.status !== 'failed') return finish(existing, hash); // paid earlier, analysis failed, or still waiting

  // 3) budget
  const { priceUsd, itemId } = ITEMS[item];
  const [spent, limit] = await Promise.all([spentToday(), dailyLimit()]);
  if (overBudget(spent, priceUsd, limit)) {
    await block(caller, 'over budget', { spentTodayUsd: spent, limitUsd: limit, priceUsd });
    return { status: 402, body: { error: 'Daily budget reached', spentTodayUsd: spent, limitUsd: limit } };
  }

  // 4) pay
  const r = await qatom.purchase({ walletId: WALLETS.buyer, itemId, priceUsd, input: { urls: input.urls }, idempotencyKey });
  const values = {
    item, priceUsd, status: r.status, qatomPurchaseId: r.purchaseId, receiptId: r.receiptId ?? null,
    receiptUrl: r.receiptUrl ?? null, reason: r.reason ?? null, idempotencyKey, input: { ...input, hash },
  };
  const [p] = existing
    ? await db.update(schema.purchases).set(values).where(eq(schema.purchases.id, existing.id)).returning()
    : await db.insert(schema.purchases).values(values).returning();
  if (r.status === 'failed') {
    await block(caller, 'payment failed', { reason: r.reason });
    return { status: 402, body: { error: r.reason ?? 'Payment declined' } };
  }
  return finish(p, hash);
}

/** Moves a purchase on: polls approval, then (5) analyzes and saves. Safe to call again. */
export async function finish(p: Purchase, hash = (p.input as { hash: string }).hash) {
  if (p.status === 'pending_approval') {
    const q = await qatom.getPurchase(p.qatomPurchaseId!);
    if (q.status === 'pending_approval') return { status: 202, body: { status: 'pending_approval', purchaseId: p.id, priceUsd: p.priceUsd } };
    [p] = await db.update(schema.purchases)
      .set({ status: q.status, receiptId: q.receiptId ?? null, receiptUrl: q.receiptUrl ?? null, reason: q.status === 'failed' ? 'Not approved' : null })
      .where(eq(schema.purchases.id, p.id)).returning();
    if (p.status === 'failed') return { status: 402, body: { error: 'Not approved' } };
  }
  if (p.status === 'failed') return { status: 402, body: { error: p.reason ?? 'Payment failed' } };

  const done = await db.query.analyses.findFirst({ where: eq(schema.analyses.purchaseId, p.id) });
  if (done) return { status: 200, body: shape(done, false) };

  // 5) analyze — if AdMagic errors here the paid purchase stays, and a retry lands back in this function without paying
  const input = p.input as Input;
  const result = p.item === 'compare'
    ? await admagic.compare(input.urls)
    : p.item === 'video' ? await admagic.analyzeVideo(input.urls[0]) : await admagic.scoreImage(input.urls[0], input.objective);
  const [a] = await db.insert(schema.analyses).values({
    creativeHash: hash, item: p.item, creativeUrl: input.urls.join(' '), result, purchaseId: p.id,
    receiptId: p.receiptId, receiptUrl: p.receiptUrl, priceUsd: p.priceUsd,
  }).onConflictDoNothing().returning();
  return { status: 200, body: shape(a ?? (await db.query.analyses.findFirst({ where: and(eq(schema.analyses.creativeHash, hash), eq(schema.analyses.item, p.item)) }))!, false) };
}

export const recentReceipts = (limit = 10) =>
  db.select().from(schema.purchases).orderBy(desc(schema.purchases.createdAt)).limit(limit);
