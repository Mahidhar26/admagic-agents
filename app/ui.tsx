// Small display helpers shared by the platform pages.
import type { AgentName } from '@/lib/agent';
import { AGENTS, AgentDot, agentVars } from './agents';
export const usd = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const time = (d: Date | null) =>
  d?.toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? '–';

export function PageHead({ eyebrow, agent, title, children, actions }: { eyebrow?: string; agent?: AgentName; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {agent && (
          <div className="flex items-center gap-2 mb-2 small" style={agentVars(agent)}>
            <AgentDot agent={agent} size={24} /><span className="agent-name">{AGENTS[agent].name}</span><span className="muted">{AGENTS[agent].job}</span>
          </div>
        )}
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Neural Score as a ring; colour follows the band so it reads without the number too. */
export function Score({ value, size = 44 }: { value: number | null | undefined; size?: number }) {
  if (value == null) return <span className="muted">–</span>;
  const c = value >= 70 ? 'var(--ok)' : value >= 50 ? 'var(--warn)' : 'var(--bad)';
  return (
    <span className="score" role="img" aria-label={`Neural Score ${value} of 100`}
      style={{ '--s': value, '--score-c': c, width: size, height: size, fontSize: size / 3 } as React.CSSProperties}>
      <span>{value}</span>
    </span>
  );
}

const TONES: Record<string, string> = {
  paid: 'b-ok', active: 'b-ok', verified: 'b-ok', ok: 'b-ok',
  pending_approval: 'b-warn', pending_hold: 'b-warn', payable: 'b-info', paused: 'b-warn',
  failed: 'b-bad', blocked: 'b-bad', clawed_back: 'b-bad', revoked: 'b-bad',
};
const LABELS: Record<string, string> = {
  pending_approval: 'Waiting for phone approval', pending_hold: 'On hold', clawed_back: 'Clawed back',
};

export function Status({ s, children }: { s: string; children?: React.ReactNode }) {
  return <span className={`badge ${TONES[s] ?? ''}`}>{LABELS[s] ?? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ')}{children}</span>;
}

export function ReceiptLink({ url, label = 'Receipt' }: { url: string | null | undefined; label?: string }) {
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="font-medium" style={{ color: 'var(--accent)' }}>{label} ↗</a>
    : <span className="muted">–</span>;
}
