import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireBearer } from '@/lib/auth';
import { finish } from '@/lib/validator';

export const maxDuration = 60;

export async function GET(req: Request, ctx: RouteContext<'/api/purchase/[id]'>) {
  const token = await requireBearer(req, 'buy');
  if (token instanceof Response) return token;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404 });
  const p = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, id) });
  if (!p) return Response.json({ error: 'Not found' }, { status: 404 });
  try {
    const r = await finish(p);
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
