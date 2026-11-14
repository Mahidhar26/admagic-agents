import { describe, expect, it } from 'vitest';
import { toAnalysis } from '../lib/admagic';

// Trimmed from a live admagic_analyze_creative response (2026-11-14).
const live = {
  creative_id: '1fac5678-a8f6-4736-bcb0-d178649947d8', score: 58, verdict: 'OPTIMISE',
  scores: { visual: 62.2, emotional: 27, attention: 77.1, memory: 31.4, language: 79 },
  attention: {
    elements: [
      { name: 'Red running shoe', sharePct: 61.5, box: { x: 20, y: 25, w: 60, h: 50 } },
      { name: 'Red background', sharePct: 20.2, box: { x: 0, y: 0, w: 100, h: 100 } },
      { name: 'Nike Swoosh logo', sharePct: 1.9, box: { x: 35, y: 35, w: 15, h: 8 } },
      { name: 'Nike Flyknit text', sharePct: 0, box: { x: 25, y: 25, w: 15, h: 5 } },
    ],
    findings: [],
  },
};

describe('toAnalysis', () => {
  it('maps a live response', () => {
    const a = toAnalysis(live);
    expect(a).toMatchObject({ score: 58, verdict: 'OPTIMISE', creativeId: live.creative_id, dimensions: live.scores });
    expect(a.insights).toEqual([
      'Red running shoe draws 62% of attention',
      'Red background draws 20% of attention',
      'Weakest: emotional (27/100)',
    ]);
    expect(a.attention![0]).toEqual({ element: 'Red running shoe', share: 61.5 });
  });
  it('heatmap skips the full-frame background and zero-share elements', () => {
    const h = toAnalysis(live).heatmap!;
    expect(h).toHaveLength(2);
    expect(h[0]).toEqual({ x: 0.5, y: 0.5, r: 0.3, v: 1 });
    expect(h[1].v).toBeCloseTo(0.038);
  });
  it('uses findings as insights when there are any', () =>
    expect(toAnalysis({ ...live, attention: { ...live.attention, findings: [{ fix: 'Add a call to action' }] } }).insights).toEqual(['Add a call to action']));
  it('survives an empty response', () => expect(toAnalysis({})).toMatchObject({ score: 0, insights: [] }));
});
