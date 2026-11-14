import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { block } from './auth';
import { verifySignature } from './rules';

/** Reads the raw body, finds the offer it names, checks the HMAC. Returns the parsed body + offer, or a Response. */
export async function verifiedWebhook(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const offerId = typeof body.offer_id === 'string' && /^[0-9a-f-]{36}$/.test(body.offer_id) ? body.offer_id : null;
  const offer = offerId && await db.query.affiliateOffers.findFirst({ where: eq(schema.affiliateOffers.id, offerId) });
  if (!offer) return Response.json({ error: 'unknown offer' }, { status: 404 });
  if (!verifySignature(raw, req.headers.get('x-admagic-signature'), offer.webhookSecret)) {
    await block('webhook', 'bad webhook signature', { offer: offer.name });
    return Response.json({ error: 'bad signature' }, { status: 401 });
  }
  return { body, offer };
}
