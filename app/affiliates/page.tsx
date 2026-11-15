import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireAdminPage } from '@/lib/auth';
import { settle } from '@/lib/affiliates';
import { getStats } from '@/lib/stats';
import { ApiForm } from '../ApiForm';
import { Icon, type IconName } from '../Icon';
import { PageHead, ReceiptLink, Score, Status, pct, time, usd } from '../ui';
import { Countdown } from './Countdown';
import { OfferWizard } from './OfferWizard';

const TABS = ['offers', 'affiliates', 'performance', 'payouts'] as const;
const INTRO: Record<(typeof TABS)[number], string> = {
  offers: 'Turn a validated ad into an offer. Affiliates earn only for qualified clicks and signed sales.',
  affiliates: 'Creators, agencies and AI agents. Nobody is paid until their payout account is verified.',
  performance: 'What affiliates brought in, against what you paid them.',
  payouts: 'Every earning, from hold to paid, with its receipt.',
};
const TYPE_ICON: Record<string, IconName> = { creator: 'affiliates', agency: 'store', agent: 'bot' };

export default async function Affiliates({ searchParams }: PageProps<'/affiliates'>) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as never) ? (sp.tab as (typeof TABS)[number]) : 'offers';
  await settle(); // holds are released on every read

  return (
    <>
      <PageHead agent={tab === 'payouts' ? 'paymaster' : 'broker'} title={tab[0].toUpperCase() + tab.slice(1)}>{INTRO[tab]}</PageHead>
      <nav className="tabs" aria-label="Affiliate sections">
        {TABS.map((t) => (
          <Link key={t} href={`/affiliates?tab=${t}`} aria-current={t === tab ? 'page' : undefined}>{t[0].toUpperCase() + t.slice(1)}</Link>
        ))}
      </nav>
      {tab === 'offers' && <Offers sp={sp} />}
      {tab === 'affiliates' && <AffiliatesTab />}
      {tab === 'performance' && <Performance />}
      {tab === 'payouts' && <Payouts />}
    </>
  );
}

async function Offers({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const offers = await db.select().from(schema.affiliateOffers).orderBy(desc(schema.affiliateOffers.createdAt));
  const E = schema.affiliateEarnings;
  const spend = await db.select({ offerId: E.offerId, amountUsd: E.amountUsd, status: E.status }).from(E);
  const spent = (id: string) => spend.filter((s) => s.offerId === id && s.status !== 'clawed_back' && s.amountUsd > 0).reduce((a, s) => a + s.amountUsd, 0);
  const v = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');

  return (
    <>
      <OfferWizard defaults={{ name: v('name'), creative: v('creative'), score: v('score'), analysis: v('analysis') }} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-4">
        {offers.length === 0 && <div className="card muted text-center py-12 md:col-span-2 xl:col-span-3">No offers yet. Score an ad in the Validator, then turn it into an offer.</div>}
        {offers.map((o) => {
          const used = Math.min(1, spent(o.id) / (o.totalBudgetUsd || 1));
          return (
            <article key={o.id} className="card-flush flex flex-col">
              <div className="flex gap-3 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.creativeUrl} alt={`Creative for ${o.name}`} className="thumb w-16 h-16" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight truncate">{o.name}</h3>
                    <Status s={o.status} />
                  </div>
                  <div className="small muted mt-1">{o.payoutMode === 'hold' ? `Hold ${o.holdMinutes} min` : o.payoutMode === 'instant' ? 'Instant payout' : 'Batch payout'} · ${o.dailyCapPerAffiliateUsd}/day cap</div>
                </div>
                <Score value={o.neuralScore} />
              </div>
              <dl className="grid grid-cols-3 border-y text-center" style={{ borderColor: 'var(--line)' }}>
                {([['Per click', usd(o.cpcUsd)], ['Per sale', usd(o.cpaUsd)], ['Rev share', `${o.revsharePct}%`]] as const).map(([k, val]) => (
                  <div key={k} className="py-2.5 border-r last:border-r-0" style={{ borderColor: 'var(--line)' }}><dt className="small muted">{k}</dt><dd className="font-semibold num">{val}</dd></div>
                ))}
              </dl>
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div>
                  <div className="flex justify-between small"><span className="muted">Budget used</span><span className="num">{usd(spent(o.id))} / {usd(o.totalBudgetUsd)}</span></div>
                  <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${used * 100}%`, background: 'var(--accent)' }} /></div>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Link className="btn btn-sm flex-1" href={`/demo-store/${o.id}`}><Icon name="store" size={14} /> Demo store</Link>
                  <ApiForm action={`/api/affiliates/offers/${o.id}`} method="PATCH" className="flex-1 flex flex-wrap">
                    <input type="hidden" name="status" value={o.status === 'active' ? 'paused' : 'active'} />
                    <button type="submit" className="btn-sm w-full">{o.status === 'active' ? 'Pause' : 'Resume'}</button>
                  </ApiForm>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

async function AffiliatesTab() {
  const [affs, links, offers, earnings] = await Promise.all([
    db.select().from(schema.affiliates).orderBy(schema.affiliates.type),
    db.select().from(schema.affiliateLinks),
    db.select({ id: schema.affiliateOffers.id, name: schema.affiliateOffers.name }).from(schema.affiliateOffers),
    db.select().from(schema.affiliateEarnings),
  ]);
  const offerName = (id: string) => offers.find((o) => o.id === id)?.name ?? id;
  const earned = (id: string, status?: string) =>
    earnings.filter((e) => e.affiliateId === id && (status ? e.status === status : e.status !== 'clawed_back')).reduce((a, e) => a + e.amountUsd, 0);

  return (
    <>
      <div className="card-flush">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Affiliate</th><th>Payout account</th><th>Tracked links</th><th className="r">Earned</th><th className="r">Paid</th><th>Actions</th></tr></thead>
            <tbody>
              {affs.length === 0 && <tr className="empty-row"><td colSpan={6}>No affiliates yet. Invite one below.</td></tr>}
              {affs.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid place-items-center w-8 h-8 rounded-full shrink-0" style={{ background: a.type === 'agent' ? 'var(--accent-soft)' : 'var(--surface-2)', color: a.type === 'agent' ? 'var(--accent)' : 'var(--muted)' }}><Icon name={TYPE_ICON[a.type]} size={15} /></span>
                      <div><div className="font-medium">{a.displayName}</div><div className="small muted capitalize">{a.type === 'agent' ? 'AI agent · MCP' : a.type}</div></div>
                    </div>
                  </td>
                  <td>{a.verified ? <Status s="verified" /> : <span className="badge b-warn">Not verified</span>}<div className="small muted mt-1 mono">{a.qatomAccountId ?? '–'}</div></td>
                  <td className="small">{links.filter((l) => l.affiliateId === a.id).map((l) => <div key={l.id}><span className="muted">{offerName(l.offerId)}</span> <a href={`/r/${l.code}`} className="mono" style={{ color: 'var(--accent)' }}>/r/{l.code}</a></div>)}</td>
                  <td className="r font-semibold">{usd(earned(a.id))}</td>
                  <td className="r">{usd(earned(a.id, 'paid'))}</td>
                  <td>
                    <div className="grid gap-1.5 min-w-[220px]">
                      {!a.verified && (
                        <ApiForm action={`/api/affiliates/${a.id}/verify`} className="flex flex-wrap gap-1">
                          <input name="qatomAccountId" placeholder="Payout account" defaultValue={a.qatomAccountId ?? ''} aria-label="Payout account ID" className="flex-1 min-w-0" />
                          <button type="submit" className="btn-sm">Verify</button>
                        </ApiForm>
                      )}
                      <ApiForm action="/api/affiliates/links" className="flex flex-wrap gap-1">
                        <input type="hidden" name="affiliateId" value={a.id} />
                        <select name="offerId" aria-label="Offer" className="flex-1 min-w-0">{offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                        <button type="submit" className="btn-sm">New link</button>
                      </ApiForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="card section">
        <h2>Invite an affiliate</h2>
        <ApiForm action="/api/affiliates" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_1fr_1fr_auto] items-end">
          <label className="field">Name<input name="displayName" required /></label>
          <label className="field">Type
            <select name="type"><option value="creator">Creator / publisher</option><option value="agency">Agency / media buyer</option><option value="agent">AI agent</option></select>
          </label>
          <label className="field">Payout account ID<input name="qatomAccountId" /></label>
          <label className="field">Offer
            <select name="offerId"><option value="">None yet</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          <button type="submit" className="btn-primary">Invite</button>
        </ApiForm>
        <p className="small muted mt-3 flex gap-1.5"><Icon name="bot" size={14} /> AI agents connect over MCP with their own token from Control → Access, and can only see their own earnings.</p>
      </section>
    </>
  );
}

async function Performance() {
  const s = await getStats();
  const tiles: [string, string][] = [
    ['Clicks', String(s.clicks)], ['Qualified clicks', String(s.qualifiedClicks)], ['Conversions', String(s.conversions)],
    ['Conversion rate', pct(s.conversionRate)], ['Revenue', usd(s.revenueUsd)], ['Payouts', usd(s.payoutsUsd)],
    ['Return on payouts', s.returnOnPayouts == null ? '–' : `${s.returnOnPayouts.toFixed(1)}×`], ['New customers', String(s.newCustomers)],
  ];
  const max = Math.max(1, ...s.byDay.map((d) => d.clicks));
  return (
    <>
      <div className="kpis">
        {tiles.map(([k, val]) => <div key={k} className="kpi"><div className="kpi-label">{k}</div><div className="kpi-value">{val}</div></div>)}
      </div>
      <section className="card section">
        <div className="flex justify-between items-center mb-3">
          <h2 className="m-0">Clicks and conversions per day</h2>
          <div className="flex gap-3 small muted">
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--faint)' }} />Clicks</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--accent)' }} />Conversions</span>
          </div>
        </div>
        {s.byDay.length === 0 ? <p className="small muted py-8 text-center">No events yet.</p> : (
          <svg role="img" aria-label="Clicks and conversions per day" viewBox={`0 0 ${s.byDay.length * 60} 140`} className="w-full h-44">
            {s.byDay.map((d, i) => (
              <g key={d.day} transform={`translate(${i * 60 + 10},0)`}>
                <rect y={120 - (d.clicks / max) * 110} width="18" height={(d.clicks / max) * 110} rx="3" fill="var(--faint)"><title>{`${d.day}: ${d.clicks} clicks`}</title></rect>
                <rect x="20" y={120 - (d.conversions / max) * 110} width="18" height={(d.conversions / max) * 110} rx="3" fill="var(--accent)"><title>{`${d.day}: ${d.conversions} conversions`}</title></rect>
                <text y="135" fontSize="9" fill="var(--faint)">{d.day.slice(5)}</text>
              </g>
            ))}
          </svg>
        )}
      </section>
      <section className="card-flush section">
        <div className="card-head"><h2>Per affiliate</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Affiliate</th><th>Type</th><th className="r">Clicks</th><th className="r">Qualified</th><th className="r">Conversions</th><th className="r">Revenue</th></tr></thead>
            <tbody>
              {s.byAffiliate.length === 0 && <tr className="empty-row"><td colSpan={6}>No traffic yet.</td></tr>}
              {s.byAffiliate.map((a) => (
                <tr key={a.affiliateId}><td className="font-medium">{a.name}</td><td className="capitalize muted">{a.type}</td><td className="r">{a.clicks}</td><td className="r">{a.qualifiedClicks}</td><td className="r">{a.conversions}</td><td className="r font-semibold">{usd(a.revenueUsd)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

async function Payouts() {
  const E = schema.affiliateEarnings;
  const [rows, payouts, offers] = await Promise.all([
    db.select({ e: E, name: schema.affiliates.displayName, offer: schema.affiliateOffers.name })
      .from(E).innerJoin(schema.affiliates, eq(schema.affiliates.id, E.affiliateId)).innerJoin(schema.affiliateOffers, eq(schema.affiliateOffers.id, E.offerId))
      .orderBy(desc(E.createdAt)).limit(200),
    db.select().from(schema.affiliatePayouts),
    db.select().from(schema.affiliateOffers).where(eq(schema.affiliateOffers.payoutMode, 'batch')),
  ]);
  const receipt = (id: string | null) => payouts.find((p) => p.id === id);
  const total = (st: string) => rows.filter(({ e }) => e.status === st).reduce((a, { e }) => a + e.amountUsd, 0);

  return (
    <>
      <div className="kpis mb-4">
        {([['On hold', 'pending_hold'], ['Payable', 'payable'], ['Paid', 'paid'], ['Blocked for review', 'blocked']] as const).map(([k, st]) => (
          <div key={st} className="kpi"><div className="kpi-label"><Status s={st} /></div><div className="kpi-value">{usd(total(st))}</div><div className="kpi-sub">{k}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <ApiForm action="/api/affiliates/payouts/release"><button type="submit" className="btn-primary">Release due payouts</button></ApiForm>
        {offers.map((o) => (
          <ApiForm key={o.id} action="/api/affiliates/payouts/batch" confirm={`Pay all payable earnings for ${o.name}?`}>
            <input type="hidden" name="offerId" value={o.id} />
            <button type="submit">Pay affiliates: {o.name}</button>
          </ApiForm>
        ))}
      </div>
      <div className="card-flush">
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Affiliate</th><th>Offer</th><th>Kind</th><th className="r">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr className="empty-row"><td colSpan={7}>No earnings yet. Open a tracked link and buy in the demo store.</td></tr>}
              {rows.map(({ e, name, offer }) => {
                const p = receipt(e.payoutId);
                return (
                  <tr key={e.id}>
                    <td className="muted">{time(e.createdAt)}</td>
                    <td className="font-medium">{name}</td><td>{offer}</td>
                    <td><span className="badge plain uppercase">{e.kind}</span></td>
                    <td className="r font-semibold" style={e.amountUsd < 0 ? { color: 'var(--bad)' } : undefined}>{usd(e.amountUsd)}</td>
                    <td><Status s={e.status} />{e.status === 'pending_hold' && e.releaseAt && <div className="small muted mt-1"><Countdown to={e.releaseAt.toISOString()} /></div>}</td>
                    <td>
                      {e.status === 'blocked' && (
                        <div className="flex gap-1">
                          <ApiForm action={`/api/affiliates/earnings/${e.id}`}><input type="hidden" name="decision" value="approve" /><button type="submit" className="btn-sm">Approve</button></ApiForm>
                          <ApiForm action={`/api/affiliates/earnings/${e.id}`}><input type="hidden" name="decision" value="reject" /><button type="submit" className="btn-sm">Reject</button></ApiForm>
                        </div>
                      )}
                      {e.status === 'paid' && <ReceiptLink url={p?.receiptUrl} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
