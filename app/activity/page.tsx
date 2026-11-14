import { desc, eq, gte, and, count } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireAdminPage } from '@/lib/auth';
import { settle } from '@/lib/affiliates';
import { getStats } from '@/lib/stats';
import { dailyLimit, spentToday } from '@/lib/validator';
import { qatom, WALLETS } from '@/lib/qatom';
import { torontoMidnight } from '@/lib/rules';
import { ApiForm } from '../ApiForm';

const usd = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;
const time = (d: Date | null) => d?.toLocaleString('en-CA', { timeZone: 'America/Toronto' }) ?? '–';

export default async function Activity() {
  await requireAdminPage();
  await settle();
  const [spent, limit, buyer, offer, [{ analysesToday }], stats, analyses, purchases, payouts, blocked, tokens, agents] = await Promise.all([
    spentToday(), dailyLimit(), qatom.getWalletBalance(WALLETS.buyer), qatom.getWalletBalance(WALLETS.offer),
    db.select({ analysesToday: count() }).from(schema.analyses).where(gte(schema.analyses.createdAt, torontoMidnight())),
    getStats(),
    db.select().from(schema.analyses).orderBy(desc(schema.analyses.createdAt)).limit(30),
    db.select().from(schema.purchases).orderBy(desc(schema.purchases.createdAt)).limit(30),
    db.select({ p: schema.affiliatePayouts, name: schema.affiliates.displayName }).from(schema.affiliatePayouts)
      .innerJoin(schema.affiliates, eq(schema.affiliates.id, schema.affiliatePayouts.affiliateId)).orderBy(desc(schema.affiliatePayouts.createdAt)).limit(30),
    db.select().from(schema.blockedEvents).orderBy(desc(schema.blockedEvents.createdAt)).limit(50),
    db.select().from(schema.apiTokens).orderBy(desc(schema.apiTokens.createdAt)),
    db.select().from(schema.affiliates).where(and(eq(schema.affiliates.type, 'agent'))),
  ]);

  const payments = [
    ...purchases.map((p) => ({ at: p.createdAt, dir: `Buyer wallet → AdMagic (${p.item})`, amount: p.priceUsd, status: p.status, url: p.receiptUrl })),
    ...payouts.map(({ p, name }) => ({ at: p.createdAt, dir: `Offer wallet → ${name}`, amount: p.amountUsd, status: p.status, url: p.receiptUrl })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div>
      <h1>Activity</h1>

      <h2>Today</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card"><div className="text-xs opacity-70">Spend vs daily budget</div><div className="text-xl font-semibold">{usd(spent)} / {usd(limit)}</div>
          <ApiForm action="/api/budget" method="PUT" className="flex gap-1 mt-2 text-sm">
            <input name="limitUsd" inputMode="decimal" defaultValue={limit} aria-label="Daily limit in USD" className="w-20" /><button type="submit">Set</button>
          </ApiForm>
        </div>
        <div className="card"><div className="text-xs opacity-70">Wallets (buyer · offer)</div><div className="text-xl font-semibold">{usd(buyer.balanceUsd)} · {usd(offer.balanceUsd)}</div></div>
        <div className="card"><div className="text-xs opacity-70">Analyses today</div><div className="text-xl font-semibold">{analysesToday}</div></div>
        <div className="card"><div className="text-xs opacity-70">Affiliate revenue vs payouts</div><div className="text-xl font-semibold">{usd(stats.revenueUsd)} · {usd(stats.payoutsUsd)}</div></div>
      </div>

      <h2>Analyses</h2>
      <table>
        <thead><tr><th>Creative</th><th>Item</th><th>Score</th><th>Top insight</th><th>Price</th><th>Receipt</th></tr></thead>
        <tbody>{analyses.map((a) => {
          const r = a.result as { score?: number; insights?: string[]; winnerUrl?: string };
          return (
            <tr key={a.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <td><img src={a.creativeUrl.split(' ')[0]} alt="" className="w-12 h-12 object-cover rounded" /></td>
              <td>{a.item}</td><td>{r.score ?? '–'}</td><td>{r.insights?.[0] ?? (r.winnerUrl ? 'Winner picked' : '–')}</td>
              <td>{usd(a.priceUsd)}</td>
              <td>{a.receiptUrl ? <a className="underline" href={a.receiptUrl} target="_blank" rel="noreferrer">{a.receiptId}</a> : '–'}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <p className="text-xs opacity-70">Repeat validations of the same creative return the saved result and are not paid again.</p>

      <h2>Payments</h2>
      <table>
        <thead><tr><th>When</th><th>Flow</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead>
        <tbody>{payments.map((p, i) => (
          <tr key={i}><td>{time(p.at)}</td><td>{p.dir}</td><td>{usd(p.amount)}</td><td>{p.status === 'pending_approval' ? 'waiting for phone approval' : p.status}</td>
            <td>{p.url ? <a className="underline" href={p.url} target="_blank" rel="noreferrer">Receipt</a> : '–'}</td></tr>
        ))}</tbody>
      </table>

      <h2>Blocked</h2>
      <table>
        <thead><tr><th>When</th><th>Caller</th><th>Reason</th><th>Detail</th></tr></thead>
        <tbody>{blocked.map((b) => (
          <tr key={b.id}><td>{time(b.createdAt)}</td><td>{b.caller}</td><td>{b.reason}</td><td className="text-xs"><code>{b.detail ? JSON.stringify(b.detail) : ''}</code></td></tr>
        ))}</tbody>
      </table>

      <h2>Access</h2>
      <table>
        <thead><tr><th>Name</th><th>Kind</th><th>Scopes</th><th>Last used</th><th>Expires</th><th></th></tr></thead>
        <tbody>{tokens.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td><td>{t.kind}</td><td className="text-xs">{t.scopes.join(', ')}</td><td>{time(t.lastUsedAt)}</td><td>{time(t.expiresAt)}</td>
            <td>{t.revokedAt ? 'Revoked' : (
              <ApiForm action="/api/tokens" method="DELETE" confirm={`Revoke ${t.name}?`}><input type="hidden" name="id" value={t.id} /><button type="submit">Revoke</button></ApiForm>
            )}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="flex flex-wrap gap-6 mt-3">
        <ApiForm action="/api/pair" method="PUT"><button type="submit">Pair new extension</button></ApiForm>
        <ApiForm action="/api/tokens" className="flex gap-2 items-end text-sm">
          <label className="flex flex-col">Agent token name<input name="name" required defaultValue="Claude agent" /></label>
          <label className="flex flex-col">AI-agent affiliate
            <select name="affiliateId" required>{agents.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>
          </label>
          <button type="submit">Create agent token</button>
        </ApiForm>
      </div>
    </div>
  );
}
