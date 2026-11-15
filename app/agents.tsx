import type { AgentName } from '@/lib/agent';
import { Icon, type IconName } from './Icon';

/** The four agents. Each owns one job; the colour shows who acted. */
export const AGENTS: Record<AgentName, { name: string; job: string; icon: IconName; href: string }> = {
  scout: { name: 'Scout', job: 'Scores ads with AdMagic', icon: 'scan', href: '/validator' },
  broker: { name: 'Broker', job: 'Runs affiliate offers', icon: 'offers', href: '/affiliates?tab=offers' },
  paymaster: { name: 'Paymaster', job: 'Pays affiliates', icon: 'wallet', href: '/affiliates?tab=payouts' },
  guard: { name: 'Guard', job: 'Enforces limits and access', icon: 'control', href: '/activity' },
};

export const agentVars = (a: AgentName) => ({ '--a': `var(--${a})`, '--a-soft': `var(--${a}-soft)` }) as React.CSSProperties;

export function AgentDot({ agent, size = 28 }: { agent: AgentName; size?: number }) {
  return (
    <span className="agent-dot" style={{ ...agentVars(agent), width: size, height: size }} title={AGENTS[agent].name} aria-hidden="true">
      <Icon name={AGENTS[agent].icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
