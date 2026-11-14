import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly } from '@/lib/auth';
import { settle } from '@/lib/affiliates';

/** Approve or reject an earning that was blocked by the daily cap. */
export async function POST(req: Request, ctx: RouteContext<'/api/affiliates/earnings/[id]'>) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = z.object({ decision: z.enum(['approve', 'reject']) }).safeParse(await req.json().catch(() => null));
  if (!body.success || !z.uuid().safeParse(id).success) return Response.json({ error: 'Invalid input' }, { status: 400 });
  const E = schema.affiliateEarnings;
  const [row] = await db.update(E)
    .set({ status: body.data.decision === 'approve' ? 'payable' : 'clawed_back' })
    .where(and(eq(E.id, id), eq(E.status, 'blocked'))).returning();
  if (!row) return Response.json({ error: 'Not a blocked earning' }, { status: 404 });
  await settle(); // large amounts go through Qatom phone approval inside payAccount
  return Response.json({ message: body.data.decision === 'approve' ? 'Approved' : 'Rejected' });
}
