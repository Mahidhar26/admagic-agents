import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireAdminPage } from '@/lib/auth';
import { settle } from '@/lib/affiliates';
import { getStats } from '@/lib/stats';
import { ApiForm } from '../ApiForm';
import { Countdown } from './Countdown';

const TABS = ['offers', 'affiliates', 'performance', 'payouts'] as const;
const usd = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;

export default async function Affiliates({ searchParams }: PageProps<'/affiliates'>) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as never) ? (sp.tab as (typeof TABS)[number]) : 'offers';
  await settle(); // holds are released on every read

  return (
    <div>
      <h1>Affiliates</h1>
      <nav className="flex gap-4 mb-6 text-sm" aria-label="Affiliate tabs">
        {TABS.map((t) => (
          <Link key={t} href={`/affiliates?tab=${t}`} aria-current={t === tab ? 'page' : undefined}
            className={t === tab ? 'font-semibold underline' : ''}>{t[0].toUpperCase() + t.slice(1)}</Link>
        ))}
      </nav>
      {tab === 'offers' && <Offers sp={sp} />}
      {tab === 'affiliates' && <AffiliatesTab />}
      {tab === 'performance' && <Performance />}
      {tab === 'payouts' && <Payouts />}
    </div>
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
      <table>
        <thead><tr><th>Creative</th><th>Offer</th><th>Score</th><th>Terms</th><th>Mode</th><th>Spend / budget</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {offers.map((o) => (
            <tr key={o.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <td><img src={o.creativeUrl} alt={`Creative for ${o.name}`} className="w-16 h-16 object-cover rounded" /></td>
              <td>{o.name}<div className="text-xs opacity-60">{o.id}</div></td>
              <td>{o.neuralScore ?? '–'}</td>
              <td>{usd(o.cpcUsd)}/click · {usd(o.cpaUsd)}/sale · {o.revsharePct}%</td>
              <td>{o.payoutMode}{o.payoutMode === 'hold' && ` ${o.holdMinutes} min`}</td>
              <td>{usd(spent(o.id))} / {usd(o.totalBudgetUsd)}</td>
              <td>{o.status}</td>
              <td className="space-y-1">
                <Link className="underline text-sm" href={`/demo-store/${o.id}`}>Demo store</Link>
                <ApiForm action={`/api/affiliates/offers/${o.id}`} method="PATCH">
                  <input type="hidden" name="status" value={o.status === 'active' ? 'paused' : 'active'} />
                  <button type="submit">{o.status === 'active' ? 'Pause' : 'Resume'}</button>
                </ApiForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>New offer</h2>
      <ApiForm action="/api/affiliates/offers" className="card grid grid-cols-2 gap-3 max-w-2xl text-sm">
        <label className="flex flex-col">Name<input name="name" required defaultValue={v('name') || 'Validated ad'} /></label>
        <label className="flex flex-col">Creative URL<input name="creativeUrl" type="url" required defaultValue={v('creative')} /></label>
        <label className="flex flex-col">Neural Score<input name="neuralScore" inputMode="numeric" defaultValue={v('score')} /></label>
        <input type="hidden" name="analysisId" value={v('analysis')} />
        <label className="flex flex-col">Landing URL (blank = demo store)<input name="landingUrl" type="url" /></label>
        <label className="flex flex-col">Per qualified click ($)<input name="cpcUsd" inputMode="decimal" defaultValue="0.10" /></label>
        <label className="flex flex-col">Per sale ($)<input name="cpaUsd" inputMode="decimal" defaultValue="5" /></label>
        <label className="flex flex-col">Revenue share (%)<input name="revsharePct" inputMode="decimal" defaultValue="10" /></label>
        <label className="flex flex-col">Payout timing
          <select name="payoutMode" defaultValue="hold"><option value="hold">Hold then release</option><option value="instant">Instant</option><option value="batch">Batch</option></select>
        </label>
        <label className="flex flex-col">Hold (minutes)<input name="holdMinutes" inputMode="numeric" defaultValue="2" /></label>
        <label className="flex flex-col">Daily cap per affiliate ($)<input name="dailyCapPerAffiliateUsd" inputMode="decimal" defaultValue="50" /></label>
        <label className="flex flex-col">Total budget ($)<input name="totalBudgetUsd" inputMode="decimal" defaultValue="500" /></label>
        <div className="col-span-2"><button type="submit">Create offer</button></div>
      </ApiForm>
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
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Qatom account</th><th>Links</th><th>Earned</th><th>Paid</th><th></th></tr></thead>
        <tbody>
          {affs.map((a) => (
            <tr key={a.id}>
              <td>{a.displayName}</td>
              <td>{a.type}</td>
              <td>{a.qatomAccountId ?? '–'} {a.verified ? '✓ verified' : '(not verified)'}</td>
              <td className="text-xs">{links.filter((l) => l.affiliateId === a.id).map((l) => <div key={l.id}>{offerName(l.offerId)}: <code>/r/{l.code}</code></div>)}</td>
              <td>{usd(earned(a.id))}</td>
              <td>{usd(earned(a.id, 'paid'))}</td>
              <td className="space-y-1">
                {!a.verified && (
                  <ApiForm action={`/api/affiliates/${a.id}/verify`} className="flex gap-1">
                    <input name="qatomAccountId" placeholder="Qatom account" defaultValue={a.qatomAccountId ?? ''} aria-label="Qatom account ID" className="w-32" />
                    <button type="submit">Verify</button>
                  </ApiForm>
                )}
                <ApiForm action="/api/affiliates/links" className="flex gap-1">
                  <input type="hidden" name="affiliateId" value={a.id} />
                  <select name="offerId" aria-label="Offer">{offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                  <button type="submit">Link</button>
                </ApiForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Invite</h2>
      <ApiForm action="/api/affiliates" className="card flex flex-wrap gap-3 items-end text-sm max-w-3xl">
        <label className="flex flex-col">Name<input name="displayName" required /></label>
        <label className="flex flex-col">Type
          <select name="type"><option value="creator">Creator / publisher</option><option value="agency">Agency / media buyer</option><option value="agent">AI agent</option></select>
        </label>
        <label className="flex flex-col">Qatom account ID<input name="qatomAccountId" /></label>
        <label className="flex flex-col">Offer
          <select name="offerId"><option value="">None yet</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
        <button type="submit">Invite</button>
      </ApiForm>
    </>
  );
}

async function Performance() {
  const s = await getStats();
  const tiles: [string, string][] = [
    ['Clicks', String(s.clicks)], ['Qualified clicks', String(s.qualifiedClicks)], ['Conversions', String(s.conversions)],
    ['Conversion rate', `${(s.conversionRate * 100).toFixed(1)}%`], ['Revenue', usd(s.revenueUsd)], ['Payouts', usd(s.payoutsUsd)],
    ['Return on payouts', s.returnOnPayouts == null ? '–' : `${s.returnOnPayouts.toFixed(1)}×`], ['New customers', String(s.newCustomers)],
  ];
  const max = Math.max(1, ...s.byDay.map((d) => d.clicks));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(([k, v]) => <div key={k} className="card"><div className="text-xs opacity-70">{k}</div><div className="text-xl font-semibold">{v}</div></div>)}
      </div>
      <h2>Clicks and conversions per day</h2>
      {s.byDay.length === 0 ? <p className="text-sm opacity-70">No events yet.</p> : (
        <svg role="img" aria-label="Clicks and conversions per day" viewBox={`0 0 ${s.byDay.length * 60} 140`} className="w-full max-w-2xl h-40">
          {s.byDay.map((d, i) => (
            <g key={d.day} transform={`translate(${i * 60 + 10},0)`}>
              <rect y={120 - (d.clicks / max) * 110} width="18" height={(d.clicks / max) * 110} fill="#9ca3af"><title>{`${d.day}: ${d.clicks} clicks`}</title></rect>
              <rect x="20" y={120 - (d.conversions / max) * 110} width="18" height={(d.conversions / max) * 110} fill="#16a34a"><title>{`${d.day}: ${d.conversions} conversions`}</title></rect>
              <text y="135" fontSize="9" fill="currentColor">{d.day.slice(5)}</text>
            </g>
          ))}
        </svg>
      )}
      <p className="text-xs opacity-70">Grey: clicks · Green: conversions</p>
      <h2>Per affiliate</h2>
      <table>
        <thead><tr><th>Affiliate</th><th>Type</th><th>Clicks</th><th>Qualified</th><th>Conversions</th><th>Revenue</th></tr></thead>
        <tbody>{s.byAffiliate.map((a) => (
          <tr key={a.affiliateId}><td>{a.name}</td><td>{a.type}</td><td>{a.clicks}</td><td>{a.qualifiedClicks}</td><td>{a.conversions}</td><td>{usd(a.revenueUsd)}</td></tr>
        ))}</tbody>
      </table>
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

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4">
        <ApiForm action="/api/affiliates/payouts/release"><button type="submit">Release due payouts</button></ApiForm>
        {offers.map((o) => (
          <ApiForm key={o.id} action="/api/affiliates/payouts/batch" confirm={`Pay all payable earnings for ${o.name}?`}>
            <input type="hidden" name="offerId" value={o.id} />
            <button type="submit">Pay affiliates: {o.name}</button>
          </ApiForm>
        ))}
      </div>
      <table>
        <thead><tr><th>When</th><th>Affiliate</th><th>Offer</th><th>Kind</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ e, name, offer }) => {
            const p = receipt(e.payoutId);
            return (
              <tr key={e.id}>
                <td>{e.createdAt.toLocaleTimeString('en-CA', { timeZone: 'America/Toronto' })}</td>
                <td>{name}</td><td>{offer}</td><td>{e.kind}</td><td>{usd(e.amountUsd)}</td>
                <td>{e.status}{e.status === 'pending_hold' && e.releaseAt && <> · <Countdown to={e.releaseAt.toISOString()} /></>}</td>
                <td>
                  {e.status === 'blocked' && (
                    <div className="flex gap-1">
                      <ApiForm action={`/api/affiliates/earnings/${e.id}`}><input type="hidden" name="decision" value="approve" /><button type="submit">Approve</button></ApiForm>
                      <ApiForm action={`/api/affiliates/earnings/${e.id}`}><input type="hidden" name="decision" value="reject" /><button type="submit">Reject</button></ApiForm>
                    </div>
                  )}
                  {e.status === 'paid' && p?.receiptUrl && <a className="underline" href={p.receiptUrl} target="_blank" rel="noreferrer">Receipt</a>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
