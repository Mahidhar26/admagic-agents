import { desc, eq, gte, count } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireAdminPage } from '@/lib/auth';
import { settle } from '@/lib/affiliates';
import { getStats } from '@/lib/stats';
import { recentPayments } from '@/lib/payments';
import { dailyLimit, spentToday } from '@/lib/validator';
import { qatom, WALLETS } from '@/lib/qatom';
import { torontoMidnight } from '@/lib/rules';
import { ApiForm } from '../ApiForm';
import { Icon } from '../Icon';
import { PageHead, ReceiptLink, Status, time, usd } from '../ui';

export default async function Control() {
  await requireAdminPage();
  await settle();
  const [spent, limit, buyer, offer, [{ analysesToday }], stats, payments, blocked, tokens, agents] = await Promise.all([
    spentToday(), dailyLimit(), qatom.getWalletBalance(WALLETS.buyer), qatom.getWalletBalance(WALLETS.offer),
    db.select({ analysesToday: count() }).from(schema.analyses).where(gte(schema.analyses.createdAt, torontoMidnight())),
    getStats(), recentPayments(40),
    db.select().from(schema.blockedEvents).orderBy(desc(schema.blockedEvents.createdAt)).limit(50),
    db.select().from(schema.apiTokens).orderBy(desc(schema.apiTokens.createdAt)),
    db.select().from(schema.affiliates).where(eq(schema.affiliates.type, 'agent')),
  ]);
  const used = Math.min(1, spent / (limit || 1));

  return (
    <>
      <PageHead agent="guard" title="Limits and access"
        actions={<a className="btn" href="/api/export" download><Icon name="download" /> Payments CSV</a>}>
        Spending limits, every payment in both directions, everything we refused, and who has access.
      </PageHead>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label"><Icon name="validator" size={14} />Spend vs daily budget</div>
          <div className="kpi-value">{usd(spent)} <span className="text-sm font-normal muted">/ {usd(limit)}</span></div>
          <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${used * 100}%`, background: used > 0.85 ? 'var(--bad)' : 'var(--accent)' }} /></div>
          <ApiForm action="/api/budget" method="PUT" className="flex flex-wrap gap-1.5 mt-3">
            <input name="limitUsd" inputMode="decimal" defaultValue={limit} aria-label="Daily limit in USD" className="flex-1 min-w-0" />
            <button type="submit" className="btn-sm">Set limit</button>
          </ApiForm>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="wallet" size={14} />Wallets</div>
          <div className="kpi-split mt-2 pt-0 border-0">
            <div>Buyer (pays AdMagic)<b className="text-xl">{usd(buyer.balanceUsd)}</b></div>
            <div>Offer (pays affiliates)<b className="text-xl">{usd(offer.balanceUsd)}</b></div>
          </div>
          <div className="kpi-sub mt-2">Payments over the wallet limit wait for phone approval.</div>
        </div>
        <div className="kpi"><div className="kpi-label"><Icon name="performance" size={14} />Analyses today</div><div className="kpi-value">{analysesToday}</div><div className="kpi-sub">Repeats are served from cache, $0</div></div>
        <div className="kpi"><div className="kpi-label"><Icon name="affiliates" size={14} />Affiliate revenue · payouts</div><div className="kpi-value">{usd(stats.revenueUsd)}</div><div className="kpi-sub">{usd(stats.payoutsUsd)} paid to affiliates</div></div>
      </div>

      <section className="card-flush section">
        <div className="card-head"><h2>Payments</h2><span className="small muted">Both flows, with receipts</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Flow</th><th>From → to</th><th className="r">Amount</th><th>Status</th><th>Receipt</th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr className="empty-row"><td colSpan={6}>No payments yet.</td></tr>}
              {payments.map((p, i) => (
                <tr key={i}>
                  <td className="muted">{time(p.at)}</td>
                  <td><span className={`badge plain ${p.flow === 'validation' ? 'b-info' : 'b-accent'}`}>{p.flow === 'validation' ? 'Validation' : 'Payout'}</span></td>
                  <td>{p.from} → <b className="font-medium">{p.to}</b></td>
                  <td className="r font-semibold">{usd(p.amountUsd)}</td>
                  <td><Status s={p.status} /></td>
                  <td><ReceiptLink url={p.receiptUrl} label={p.receiptId ?? 'Receipt'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-flush section">
        <div className="card-head"><h2>Blocked</h2><span className="badge b-bad">{blocked.length} refused</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Caller</th><th>Reason</th><th>Detail</th></tr></thead>
            <tbody>
              {blocked.length === 0 && <tr className="empty-row"><td colSpan={4}>Nothing blocked yet.</td></tr>}
              {blocked.map((b) => (
                <tr key={b.id}>
                  <td className="muted">{time(b.createdAt)}</td><td className="font-medium">{b.caller}</td>
                  <td><span className="badge b-bad">{b.reason}</span></td>
                  <td className="small"><code className="muted break-all">{b.detail ? JSON.stringify(b.detail) : ''}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-flush section">
        <div className="card-head"><h2>Access</h2><span className="small muted">Scoped tokens · expire in 7 days</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Kind</th><th>Scopes</th><th>Last used</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {tokens.length === 0 && <tr className="empty-row"><td colSpan={6}>No tokens yet. Pair the extension below.</td></tr>}
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium"><span className="inline-flex items-center gap-1.5"><Icon name={t.kind === 'agent' ? 'bot' : 'lock'} size={14} />{t.name}</span></td>
                  <td className="capitalize">{t.kind}</td>
                  <td><div className="flex flex-wrap gap-1">{t.scopes.map((s) => <code key={s} className="badge plain">{s}</code>)}</div></td>
                  <td className="muted">{time(t.lastUsedAt)}</td><td className="muted">{time(t.expiresAt)}</td>
                  <td>{t.revokedAt ? <Status s="revoked" /> : (
                    <ApiForm action="/api/tokens" method="DELETE" confirm={`Revoke ${t.name}?`}><input type="hidden" name="id" value={t.id} /><button type="submit" className="btn-sm" style={{ color: 'var(--bad)' }}>Revoke</button></ApiForm>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 p-4 border-t md:grid-cols-[auto_1fr] items-end" style={{ borderColor: 'var(--line)' }}>
          <ApiForm action="/api/pair" method="PUT" className="flex flex-wrap"><button type="submit" className="btn-primary"><Icon name="lock" size={14} /> Pair new extension</button></ApiForm>
          <ApiForm action="/api/tokens" className="flex flex-wrap gap-2 items-end">
            <label className="field flex-1 min-w-[160px]">Agent token name<input name="name" required defaultValue="Claude agent" /></label>
            <label className="field flex-1 min-w-[160px]">AI-agent affiliate
              <select name="affiliateId" required>{agents.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>
            </label>
            <button type="submit"><Icon name="bot" size={14} /> Create agent token</button>
          </ApiForm>
        </div>
      </section>
    </>
  );
}
