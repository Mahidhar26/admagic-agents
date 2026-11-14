import { z } from 'zod';
import * as admagic from '@/lib/admagic';
import { analysisFailed, checkImages, objective, readQatomCall } from '@/lib/fulfil';

export const maxDuration = 60;

// Matches the service schema on the Qatom catalog item "AdMagic: Compare ad creatives".
const Body = z.object({ image_urls: z.array(z.url()).min(2).max(5), objective });

/** Qatom calls this after the buyer has paid, so nothing is charged here. */
export async function POST(req: Request) {
  const body = await readQatomCall(req, Body);
  if (body instanceof Response) return body;
  const urls = [...new Set(body.image_urls)];
  if (urls.length < 2) return Response.json({ error: 'Send at least 2 different image links' }, { status: 400 });
  const bad = await checkImages(urls);
  if (bad) return bad;
  try {
    const r = await admagic.compare(urls, body.objective);
    return Response.json({
      winner_url: r.winnerUrl,
      ranking: r.ranking.map(({ url, score, verdict, insights }, i) => ({ rank: i + 1, url, score, verdict, insights })),
    });
  } catch (e) {
    return analysisFailed(e);
  }
}
