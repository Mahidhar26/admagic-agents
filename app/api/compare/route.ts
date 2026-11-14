import { z } from 'zod';
import { requireBearer } from '@/lib/auth';
import { runPaid } from '@/lib/validator';

export const maxDuration = 60;

const Body = z.object({ creativeUrls: z.array(z.url()).min(2).max(5) });

export async function POST(req: Request) {
  const token = await requireBearer(req, 'buy');
  if (token instanceof Response) return token;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    const r = await runPaid('compare', { urls: [...new Set(parsed.data.creativeUrls)], type: 'image' }, token.name);
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
