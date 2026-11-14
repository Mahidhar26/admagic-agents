/**
 * Client for AdMagic's MCP endpoint (JSON-RPC tools/call). The extension never sees AdMagic's raw format,
 * only the normalized types below.
 *
 * Verified 2026-11-14 via tools/list: admagic_analyze_creative {image_url | image_base64, objective}.
 * There is no video or compare tool: Compare analyzes each creative and ranks them; video is not offered yet.
 * toAnalysis() follows a live response from 2026-11-14 (see tests/admagic.test.ts).
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

export async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
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

// The parts of admagic_analyze_creative's output we use (seen in a live response, 2026-11-14).
type Raw = {
  creative_id?: string; score?: number; verdict?: string; summary?: string;
  scores?: Record<string, number>; // visual, emotional, attention, memory, language (0..100)
  attention?: {
    elements?: { name: string; sharePct: number; box?: { x: number; y: number; w: number; h: number } }[]; // box in % of the image
    findings?: Record<string, unknown>[];
  };
};

const FULL_FRAME_PCT = 90; // a box this big is the background: drawing it would wash out the heatmap

export function toAnalysis(raw: Record<string, unknown>): Analysis {
  const r = raw as Raw;
  const elements = r.attention?.elements ?? [];
  const dims = Object.entries(r.scores ?? {}).sort((a, b) => a[1] - b[1]);

  // findings' shape isn't confirmed yet (empty in the sample), so read the likely text fields
  const fixes = (r.attention?.findings ?? [])
    .map((f) => String(f.fix ?? f.recommendation ?? f.title ?? f.message ?? f.finding ?? ''))
    .filter(Boolean);
  const insights = fixes.length ? fixes : [
    ...elements.slice(0, 2).map((e) => `${e.name} draws ${Math.round(e.sharePct)}% of attention`),
    ...(dims.length ? [`Weakest: ${dims[0][0]} (${Math.round(dims[0][1])}/100)`] : []),
  ];

  const heatmap = elements
    .filter((e) => e.box && e.sharePct > 0 && Math.min(e.box.w, e.box.h) < FULL_FRAME_PCT)
    .map(({ box, sharePct }) => ({
      x: (box!.x + box!.w / 2) / 100, y: (box!.y + box!.h / 2) / 100,
      r: Math.max(box!.w, box!.h) / 200, v: Math.min(1, sharePct / 50),
    }));

  return {
    score: Math.round(r.score ?? 0),
    verdict: r.verdict,
    insights: insights.slice(0, 5),
    heatmap: heatmap.length ? heatmap : undefined,
    attention: elements.map((e) => ({ element: e.name, share: e.sharePct })),
    dimensions: r.scores,
    creativeId: r.creative_id,
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
