import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly } from '@/lib/auth';
// only pause/resume: OfferBody.partial() would re-apply its defaults and overwrite the payout terms
const Patch = z.object({ status: z.enum(['active', 'paused']) });

export async function PATCH(req: Request, ctx: RouteContext<'/api/affiliates/offers/[id]'>) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: 'Invalid input' }, { status: 400 });
  const [row] = await db.update(schema.affiliateOffers).set(parsed.data).where(eq(schema.affiliateOffers.id, id)).returning();
  return row ? Response.json({ message: `Offer ${row.status}` }) : Response.json({ error: 'Not found' }, { status: 404 });
}
