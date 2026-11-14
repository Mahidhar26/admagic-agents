// Seeds the one demo brand: daily limit, one offer, three affiliates (creator, agency, agent) with links,
// and an agent token printed once. Run: npm run seed (needs DATABASE_URL; `vercel env pull .env.local` first).
import { randomBytes } from 'node:crypto';
import { db, schema } from '../lib/db';
import { sha256 } from '../lib/rules';

async function main() {
  await db.insert(schema.settings).values({ id: 1, dailyLimitUsd: Number(process.env.DAILY_BUDGET_USD ?? 10) }).onConflictDoNothing();

  const [offer] = await db.insert(schema.affiliateOffers).values({
    name: 'Demo sneaker ad',
    creativeUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
    neuralScore: 82,
    cpcUsd: 0.1, cpaUsd: 5, revsharePct: 10, payoutMode: 'hold', holdMinutes: 2,
    dailyCapPerAffiliateUsd: 50, totalBudgetUsd: 500,
    webhookSecret: `whsec_${randomBytes(24).toString('hex')}`,
  }).returning();

  const affs = await db.insert(schema.affiliates).values([
    { type: 'creator', displayName: 'Maya (creator)', qatomAccountId: 'qa_demo_creator', verified: true },
    { type: 'agency', displayName: 'Northside Media (agency)', qatomAccountId: 'qa_demo_agency', verified: false },
    { type: 'agent', displayName: 'Claude shopping agent', qatomAccountId: 'qa_demo_agent', verified: true },
  ]).returning();

  for (const a of affs) {
    await db.insert(schema.affiliateLinks).values({ offerId: offer.id, affiliateId: a.id, code: randomBytes(5).toString('base64url') });
  }

  const raw = randomBytes(32).toString('base64url');
  await db.insert(schema.apiTokens).values({
    name: 'Seeded Claude agent', kind: 'agent', scopes: ['offers:read', 'links:create', 'earnings:read_own'],
    tokenHash: sha256(raw), affiliateId: affs[2].id, expiresAt: new Date(Date.now() + 7 * 86400_000),
  });

  console.log(`Offer ${offer.id} seeded with 3 affiliates.`);
  console.log(`Agent MCP token (shown once): ${raw}`);
  console.log('Agent qatom_account_id: qa_demo_agent');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
