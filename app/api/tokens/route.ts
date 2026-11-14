import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly, newToken, SCOPES } from '@/lib/auth';

/** Brand: create an AI-agent affiliate token (shown once). */
export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({ name: z.string().min(1).max(80), affiliateId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const aff = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, parsed.data.affiliateId) });
  if (aff?.type !== 'agent') return Response.json({ error: 'Pick an affiliate of type agent' }, { status: 400 });
  const { raw, hash } = newToken();
  await db.insert(schema.apiTokens).values({
    name: parsed.data.name, kind: 'agent', scopes: [...SCOPES.agent], tokenHash: hash, affiliateId: aff.id,
    expiresAt: new Date(Date.now() + 7 * 86400_000),
  });
  return Response.json({ token: raw, message: `Agent token (shown once): ${raw}` }, { status: 201 });
}

/** Brand: revoke any token. Takes effect on the next call. */
export async function DELETE(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({ id: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'id required' }, { status: 400 });
  await db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(eq(schema.apiTokens.id, parsed.data.id));
  return Response.json({ message: 'Revoked' });
}
