import { z } from 'zod';
import { adminOnly } from '@/lib/auth';
import { settle } from '@/lib/affiliates';
import { getStats } from '@/lib/stats';

export async function GET(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const offerId = new URL(req.url).searchParams.get('offer_id') ?? undefined;
  if (offerId && !z.uuid().safeParse(offerId).success) return Response.json({ error: 'Bad offer_id' }, { status: 400 });
  await settle(); // holds are also released on every read
  return Response.json(await getStats(offerId));
}
