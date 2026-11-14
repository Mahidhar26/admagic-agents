/** Shared checks for the endpoints Qatom calls after a buyer pays for a catalog item. */
import { z } from 'zod';
import { block } from './auth';
import { fromQatom } from './rules';
import { hashCreative } from './validator';

export const objective = z.enum(['awareness', 'engagement', 'traffic', 'promotional', 'leads', 'cta']).optional();

/** Checks the Qatom secret and the body. Returns the parsed body, or a Response to send back. */
export async function readQatomCall<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | Response> {
  if (!fromQatom(req.headers.get('authorization'), process.env.QATOM_FULFILMENT_SECRET)) {
    await block('qatom fulfilment', 'bad or missing Qatom secret');
    return Response.json({ error: 'Not a Qatom call' }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  return parsed.data;
}

/** Public https images only, checked before AdMagic spends anything. Returns an error Response or null. */
export async function checkImages(urls: string[]) {
  try {
    await Promise.all(urls.map(hashCreative));
    return null;
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

// shortcut: the buyer has already paid; a failure here needs a manual refund in Qatom until Qatom tells us how refunds work
export const analysisFailed = (e: unknown) => Response.json({ error: (e as Error).message }, { status: 502 });
