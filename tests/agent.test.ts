import { describe, expect, it } from 'vitest';
import { parseIntent } from '../lib/agent';

describe('parseIntent', () => {
  it('one link scores, 2-5 compare, more is refused', () => {
    expect(parseIntent('score https://a.com/x.jpg for traffic')).toEqual({ kind: 'score', url: 'https://a.com/x.jpg', objective: 'traffic' });
    expect(parseIntent('https://a.com/1.jpg https://a.com/2.jpg')).toMatchObject({ kind: 'compare', urls: ['https://a.com/1.jpg', 'https://a.com/2.jpg'] });
    expect(parseIntent('https://a.com/1.jpg https://a.com/1.jpg')).toMatchObject({ kind: 'score' }); // duplicates collapse
    expect(parseIntent(Array.from({ length: 6 }, (_, i) => `https://a.com/${i}.jpg`).join(' '))).toMatchObject({ kind: 'help' });
  });

  it('plain http is refused, words route to the right agent', () => {
    expect(parseIntent('http://a.com/x.jpg')).toMatchObject({ kind: 'help', reason: expect.stringContaining('https') });
    expect(parseIntent('Release due payouts')).toEqual({ kind: 'release' });
    expect(parseIntent('launch an offer from my best ad')).toEqual({ kind: 'offer' });
    expect(parseIntent("what's my budget today")).toEqual({ kind: 'status' });
    expect(parseIntent('make me a sandwich')).toEqual({ kind: 'help' });
  });
});

describe('demo sign-in', async () => {
  const { credentialsMatch, DEMO_ACCOUNT } = await import('../lib/auth');
  it('accepts only the demo email and password', () => {
    expect(credentialsMatch(` ${DEMO_ACCOUNT.email.toUpperCase()} `, DEMO_ACCOUNT.password)).toBe(true);
    expect(credentialsMatch(DEMO_ACCOUNT.email, 'wrong')).toBe(false);
    expect(credentialsMatch('someone@else.com', DEMO_ACCOUNT.password)).toBe(false);
  });
});
