import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { adminOnly, requireBearer, isAdmin } from '@/lib/auth';
import { dailyLimit, spentToday } from '@/lib/validator';
import { qatom, WALLETS } from '@/lib/qatom';

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    const token = await requireBearer(req, 'read_own');
    if (token instanceof Response) return token;
  }
  const [spentTodayUsd, limitUsd, wallet] = await Promise.all([spentToday(), dailyLimit(), qatom.getWalletBalance(WALLETS.buyer)]);
  return Response.json({ spentTodayUsd, limitUsd, walletBalanceUsd: wallet.balanceUsd });
}

// The extension's token can't change the budget (see Access control); the brand changes it on /activity.
export async function PUT(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({ limitUsd: z.coerce.number().min(0).max(1000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { limitUsd } = parsed.data;
  await db.insert(schema.settings).values({ id: 1, dailyLimitUsd: limitUsd })
    .onConflictDoUpdate({ target: schema.settings.id, set: { dailyLimitUsd: limitUsd } });
  return Response.json({ limitUsd });
}
