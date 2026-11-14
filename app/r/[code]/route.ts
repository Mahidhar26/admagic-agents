import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { visitorHash } from '@/lib/rules';
import { clientIp } from '@/lib/request';

export async function GET(req: Request, ctx: RouteContext<'/r/[code]'>) {
  const { code } = await ctx.params;
  const link = await db.query.affiliateLinks.findFirst({ where: eq(schema.affiliateLinks.code, code) });
  const offer = link && await db.query.affiliateOffers.findFirst({ where: eq(schema.affiliateOffers.id, link.offerId) });
  if (!link || !offer || offer.status !== 'active') return new Response('This offer is not available', { status: 404 });

  await db.insert(schema.affiliateEvents).values({
    linkId: link.id, offerId: offer.id, type: 'click', visitorHash: visitorHash(clientIp(req), req.headers.get('user-agent') ?? ''),
  });
  const dest = new URL(offer.landingUrl ?? `/demo-store/${offer.id}`, req.url);
  dest.searchParams.set('aff', code);
  // last click wins, 30-day window
  return new Response(null, {
    status: 302,
    headers: { location: dest.href, 'set-cookie': `aff=${encodeURIComponent(code)}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax; Secure` },
  });
}
