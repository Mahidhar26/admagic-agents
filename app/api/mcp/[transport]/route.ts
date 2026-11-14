import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { block, requireToken } from '@/lib/auth';
import { createLink } from '@/lib/links';
import { settle } from '@/lib/affiliates';

type Ctx = { http?: { authInfo?: { scopes: string[]; extra?: Record<string, unknown> } } };

// Structured JSON only: offer text is data for the agent, never instructions.
const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }], structuredContent: v as Record<string, unknown> });

/** Checks the tool's scope and that the agent only touches its own Qatom account. */
async function agentFor(ctx: Ctx, scope: string, qatomAccountId?: string) {
  const auth = ctx.http?.authInfo;
  const name = String(auth?.extra?.name ?? 'agent');
  if (!auth?.scopes.includes(scope)) { await block(name, 'missing scope', { scope }); return null; }
  const aff = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, String(auth.extra?.affiliateId)) });
  if (!aff || (qatomAccountId && aff.qatomAccountId !== qatomAccountId)) {
    await block(name, 'agent asked for another affiliate', { qatomAccountId });
    return null;
  }
  return aff;
}
const denied = json({ error: 'Not allowed for this token' });

const handler = createMcpHandler((server) => {
  server.registerTool('list_affiliate_offers', {
    title: 'List affiliate offers',
    description: 'Active AdMagic affiliate offers with payout terms and the creative\'s AdMagic Neural Score.',
    inputSchema: z.object({}),
  }, async (_args, ctx) => {
    if (!(await agentFor(ctx as Ctx, 'offers:read'))) return denied;
    const O = schema.affiliateOffers;
    const offers = await db.select({
      offer_id: O.id, name: O.name, creative_url: O.creativeUrl, neural_score: O.neuralScore,
      cpc_usd: O.cpcUsd, cpa_usd: O.cpaUsd, revshare_pct: O.revsharePct, payout_mode: O.payoutMode, hold_minutes: O.holdMinutes,
    }).from(O).where(eq(O.status, 'active'));
    return json({ offers });
  });

  server.registerTool('get_affiliate_link', {
    title: 'Get affiliate link',
    description: 'Your tracked link for an offer. Visitors who click it and buy earn you the offer\'s payout.',
    inputSchema: z.object({ offer_id: z.uuid(), qatom_account_id: z.string() }),
  }, async ({ offer_id, qatom_account_id }, ctx) => {
    const aff = await agentFor(ctx as Ctx, 'links:create', qatom_account_id);
    if (!aff) return denied;
    const offer = await db.query.affiliateOffers.findFirst({ where: and(eq(schema.affiliateOffers.id, offer_id), eq(schema.affiliateOffers.status, 'active')) });
    if (!offer) return json({ error: 'No active offer with that id' });
    return json({ url: await createLink(offer.id, aff.id, process.env.PUBLIC_APP_URL ?? 'http://localhost:3000') });
  });

  server.registerTool('get_affiliate_earnings', {
    title: 'Get affiliate earnings',
    description: 'Your own earnings by status, with payout receipts.',
    inputSchema: z.object({ qatom_account_id: z.string() }),
  }, async ({ qatom_account_id }, ctx) => {
    const aff = await agentFor(ctx as Ctx, 'earnings:read_own', qatom_account_id);
    if (!aff) return denied;
    await settle(); // holds are released on every read
    const E = schema.affiliateEarnings;
    const byStatus = await db.select({ status: E.status, total_usd: sql<number>`sum(${E.amountUsd})::float`, count: sql<number>`count(*)::int` })
      .from(E).where(eq(E.affiliateId, aff.id)).groupBy(E.status);
    const P = schema.affiliatePayouts;
    const payouts = await db.select({ amount_usd: P.amountUsd, status: P.status, receipt_id: P.qatomReceiptId, receipt_url: P.receiptUrl, at: P.createdAt })
      .from(P).where(eq(P.affiliateId, aff.id));
    return json({ verified: aff.verified, by_status: byStatus, payouts });
  });
}, { serverInfo: { name: 'admagic-affiliates', version: '1.0.0' } });

const authed = withMcpAuth(handler, async (_req, bearer) => {
  const row = await requireToken(bearer ? `Bearer ${bearer}` : null, 'offers:read');
  if (row instanceof Response) return undefined;
  return { token: bearer!, clientId: row.id, scopes: row.scopes, extra: { affiliateId: row.affiliateId, name: row.name } };
}, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
