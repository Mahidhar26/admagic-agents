// Turns what the brand types into one of the things the agents can really do. No LLM: plain rules, so a run never guesses.
import type { Objective } from './admagic';

export type AgentName = 'scout' | 'broker' | 'paymaster' | 'guard';
export type Intent =
  | { kind: 'score'; url: string; objective?: Objective }
  | { kind: 'compare'; urls: string[]; objective?: Objective }
  | { kind: 'release' }
  | { kind: 'offer' }
  | { kind: 'status' }
  | { kind: 'help'; reason?: string };

const OBJECTIVES: Objective[] = ['awareness', 'engagement', 'traffic', 'promotional', 'leads', 'cta'];

export function parseIntent(text: string): Intent {
  const urls = [...new Set(text.match(/https:\/\/[^\s<>"')]+/g) ?? [])];
  const lower = text.toLowerCase();
  const objective = OBJECTIVES.find((o) => new RegExp(`\\b${o}\\b`).test(lower));
  if (urls.length > 5) return { kind: 'help', reason: 'Compare takes 2 to 5 ads at a time.' };
  if (urls.length >= 2) return { kind: 'compare', urls, objective };
  if (urls.length === 1) return { kind: 'score', url: urls[0], objective };
  if (/\bhttp:\/\//.test(lower)) return { kind: 'help', reason: 'Links must start with https://' };
  if (/\b(release|settle|payouts?|pay (out|affiliates|due))\b/.test(lower)) return { kind: 'release' };
  if (/\b(offer|launch|campaign|affiliate)\b/.test(lower)) return { kind: 'offer' };
  if (/\b(status|budget|spend|summary|today|how)\b/.test(lower)) return { kind: 'status' };
  return { kind: 'help' };
}
