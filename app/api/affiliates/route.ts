import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly } from '@/lib/auth';
import { createLink } from '@/lib/links';

export async function GET() {
  const denied = await adminOnly();
  if (denied) return denied;
  return Response.json(await db.select().from(schema.affiliates).orderBy(desc(schema.affiliates.createdAt)));
}

/** Invite: creates the affiliate and, when an offer is named, its tracked link. */
export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({
    type: z.enum(['creator', 'agency', 'agent']),
    displayName: z.string().min(1).max(120),
    qatomAccountId: z.string().max(128).optional(),
    offerId: z.uuid().optional().or(z.literal('').transform(() => undefined)),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { offerId, ...a } = parsed.data;
  const [aff] = await db.insert(schema.affiliates).values({ ...a, qatomAccountId: a.qatomAccountId || null }).returning();
  const url = offerId ? await createLink(offerId, aff.id, new URL(req.url).origin) : null;
  return Response.json({ id: aff.id, message: url ? `Invited. Tracked link: ${url}` : 'Invited.' }, { status: 201 });
}
