import { describe, expect, it } from 'vitest';
import { toAnalysis } from '../lib/admagic';

describe('toAnalysis (AdMagic analyze_creative output)', () => {
  it('reads score, verdict, findings and attention shares', () => {
    const a = toAnalysis({
      overall_score: 72, verdict: 'Strong', creative_id: 'cr_1',
      dimension_scores: { clarity: 80 },
      attention_report: { elements: [{ name: 'Logo', share: 0.12, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } }, { name: 'Headline', share: 0.4 }] },
      findings: [{ severity: 'high', fix: 'Enlarge the headline' }],
    });
    expect(a).toMatchObject({ score: 72, verdict: 'Strong', creativeId: 'cr_1', insights: ['Enlarge the headline'], dimensions: { clarity: 80 } });
    expect(a.attention).toEqual([{ element: 'Logo', share: 0.12 }, { element: 'Headline', share: 0.4 }]);
    expect(a.heatmap).toHaveLength(1); // only the element with a box
    expect(a.heatmap![0].x).toBeCloseTo(0.2);
  });
  it('scales a 0..1 score and falls back to attention lines when there are no findings', () => {
    const a = toAnalysis({ score: 0.65, attention: { elements: [{ name: 'Face', share: 0.5 }] } });
    expect(a.score).toBe(65);
    expect(a.insights).toEqual(['Face: 50% of attention']);
    expect(a.heatmap).toBeUndefined();
  });
  it('survives an empty response', () => expect(toAnalysis({})).toMatchObject({ score: 0, insights: [] }));
});
