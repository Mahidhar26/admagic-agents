import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, schema } from './db';
import { linkUrl } from './affiliates';

/** Returns the affiliate's tracked link for an offer, creating it once. */
export async function createLink(offerId: string, affiliateId: string, origin: string) {
  const L = schema.affiliateLinks;
  const existing = await db.query.affiliateLinks.findFirst({ where: and(eq(L.offerId, offerId), eq(L.affiliateId, affiliateId)) });
  const link = existing ?? (await db.insert(L).values({ offerId, affiliateId, code: randomBytes(5).toString('base64url') }).returning())[0];
  return linkUrl(origin, link.code);
}
