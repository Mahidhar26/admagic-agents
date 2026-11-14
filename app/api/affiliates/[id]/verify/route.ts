import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly } from '@/lib/auth';
import { qatom } from '@/lib/qatom';
import { settle } from '@/lib/affiliates';

export async function POST(req: Request, ctx: RouteContext<'/api/affiliates/[id]/verify'>) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = z.object({ qatomAccountId: z.string().max(128).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!z.uuid().safeParse(id).success || !body.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
  const aff = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, id) });
  if (!aff) return Response.json({ error: 'Not found' }, { status: 404 });
  const accountId = body.data.qatomAccountId || aff.qatomAccountId;
  if (!accountId) return Response.json({ error: 'Add a Qatom account ID first' }, { status: 400 });
  const { verified } = await qatom.verifyAccount(accountId);
  await db.update(schema.affiliates).set({ qatomAccountId: accountId, verified }).where(eq(schema.affiliates.id, id));
  if (verified) await settle(); // waiting payable earnings can go out now
  return Response.json({ verified, message: verified ? 'Verified with Qatom' : 'Qatom could not verify this account' });
}
