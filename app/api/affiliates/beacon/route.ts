import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { block } from '@/lib/auth';
import { addEarnings } from '@/lib/affiliates';
import { isQualifiedClick, visitorHash } from '@/lib/rules';
import { clientIp } from '@/lib/request';

const Ev = schema.affiliateEvents;

export async function POST(req: Request) {
  const parsed = z.object({ code: z.string().min(1).max(64), dwellMs: z.coerce.number().int().min(0) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const { code, dwellMs } = parsed.data;

  const link = await db.query.affiliateLinks.findFirst({ where: eq(schema.affiliateLinks.code, code) });
  const offer = link && await db.query.affiliateOffers.findFirst({ where: eq(schema.affiliateOffers.id, link.offerId) });
  if (!link || !offer || offer.status !== 'active') return Response.json({ ok: false }, { status: 404 });

  const vh = visitorHash(clientIp(req), req.headers.get('user-agent') ?? '');
  // dwell is measured on the server from this visitor's logged click, not trusted from the beacon
  const click = await db.query.affiliateEvents.findFirst({
    where: and(eq(Ev.linkId, link.id), eq(Ev.type, 'click'), eq(Ev.visitorHash, vh)), orderBy: desc(Ev.createdAt),
  });
  const already = await db.query.affiliateEvents.findFirst({
    where: and(eq(Ev.offerId, offer.id), eq(Ev.type, 'qualified_click'), eq(Ev.visitorHash, vh)), // hash includes the day
  });
  const q = isQualifiedClick({ clickAt: click?.createdAt, alreadyQualifiedToday: !!already });
  if (!q.ok) {
    if (q.reason === 'click_dedupe') await block(`affiliate ${code}`, 'click spam: duplicate qualified click', { offer: offer.name });
    return Response.json({ ok: false, reason: q.reason });
  }
  const [ev] = await db.insert(Ev).values({ linkId: link.id, offerId: offer.id, type: 'qualified_click', visitorHash: vh, dwellMs }).returning();
  if (offer.cpcUsd > 0) await addEarnings(offer, link, ev.id, [{ kind: 'cpc', amountUsd: offer.cpcUsd }]);
  return Response.json({ ok: true });
}
