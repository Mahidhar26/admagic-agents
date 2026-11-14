import { requireBearer } from '@/lib/auth';
import { recentReceipts } from '@/lib/validator';

export async function GET(req: Request) {
  const token = await requireBearer(req, 'read_own');
  if (token instanceof Response) return token;
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 10));
  const rows = await recentReceipts(limit);
  return Response.json(rows.map(({ id, item, priceUsd, status, receiptId, receiptUrl, createdAt }) =>
    ({ id, item, priceUsd, status, receiptId, receiptUrl, createdAt })));
}
