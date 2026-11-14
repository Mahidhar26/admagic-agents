/**
 * Client for AdMagic's MCP endpoint (JSON-RPC tools/call). The extension never sees AdMagic's raw format,
 * only the normalized types below.
 *
 * Verified 2026-11-14 via tools/list: admagic_analyze_creative {image_url | image_base64, objective}.
 * There is no video or compare tool: Compare analyzes each creative and ranks them; video is not offered yet.
 * Response shapes are not published, so toAnalysis() reads them defensively. Check it against a real response.
 */
import { createHash } from 'node:crypto';

export type HeatPoint = { x: number; y: number; r: number; v: number }; // all 0..1 of the image size
export type Analysis = {
  score: number; verdict?: string; insights: string[]; heatmap?: HeatPoint[]; emotionCurve?: number[];
  attention?: { element: string; share: number }[]; dimensions?: Record<string, number>; creativeId?: string;
};
export type Comparison = { ranking: { url: string; score: number; creativeId?: string }[]; winnerUrl: string };
export type Objective = 'awareness' | 'engagement' | 'traffic' | 'promotional' | 'leads' | 'cta';

const live = process.env.ADMAGIC_MODE === 'live';
export const videoSupported = !live; // AdMagic has no video tool yet; the route refuses video before paying

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(process.env.ADMAGIC_MCP_URL ?? 'https://admagic-app-production.up.railway.app/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${process.env.ADMAGIC_API_KEY}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) throw new Error(`AdMagic ${name} failed: HTTP ${res.status}`);
  const text = await res.text();
  // the server may answer as plain JSON or as one SSE event
  const json = JSON.parse(res.headers.get('content-type')?.includes('event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('')
    : text);
  if (json.error) throw new Error(`AdMagic ${name}: ${json.error.message ?? 'error'}`);
  const result = json.result ?? {};
  if (result.isError) throw new Error(`AdMagic ${name}: ${result.content?.[0]?.text ?? 'tool error'}`);
  return result.structuredContent ?? JSON.parse(result.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '{}');
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : undefined);
const pick = (o: Record<string, unknown>, ...keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined);
const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/** Maps admagic_analyze_creative's output to Analysis. Field names are guesses from the tool description. */
export function toAnalysis(raw: Record<string, unknown>): Analysis {
  const report = (pick(raw, 'attention_report', 'attention', 'predicted_attention') ?? {}) as Record<string, unknown>;
  const elements = arr(pick(report, 'elements', 'shares') ?? pick(raw, 'elements'));
  const findings = arr(pick(raw, 'findings') ?? pick(report, 'findings'));
  const score = num(pick(raw, 'overall_score', 'score', 'overall')) ?? 0;

  const attention = elements.map((e) => ({ element: String(pick(e, 'name', 'element', 'label') ?? 'element'), share: num(pick(e, 'share', 'attention_share', 'value')) ?? 0 }));
  // only elements that carry a box can be drawn as a heatmap: {x, y, w, h} as 0..1 (or 0..100)
  const heatmap = elements.flatMap((e) => {
    const b = (pick(e, 'bbox', 'box') ?? e) as Record<string, unknown>;
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => num(b[k]) ?? num(b[{ w: 'width', h: 'height' }[k] ?? k]));
    if ([x, y, w, h].some((v) => v === undefined)) return [];
    const s = Math.max(x!, y!, w!, h!) > 1 ? 100 : 1;
    return [{ x: (x! + w! / 2) / s, y: (y! + h! / 2) / s, r: Math.max(w!, h!) / s / 2, v: Math.min(1, (num(pick(e, 'share', 'attention_share')) ?? 0.5) * 2) }];
  });
  const insights = findings
    .sort((a, b) => String(a.severity ?? '').localeCompare(String(b.severity ?? '')))
    .map((f) => String(pick(f, 'fix', 'recommendation', 'title', 'finding', 'message') ?? ''))
    .filter(Boolean);
  const dims = pick(raw, 'dimension_scores', 'dimensions');

  return {
    score: score <= 1 ? Math.round(score * 100) : Math.round(score),
    verdict: pick(raw, 'verdict') as string | undefined,
    insights: insights.length ? insights.slice(0, 5) : attention.slice(0, 3).map((a) => `${a.element}: ${Math.round(a.share * (a.share <= 1 ? 100 : 1))}% of attention`),
    heatmap: heatmap.length ? heatmap : undefined,
    attention,
    dimensions: dims && typeof dims === 'object' && !Array.isArray(dims) ? (dims as Record<string, number>) : undefined,
    creativeId: pick(raw, 'creative_id', 'creativeId') as string | undefined,
  };
}

// Deterministic fake results so the same creative always scores the same in mock mode.
function fake(url: string): Analysis {
  const h = createHash('sha256').update(url).digest();
  const pool = [
    'Face in the first frame holds attention', 'Headline is too small to read on mobile', 'Brand logo lands late; move it up',
    'High contrast call to action', 'Busy background splits attention', 'Product is centred and clear',
  ];
  return {
    score: 40 + (h[0] % 56),
    insights: [...new Set([0, 1, 2].map((i) => pool[(h[i + 1] + i) % pool.length]))],
    heatmap: [0, 1, 2, 3].map((i) => ({ x: h[4 + i] / 255, y: h[8 + i] / 255, r: 0.12 + (h[12 + i] % 10) / 100, v: 0.5 + (h[16 + i] % 50) / 100 })),
  };
}

export async function scoreImage(url: string, objective: Objective = 'engagement'): Promise<Analysis> {
  if (!live) return fake(url);
  return toAnalysis(await callTool('admagic_analyze_creative', { image_url: url, objective }));
}

export async function analyzeVideo(url: string): Promise<Analysis> {
  if (!live) return { ...fake(url), heatmap: undefined, emotionCurve: [0.3, 0.5, 0.7, 0.6, 0.8, 0.4] };
  throw new Error('AdMagic has no video analysis tool yet');
}

/** No compare tool in AdMagic: analyze each creative (1 AdMagic analysis each) and rank. */
export async function compare(urls: string[]): Promise<Comparison> {
  const scored = await Promise.all(urls.map(async (url) => {
    const a = await scoreImage(url);
    return { url, score: a.score, creativeId: a.creativeId };
  }));
  const ranking = scored.sort((a, b) => b.score - a.score);
  return { ranking, winnerUrl: ranking[0].url };
}
