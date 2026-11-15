import { desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { adminOnly } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { parseIntent, type AgentName } from '@/lib/agent';
import { settle } from '@/lib/affiliates';
import { ITEMS, qatom, WALLETS } from '@/lib/qatom';
import { overBudget, torontoMidnight } from '@/lib/rules';
import { dailyLimit, runPaid, spentToday } from '@/lib/validator';
import type { Analysis, Comparison } from '@/lib/admagic';

export const maxDuration = 60;

export type StepStatus = 'running' | 'done' | 'needs_you' | 'failed' | 'skipped';
export type RunEvent =
  | { type: 'step'; id: string; agent: AgentName; title: string; detail?: string; status: StepStatus; receiptUrl?: string | null; href?: string; ms?: number }
  | { type: 'analysis'; result: Analysis; imageUrl: string; analysisId: string; cached: boolean }
  | { type: 'compare'; result: Comparison }
  | { type: 'end'; summary: string };

const usd = (n: number) => `$${n.toFixed(2)}`;
const Body = z.object({ prompt: z.string().trim().min(1).max(2000) });

/** Runs one request as a sequence of real agent steps, streamed as NDJSON so the workspace shows them live. */
export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Tell the agents what to do' }, { status: 400 });
  const intent = parseIntent(parsed.data.prompt);

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (e: RunEvent) => ctrl.enqueue(new TextEncoder().encode(JSON.stringify(e) + '\n'));
      const step = async <T,>(id: string, agent: AgentName, title: string, work: () => Promise<{ value: T; detail?: string; status?: StepStatus; receiptUrl?: string | null; href?: string }>) => {
        const t = Date.now();
        send({ type: 'step', id, agent, title, status: 'running' });
        try {
          const r = await work();
          send({ type: 'step', id, agent, title, detail: r.detail, status: r.status ?? 'done', receiptUrl: r.receiptUrl, href: r.href, ms: Date.now() - t });
          return r.value;
        } catch (e) {
          send({ type: 'step', id, agent, title, detail: (e as Error).message, status: 'failed', ms: Date.now() - t });
          throw e;
        }
      };

      try {
        if (intent.kind === 'score' || intent.kind === 'compare') {
          const item = intent.kind === 'score' ? 'image' : 'compare';
          const rawUrls = intent.kind === 'score' ? [intent.url] : intent.urls;
          const urls = rawUrls;
          const price = ITEMS[item].priceUsd;
          await step('budget', 'guard', 'Checking today’s budget', async () => {
            const [spent, limit] = await Promise.all([spentToday(), dailyLimit()]);
            const detail = `${usd(spent)} spent of ${usd(limit)} · this costs ${usd(price)} unless it was scored before`;
            if (overBudget(spent, price, limit)) return { value: null, detail: `${detail}. Will refuse a new payment.`, status: 'needs_you' as const, href: '/activity' };
            return { value: null, detail };
          });
          const r = await step('pay', 'scout', `Buying ${item === 'compare' ? 'a Compare' : 'one analysis'} from AdMagic`, async () => {
            const out = await runPaid(item, { urls, type: 'image', objective: intent.objective }, 'agent workspace');
            const b = out.body as { cached?: boolean; receiptUrl?: string | null; error?: string; priceUsd?: number };
            if (out.status === 202) return { value: out, status: 'needs_you' as const, detail: `${usd(price)} is over the wallet’s auto-approve limit. Approve it on your phone, then run this again; it won’t pay twice.` };
            if (b.error) throw new Error(b.error);
            return { value: out, detail: b.cached ? 'Scored before: served from cache, $0 charged' : `Paid ${usd(b.priceUsd ?? price)} · AdMagic keeps 100%`, receiptUrl: b.receiptUrl };
          });
          if (r.status !== 200) { send({ type: 'end', summary: 'Waiting for your approval' }); return; }
          const b = r.body as unknown as Analysis & Comparison & { analysisId: string; cached: boolean };
          if (item === 'image') {
            await step('score', 'scout', 'Neural analysis', async () => ({ value: null, detail: `Neural Score ${b.score}/100${b.verdict ? ` · ${b.verdict}` : ''}` }));
            send({ type: 'analysis', result: b, imageUrl: urls[0], analysisId: b.analysisId, cached: b.cached });
            const offer = new URLSearchParams({ tab: 'offers', creative: urls[0], score: String(b.score), analysis: b.analysisId, name: b.verdict ?? 'Validated ad' });
            await step('next', 'broker', b.score >= 70 ? 'Ready to become an affiliate offer' : 'Worth fixing before you pay affiliates', async () => ({
              value: null, status: 'needs_you' as const, href: `/affiliates?${offer}`,
              detail: b.score >= 70 ? 'Open the offer builder with this ad filled in.' : 'Score is below 70. Fix the top insight, then score the new version.',
            }));
            send({ type: 'end', summary: `Scored ${b.score}/100` });
          } else {
            const top = b.ranking[0];
            await step('rank', 'scout', 'Ranking the creatives', async () => ({ value: null, detail: `Winner scores ${top.score}/100, ${top.score - b.ranking[b.ranking.length - 1].score} points ahead of the weakest` }));
            send({ type: 'compare', result: b });
            const offer = new URLSearchParams({ tab: 'offers', creative: top.url, score: String(top.score), name: top.verdict ?? 'Compare winner' });
            await step('next', 'broker', 'Turn the winner into an offer', async () => ({ value: null, status: 'needs_you' as const, href: `/affiliates?${offer}`, detail: 'Open the offer builder with the winner filled in.' }));
            send({ type: 'end', summary: `Winner: ${top.score}/100` });
          }
        } else if (intent.kind === 'release') {
          const since = new Date();
          await step('settle', 'paymaster', 'Releasing holds that are due and paying verified affiliates', async () => { await settle(); return { value: null }; });
          const paid = await db.select({ p: schema.affiliatePayouts, name: schema.affiliates.displayName }).from(schema.affiliatePayouts)
            .innerJoin(schema.affiliates, eq(schema.affiliates.id, schema.affiliatePayouts.affiliateId))
            .where(gte(schema.affiliatePayouts.createdAt, since));
          for (const { p, name } of paid) {
            await step(`pay-${p.id}`, 'paymaster', `Paid ${name} ${usd(p.amountUsd)} from the offer wallet`, async () => ({
              value: null, status: p.status === 'paid' ? 'done' as const : p.status === 'failed' ? 'failed' as const : 'needs_you' as const, receiptUrl: p.receiptUrl,
              detail: p.status === 'paid' ? 'One payment, one receipt' : p.status === 'failed' ? 'Payment refused; it will retry with the same payout id' : 'Waiting for your approval on your phone',
            }));
          }
          const E = schema.affiliateEarnings;
          const [left] = await db.select({
            hold: sql<number>`coalesce(sum(${E.amountUsd}) filter (where ${E.status} = 'pending_hold'), 0)::float`,
            unverified: sql<number>`coalesce(sum(${E.amountUsd}) filter (where ${E.status} = 'payable'), 0)::float`,
          }).from(E);
          await step('left', 'guard', 'What is still waiting', async () => ({
            value: null, href: '/affiliates?tab=payouts',
            detail: `${usd(left.hold)} on hold for the refund window · ${usd(left.unverified)} payable (unverified accounts or batch offers)`,
          }));
          send({ type: 'end', summary: paid.length ? `${paid.length} payout${paid.length > 1 ? 's' : ''} sent` : 'Nothing was due' });
        } else if (intent.kind === 'offer') {
          const rows = await db.select().from(schema.analyses).where(ne(schema.analyses.item, 'compare')).orderBy(desc(schema.analyses.createdAt)).limit(50);
          const best = rows.map((a) => ({ a, score: (a.result as Analysis).score })).sort((x, y) => y.score - x.score)[0];
          if (!best) {
            await step('pick', 'broker', 'Looking for your best scored ad', async () => ({ value: null, status: 'needs_you' as const, detail: 'No ads scored yet. Paste an ad link first.' }));
          } else {
            const live = await db.select({ n: sql<number>`count(*)::int` }).from(schema.affiliateOffers).where(eq(schema.affiliateOffers.status, 'active'));
            await step('pick', 'broker', 'Picking your best scored ad', async () => ({ value: null, detail: `Neural Score ${best.score}/100 from your last ${rows.length} analyses · ${live[0].n} offers already live` }));
            const q = new URLSearchParams({ tab: 'offers', creative: best.a.creativeUrl, score: String(best.score), analysis: best.a.id, name: (best.a.result as Analysis).verdict ?? 'Validated ad' });
            await step('draft', 'broker', 'Drafted an offer: $0.10 per qualified click, $5 per sale, 10% share', async () => ({ value: null, status: 'needs_you' as const, href: `/affiliates?${q}`, detail: 'Review the terms and budget, then create it. Nothing is spent until affiliates deliver.' }));
          }
          send({ type: 'end', summary: best ? 'Offer drafted' : 'Nothing to offer yet' });
        } else if (intent.kind === 'status') {
          const [spent, limit, buyer, offerW, [blocked], [hold]] = await Promise.all([
            spentToday(), dailyLimit(), qatom.getWalletBalance(WALLETS.buyer), qatom.getWalletBalance(WALLETS.offer),
            db.select({ n: sql<number>`count(*)::int` }).from(schema.blockedEvents).where(gte(schema.blockedEvents.createdAt, torontoMidnight())),
            db.select({ n: sql<number>`count(*)::int`, usd: sql<number>`coalesce(sum(${schema.affiliateEarnings.amountUsd}), 0)::float` })
              .from(schema.affiliateEarnings).where(inArray(schema.affiliateEarnings.status, ['pending_hold', 'payable'])),
          ]);
          await step('budget', 'guard', 'Budget', async () => ({ value: null, detail: `${usd(spent)} of ${usd(limit)} spent today · ${blocked.n} requests refused today`, href: '/activity' }));
          await step('wallets', 'guard', 'Wallets', async () => ({ value: null, detail: `Buyer ${usd(buyer.balanceUsd)} · Offer ${usd(offerW.balanceUsd)}` }));
          await step('owed', 'paymaster', 'Owed to affiliates', async () => ({ value: null, detail: hold.usd >= 0 ? `${usd(hold.usd)} across ${hold.n} earnings waiting` : `${usd(-hold.usd)} to recover: refunds came in after those affiliates were paid`, href: '/affiliates?tab=payouts' }));
          send({ type: 'end', summary: 'Status checked' });
        } else {
          await step('help', 'guard', intent.reason ?? 'Here’s what the agents can do', async () => ({
            value: null, status: 'needs_you' as const,
            detail: 'Paste an ad link to score it, 2–5 links to compare them, or ask to launch an offer, release payouts, or check status.',
          }));
          send({ type: 'end', summary: 'Waiting for a task' });
        }
      } catch (e) {
        send({ type: 'end', summary: (e as Error).message });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
