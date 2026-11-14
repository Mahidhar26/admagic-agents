import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly } from '@/lib/auth';
import { randomId } from '@/lib/qatom';
import { OfferBody } from '@/lib/affiliates';

export async function GET() {
  const denied = await adminOnly();
  if (denied) return denied;
  const rows = await db.select().from(schema.affiliateOffers).orderBy(desc(schema.affiliateOffers.createdAt));
  return Response.json(rows.map((o) => ({ ...o, webhookSecret: undefined })));
}

export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = OfferBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const webhookSecret = `whsec_${randomId(24)}`;
  const [offer] = await db.insert(schema.affiliateOffers).values({ ...parsed.data, webhookSecret }).returning();
  const origin = new URL(req.url).origin;
  // the secret is shown this once and never returned again
  return Response.json({
    id: offer.id,
    message: `Offer created. Webhook URL: ${origin}/api/affiliates/webhooks/conversion · Secret (shown once): ${webhookSecret}`,
  }, { status: 201 });
}
