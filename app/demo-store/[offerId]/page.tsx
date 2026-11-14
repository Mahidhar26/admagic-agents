import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { signBody } from '@/lib/rules';
import { randomId } from '@/lib/qatom';
import { Beacon } from './Beacon';

const PRICE_USD = 49;

/** The store's server signs and sends the webhook; the browser never sees the secret. */
async function sendWebhook(offerId: string, kind: 'conversion' | 'refund', body: object) {
  const offer = await db.query.affiliateOffers.findFirst({ where: eq(schema.affiliateOffers.id, offerId) });
  if (!offer) return 'Unknown offer';
  const raw = JSON.stringify({ offer_id: offerId, ...body });
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const res = await fetch(`${origin}/api/affiliates/webhooks/${kind}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-admagic-signature': signBody(raw, offer.webhookSecret) }, body: raw,
  });
  return res.ok ? 'ok' : `Webhook failed (${res.status})`;
}

async function buy(form: FormData) {
  'use server';
  const offerId = z.uuid().parse(form.get('offerId'));
  const jar = await cookies();
  const aff = jar.get('aff')?.value;
  const orderId = `order_${randomId(6)}`;
  const result = aff
    ? await sendWebhook(offerId, 'conversion', { order_id: orderId, order_value_usd: PRICE_USD, aff_code: aff, is_new_customer: !jar.get('last_order') })
    : 'No affiliate cookie: open the store through a tracked link';
  jar.set('last_order', orderId, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect(`/demo-store/${offerId}?msg=${encodeURIComponent(result === 'ok' ? `Bought ${orderId}` : result)}`);
}

async function refund(form: FormData) {
  'use server';
  const offerId = z.uuid().parse(form.get('offerId'));
  const orderId = (await cookies()).get('last_order')?.value;
  const result = orderId ? await sendWebhook(offerId, 'refund', { order_id: orderId }) : 'Nothing to refund';
  redirect(`/demo-store/${offerId}?msg=${encodeURIComponent(result === 'ok' ? `Refunded ${orderId}` : result)}`);
}

export default async function DemoStore({ params, searchParams }: PageProps<'/demo-store/[offerId]'>) {
  const { offerId } = await params;
  const { msg, aff } = await searchParams;
  if (!z.uuid().safeParse(offerId).success) return <p>Unknown product.</p>;
  const offer = await db.query.affiliateOffers.findFirst({ where: eq(schema.affiliateOffers.id, offerId) });
  if (!offer) return <p>Unknown product.</p>;
  const code = typeof aff === 'string' ? aff : (await cookies()).get('aff')?.value;

  return (
    <div className="max-w-md mx-auto card">
      {code && <Beacon code={code} />}
      <p className="text-xs uppercase tracking-wide opacity-60">Demo store</p>
      <h1>{offer.name}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={offer.creativeUrl} alt={offer.name} className="w-full rounded mb-4" />
      <form className="flex gap-3">
        <input type="hidden" name="offerId" value={offer.id} />
        <button formAction={buy} className="font-semibold">Buy ${PRICE_USD}</button>
        <button formAction={refund}>Refund</button>
      </form>
      {typeof msg === 'string' && <p role="status" className="text-sm mt-3">{msg}</p>}
    </div>
  );
}
