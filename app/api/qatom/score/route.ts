import { z } from 'zod';
import * as admagic from '@/lib/admagic';
import { analysisFailed, checkImages, objective, readQatomCall } from '@/lib/fulfil';

export const maxDuration = 60;

// Matches the service schema on the Qatom catalog item "AdMagic: Score one ad".
const Body = z.object({ image_url: z.url(), objective });

/** Qatom calls this after the buyer has paid, so nothing is charged here. */
export async function POST(req: Request) {
  const body = await readQatomCall(req, Body);
  if (body instanceof Response) return body;
  const bad = await checkImages([body.image_url]);
  if (bad) return bad;
  try {
    const a = await admagic.scoreImage(body.image_url, body.objective);
    return Response.json({
      score: a.score, verdict: a.verdict, insights: a.insights, dimensions: a.dimensions,
      attention: a.attention?.map(({ element, share }) => ({ element, share_pct: share })),
    });
  } catch (e) {
    return analysisFailed(e);
  }
}
