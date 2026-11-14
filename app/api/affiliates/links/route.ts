import { z } from 'zod';
import { adminOnly } from '@/lib/auth';
import { createLink } from '@/lib/links';

export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({ offerId: z.uuid(), affiliateId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const url = await createLink(parsed.data.offerId, parsed.data.affiliateId, new URL(req.url).origin);
  return Response.json({ url, message: `Tracked link: ${url}` }, { status: 201 });
}
