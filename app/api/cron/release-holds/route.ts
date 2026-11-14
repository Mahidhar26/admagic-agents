import { timingSafeEqual } from 'node:crypto';
import { settle } from '@/lib/affiliates';

export async function GET(req: Request) {
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`);
  if (!process.env.CRON_SECRET || got.length !== want.length || !timingSafeEqual(got, want)) {
    return new Response('Unauthorized', { status: 401 });
  }
  await settle();
  return Response.json({ ok: true });
}
