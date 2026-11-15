import Link from 'next/link';
import { and, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireAdminPage } from '@/lib/auth';
import { settle } from '@/lib/affiliates';
import { feed } from '@/lib/feed';
import { metrics, windows } from '@/lib/overview';
import { qatom, WALLETS } from '@/lib/qatom';
import { torontoMidnight } from '@/lib/rules';
import { dailyLimit, spentToday } from '@/lib/validator';
import type { AgentName } from '@/lib/agent';
import { AGENTS, AgentDot, agentVars } from '../agents';
import { Icon } from '../Icon';
import { Mission } from '../Mission';
import { usd } from '../ui';

const ago = (d: Date) => {
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};

export default async function Workspace() {
  await requireAdminPage();
  await settle();
  const today = torontoMidnight();
  const E = schema.affiliateEarnings;
  const Ev = schema.affiliateEvents;
  const [items, m, spent, limit, buyer, offerW, recent, [offers], [traffic], [owed], [guard]] = await Promise.all([
    feed(16), metrics(windows().today), spentToday(), dailyLimit(),
    qatom.getWalletBalance(WALLETS.buyer), qatom.getWalletBalance(WALLETS.offer),
    db.select({ url: schema.analyses.creativeUrl, item: schema.analyses.item, at: schema.analyses.createdAt }).from(schema.analyses).orderBy(desc(schema.analyses.createdAt)).limit(12),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.affiliateOffers).where(eq(schema.affiliateOffers.status, 'active')),
    db.select({ q: sql<number>`count(*) filter (where ${Ev.type} = 'qualified_click')::int`, c: sql<number>`count(*) filter (where ${Ev.type} = 'conversion')::int` }).from(Ev).where(gte(Ev.createdAt, today)),
    db.select({ n: sql<number>`count(*)::int`, usd: sql<number>`coalesce(sum(${E.amountUsd}), 0)::float` }).from(E).where(inArray(E.status, ['pending_hold', 'payable'])),
    db.select({
      blocked: sql<number>`(select count(*)::int from ${schema.blockedEvents} where ${schema.blockedEvents.createdAt} >= ${today})`,
      tokens: sql<number>`count(*)::int`,
    }).from(schema.apiTokens).where(and(isNull(schema.apiTokens.revokedAt), ne(schema.apiTokens.kind, 'agent'))),
  ]);

  const singles = [...new Set(recent.filter((r) => r.item === 'image').map((r) => r.url))];
  const suggestions = [
    ...(singles[0] ? [{ label: 'Re-check my last ad', prompt: `Score ${singles[0]}` }] : []),
    ...(singles.length >= 2 ? [{ label: `Compare my last ${Math.min(3, singles.length)} ads`, prompt: `Compare ${singles.slice(0, 3).join(' ')}` }] : []),
    { label: 'Launch an offer from my best ad', prompt: 'Launch an offer from my best ad' },
    { label: 'Release due payouts', prompt: 'Release due payouts' },
    { label: 'Budget and wallets', prompt: 'Status: budget and wallets' },
  ];

  const crew: { agent: AgentName; status: string; busy: boolean }[] = [
    { agent: 'scout', status: `${m.analyses} paid analyses today${recent[0] ? ` · last ${ago(recent[0].at)} ago` : ''}`, busy: false },
    { agent: 'broker', status: `${offers.n} offers live · ${traffic.q} qualified visits, ${traffic.c} sales today`, busy: offers.n > 0 },
    { agent: 'paymaster', status: owed.usd > 0 ? `${usd(owed.usd)} owed across ${owed.n} earnings` : owed.usd < 0 ? `${usd(-owed.usd)} to recover from refunds` : 'Nothing owed', busy: owed.usd !== 0 },
    { agent: 'guard', status: `${guard.blocked} refused today · ${guard.tokens} device tokens active`, busy: true },
  ];
  const used = Math.min(1, spent / (limit || 1));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <header className="mb-5">
          <div className="flex items-center gap-2 small muted"><span className="live-dot" aria-hidden="true" /> Agents online</div>
          <h1 className="mt-2 text-[28px]">What should your agents do?</h1>
          <p className="muted mt-1">They score ads, launch affiliate offers and pay people for verified results. Each payment is checked against your limits and comes with a receipt.</p>
        </header>

        <Mission suggestions={suggestions} />

        <section className="card-flush section">
          <div className="card-head">
            <h2>Agent activity</h2>
            <a href="/api/export" download className="small font-medium inline-flex items-center gap-1" style={{ color: 'var(--muted)' }}><Icon name="download" size={13} /> CSV</a>
          </div>
          {items.length === 0 && <p className="p-6 text-center muted">No activity yet. Give the agents a task above.</p>}
          <ol>
            {items.map((f, i) => (
              <li key={i} className="feed-item" style={agentVars(f.agent)}>
                <AgentDot agent={f.agent} />
                <div className="min-w-0">
                  <div className="text-[13.5px]"><span className="agent-name">{AGENTS[f.agent].name}</span> <span>{f.text}</span>{f.count && <span className="badge plain ml-1.5">×{f.count}</span>}</div>
                  <div className="small muted mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>{ago(f.at)} ago</span>
                    {f.receiptUrl && <a href={f.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--ok)' }}><Icon name="receipt" size={12} /> Receipt</a>}
                    {f.href && <Link href={f.href} className="hover:underline">Details</Link>}
                  </div>
                </div>
                {f.amountUsd != null && (
                  <span className="num font-semibold text-[13.5px]" style={{ color: f.tone === 'bad' ? 'var(--bad)' : undefined }}>{usd(f.amountUsd)}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="grid gap-4 content-start lg:sticky lg:top-6">
        <section className="rail-card">
          <h2>Your crew</h2>
          <ul className="grid gap-3">
            {crew.map((c) => (
              <li key={c.agent} style={agentVars(c.agent)}>
                <Link href={AGENTS[c.agent].href} className="flex gap-3 no-underline group">
                  <AgentDot agent={c.agent} size={34} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-semibold group-hover:underline">{AGENTS[c.agent].name}</span><span className="small muted">{AGENTS[c.agent].job}</span></div>
                    <div className="small muted mt-0.5">{c.status}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rail-card" style={agentVars('guard')}>
          <div className="flex items-center justify-between"><h2 className="m-0">Guardrails</h2><Link href="/activity" className="small" style={{ color: 'var(--guard)' }}>Edit</Link></div>
          <div className="mt-3 flex items-baseline justify-between"><span className="small muted">Spent today</span><span className="num font-semibold">{usd(spent)} <span className="muted font-normal">/ {usd(limit)}</span></span></div>
          <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--surface-2)' }} role="progressbar" aria-label="Daily budget used" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${used * 100}%`, background: used > 0.85 ? 'var(--bad)' : 'var(--guard)' }} />
          </div>
          <ul className="grid gap-2 mt-4 small">
            <li className="flex gap-2"><span style={{ color: 'var(--ok)' }}><Icon name="check" size={14} /></span>Above the wallet’s limit, you approve on your phone</li>
            <li className="flex gap-2"><span style={{ color: 'var(--ok)' }}><Icon name="check" size={14} /></span>Never pays twice for the same creative</li>
            <li className="flex gap-2"><span style={{ color: 'var(--ok)' }}><Icon name="check" size={14} /></span>Affiliates paid only to verified payout accounts</li>
          </ul>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="rounded-lg p-2.5" style={{ background: 'var(--surface-2)' }}><div className="small muted">Buyer wallet</div><div className="num font-semibold">{usd(buyer.balanceUsd)}</div></div>
            <div className="rounded-lg p-2.5" style={{ background: 'var(--surface-2)' }}><div className="small muted">Offer wallet</div><div className="num font-semibold">{usd(offerW.balanceUsd)}</div></div>
          </div>
        </section>

        <section className="rail-card">
          <h2>Today</h2>
          <dl className="grid grid-cols-2 gap-y-3 gap-x-2">
            {([['Spent on scoring', m.spendUsd], ['Affiliate sales', m.revenueUsd], ['Paid to affiliates', m.paidUsd], ['Net', m.netUsd]] as const).map(([k, v]) => (
              <div key={k}><dt className="small muted">{k}</dt><dd className="num font-semibold text-lg" style={k === 'Net' ? { color: v < 0 ? 'var(--bad)' : 'var(--ok)' } : undefined}>{usd(v)}</dd></div>
            ))}
          </dl>
        </section>
      </aside>
    </div>
  );
}
