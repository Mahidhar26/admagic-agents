import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { verifiedWebhook } from '@/lib/webhooks';
import { refundAction } from '@/lib/rules';

const Ev = schema.affiliateEvents;
const E = schema.affiliateEarnings;

export async function POST(req: Request) {
  const v = await verifiedWebhook(req);
  if (v instanceof Response) return v;
  const parsed = z.object({ order_id: z.string().min(1).max(128) }).safeParse(v.body);
  if (!parsed.success) return Response.json({ error: 'order_id required' }, { status: 400 });
  const { offer } = v;
  const { order_id } = parsed.data;

  const sale = await db.query.affiliateEvents.findFirst({ where: and(eq(Ev.offerId, offer.id), eq(Ev.orderId, order_id), eq(Ev.type, 'conversion')) });
  if (!sale) return Response.json({ ok: true, attributed: false });
  const [refund] = await db.insert(Ev).values({ linkId: sale.linkId, offerId: offer.id, type: 'refund', orderId: order_id }).onConflictDoNothing().returning();
  if (!refund) return Response.json({ ok: true, duplicate: true });

  const earnings = await db.select().from(E).where(eq(E.eventId, sale.id));
  for (const e of earnings) {
    const action = refundAction(e.status);
    if (action === 'claw_back') await db.update(E).set({ status: 'clawed_back' }).where(eq(E.id, e.id));
    if (action === 'negative_balance') {
      await db.insert(E).values({ eventId: refund.id, affiliateId: e.affiliateId, offerId: e.offerId, kind: 'clawback', amountUsd: -e.amountUsd, status: 'payable' });
    }
  }
  return Response.json({ ok: true });
}
