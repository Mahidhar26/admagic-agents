import { adminOnly } from '@/lib/auth';
import { recentPayments } from '@/lib/payments';

// Audit export of every payment (both flows), for the brand's books.
export async function GET() {
  const denied = await adminOnly();
  if (denied) return denied;
  const rows = await recentPayments(5000);
  // quote every cell; a leading = + - @ is prefixed so spreadsheets don't run it as a formula
  const cell = (v: unknown) => `"${String(v ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
  const csv = [
    ['time_utc', 'flow', 'from', 'to', 'amount_usd', 'status', 'receipt_id', 'receipt_url'],
    ...rows.map((p) => [p.at.toISOString(), p.flow, p.from, p.to, p.amountUsd.toFixed(2), p.status, p.receiptId, p.receiptUrl]),
  ].map((r) => r.map(cell).join(',')).join('\n');
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="admagic-payments.csv"' },
  });
}
