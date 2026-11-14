import { and, count, eq, isNull, gt } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly, block, newToken, SCOPES } from '@/lib/auth';
import { PAIRING_MS } from '@/lib/rules';

const P = schema.pairingCodes;

/** Extension: trade a 6-digit code (5 min, single use) for a 7-day token. */
export async function POST(req: Request) {
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter the 6-digit code' }, { status: 400 });
  // 6 digits can be guessed: stop all pairing after 20 wrong codes in 5 minutes
  const [{ fails }] = await db.select({ fails: count() }).from(schema.blockedEvents)
    .where(and(eq(schema.blockedEvents.caller, 'extension pairing'), gt(schema.blockedEvents.createdAt, new Date(Date.now() - PAIRING_MS))));
  if (fails >= 20) return Response.json({ error: 'Too many attempts, try again in 5 minutes' }, { status: 429 });
  // claim atomically so a code can never be used twice
  const [claimed] = await db.update(P).set({ usedAt: new Date() })
    .where(and(eq(P.code, parsed.data.code), isNull(P.usedAt), gt(P.expiresAt, new Date()))).returning();
  if (!claimed) {
    await block('extension pairing', 'invalid or expired pairing code');
    return Response.json({ error: 'Code is wrong or expired' }, { status: 401 });
  }
  const { raw, hash } = newToken();
  await db.insert(schema.apiTokens).values({
    name: `Extension ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, kind: 'extension',
    scopes: [...SCOPES.extension], tokenHash: hash, expiresAt: new Date(Date.now() + 7 * 86400_000),
  });
  return Response.json({ token: raw });
}

/** Brand: show a new pairing code on the Activity page. */
export async function PUT() {
  const denied = await adminOnly();
  if (denied) return denied;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.insert(P).values({ code, expiresAt: new Date(Date.now() + PAIRING_MS) })
    .onConflictDoUpdate({ target: P.code, set: { expiresAt: new Date(Date.now() + PAIRING_MS), usedAt: null } });
  return Response.json({ code, message: `Pairing code: ${code} (valid 5 minutes)` });
}
