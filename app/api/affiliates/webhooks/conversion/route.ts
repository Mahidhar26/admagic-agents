import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { block } from '@/lib/auth';
import { addEarnings } from '@/lib/affiliates';
import { verifiedWebhook } from '@/lib/webhooks';
import { conversionEarnings } from '@/lib/rules';

const Body = z.object({
  order_id: z.string().min(1).max(128),
  order_value_usd: z.number().min(0).max(100_000),
  aff_code: z.string().min(1).max(64),
  is_new_customer: z.boolean().optional(),
});

export async function POST(req: Request) {
  const v = await verifiedWebhook(req);
  if (v instanceof Response) return v;
  const parsed = Body.safeParse(v.body);
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { order_id, order_value_usd, aff_code, is_new_customer } = parsed.data;
  const { offer } = v;

  const link = await db.query.affiliateLinks.findFirst({
    where: and(eq(schema.affiliateLinks.code, aff_code), eq(schema.affiliateLinks.offerId, offer.id)),
  });
  if (!link) return Response.json({ ok: true, attributed: false }); // a sale with no affiliate: nothing to pay

  const [ev] = await db.insert(schema.affiliateEvents).values({
    linkId: link.id, offerId: offer.id, type: 'conversion', orderId: order_id, orderValueUsd: order_value_usd, isNewCustomer: is_new_customer ?? null,
  }).onConflictDoNothing().returning();
  if (!ev) {
    await block('webhook', 'duplicate order', { order_id });
    return Response.json({ ok: true, duplicate: true }); // 200 so the store stops retrying
  }
  if (offer.status !== 'active') return Response.json({ ok: true, paused: true });
  const earnings = await addEarnings(offer, link, ev.id, conversionEarnings(offer, order_value_usd));
  return Response.json({ ok: true, earnings: earnings.map((e) => ({ kind: e.kind, amountUsd: e.amountUsd, status: e.status })) });
}
