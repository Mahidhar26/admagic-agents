import { z } from 'zod';
import { adminOnly } from '@/lib/auth';
import { payBatch } from '@/lib/affiliates';

export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({ offerId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'offerId required' }, { status: 400 });
  const results = (await payBatch(parsed.data.offerId)).filter(Boolean);
  return Response.json({ message: `${results.length} payout(s) sent`, results });
}
