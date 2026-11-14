import { z } from 'zod';
import { requireBearer } from '@/lib/auth';
import { runPaid } from '@/lib/validator';
import { videoSupported } from '@/lib/admagic';

export const maxDuration = 60;

const Body = z.object({ creativeUrl: z.url(), type: z.enum(['image', 'video']), objective: z.enum(['awareness', 'engagement', 'traffic', 'promotional', 'leads', 'cta']).optional() });

export async function POST(req: Request) {
  const token = await requireBearer(req, 'buy');
  if (token instanceof Response) return token;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { creativeUrl, type, objective } = parsed.data;
  // refuse before paying, not after
  if (type === 'video' && !videoSupported) return Response.json({ error: 'Video analysis is not available yet' }, { status: 400 });
  try {
    const r = await runPaid(type, { urls: [creativeUrl], type, objective }, token.name);
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
