import { adminOnly } from '@/lib/auth';
import { settle } from '@/lib/affiliates';

export async function POST() {
  const denied = await adminOnly();
  if (denied) return denied;
  await settle();
  return Response.json({ message: 'Due payouts released' });
}
