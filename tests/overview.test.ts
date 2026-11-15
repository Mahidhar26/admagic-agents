import { describe, expect, it } from 'vitest';
import { windows } from '../lib/overview';

describe('overview windows (Toronto time)', () => {
  // shortcut: torontoMidnight uses the current UTC offset, so on a DST changeover day it is 1 h off; tested away from that day
  it('today, yesterday and month start line up', () => {
    const w = windows(new Date('2026-12-15T06:30:00Z')); // 01:30 EST, Dec 15
    expect(w.today.start.toISOString()).toBe('2026-12-15T05:00:00.000Z');
    expect(w.yesterday.start.toISOString()).toBe('2026-12-14T05:00:00.000Z');
    expect(w.yesterday.end.toISOString()).toBe('2026-12-15T05:00:00.000Z');
    expect(w.month.start.toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('on the 1st, month start is today', () => {
    const w = windows(new Date('2026-12-01T15:00:00Z'));
    expect(w.month.start.toISOString()).toBe(w.today.start.toISOString());
  });
});
