import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { isAdmin, requireAdminPage } from '@/lib/auth';
import { runPaid, dailyLimit, spentToday } from '@/lib/validator';
import type { Analysis, Comparison } from '@/lib/admagic';
import { ITEMS } from '@/lib/qatom';
import { Icon } from '../Icon';
import { PageHead, ReceiptLink, Score, usd, time } from '../ui';

export const maxDuration = 60;

const OBJECTIVES = ['engagement', 'awareness', 'traffic', 'promotional', 'leads', 'cta'] as const;
const Form = z.object({ url: z.url(), objective: z.enum(OBJECTIVES) });

/** Same paid path as the extension (cache → budget → pay → AdMagic), called by the signed-in brand. */
async function validate(form: FormData) {
  'use server';
  if (!(await isAdmin())) redirect('/login');
  const parsed = Form.safeParse({ url: form.get('url'), objective: form.get('objective') });
  if (!parsed.success) redirect(`/validator?msg=${encodeURIComponent('Enter a public https link to an image or an ad page')}`);
  let msg: string;
  try {
    const r = await runPaid('image', { urls: [parsed.data.url], type: 'image', objective: parsed.data.objective }, 'web');
    const b = r.body as { cached?: boolean; status?: string; score?: number; error?: string };
    msg = r.status === 202 ? 'Waiting for your approval on your phone. Submit again once approved; you will not be charged twice.'
      : b.error ? b.error
      : b.cached ? `Already scored (${b.score}/100). Shown from cache, $0 charged.`
      : `Scored ${b.score}/100 · ${usd(ITEMS.image.priceUsd)} paid.`;
  } catch (e) {
    msg = (e as Error).message;
  }
  redirect(`/validator?msg=${encodeURIComponent(msg)}`);
}

type Row = typeof schema.analyses.$inferSelect;

export default async function Validator({ searchParams }: PageProps<'/validator'>) {
  await requireAdminPage();
  const { msg } = await searchParams;
  const [rows, spent, limit] = await Promise.all([
    db.select().from(schema.analyses).orderBy(desc(schema.analyses.createdAt)).limit(24), spentToday(), dailyLimit(),
  ]);
  const used = Math.min(1, spent / (limit || 1));
  const compares = rows.filter((a) => a.item === 'compare');
  const singles = rows.filter((a) => a.item !== 'compare');

  return (
    <>
      <PageHead agent="scout" title="Scored ads">
        Score any ad with AdMagic&apos;s neural analysis before you put money behind it. Each new creative costs {usd(ITEMS.image.priceUsd)}; a creative scored before is free.
      </PageHead>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <form action={validate} className="card grid gap-3 sm:grid-cols-[1fr_170px_auto] items-end">
          <label className="field">Ad image or ad page link
            <input name="url" type="url" required placeholder="https://… (Meta Ad Library image, product page)" />
          </label>
          <label className="field">Objective
            <select name="objective" defaultValue="engagement">{OBJECTIVES.map((o) => <option key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</option>)}</select>
          </label>
          <button type="submit" className="btn-primary">Score · {usd(ITEMS.image.priceUsd)}</button>
          {typeof msg === 'string' && <p role="status" className="msg ok sm:col-span-3" style={/^(Scored|Already|Waiting)/.test(msg) ? undefined : { background: 'var(--bad-soft)', color: 'var(--bad)' }}>{msg}</p>}
          <p className="small muted sm:col-span-3">Or use the Chrome extension: <b>Validate</b> on any ad in the Meta Ad Library, or select 2–5 ads to <b>Compare</b> for {usd(ITEMS.compare.priceUsd)}.</p>
        </form>
        <div className="card">
          <div className="flex justify-between items-baseline"><h2 className="m-0">Today&apos;s budget</h2><span className="small muted">Toronto day</span></div>
          <div className="text-2xl font-semibold num mt-2">{usd(spent)} <span className="text-sm font-normal muted">of {usd(limit)}</span></div>
          <div className="h-2 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--surface-2)' }} role="progressbar" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Share of today's budget spent">
            <div className="h-full rounded-full" style={{ width: `${used * 100}%`, background: used > 0.85 ? 'var(--bad)' : 'var(--accent)' }} />
          </div>
          <p className="small muted mt-2">Calls past the limit are refused before paying and logged in <Link href="/activity" className="underline">Control</Link>.</p>
        </div>
      </div>

      {rows.length === 0 && <div className="card text-center muted py-12 section">No ads scored yet. Paste a link above or click Validate in the extension.</div>}
      {compares.length > 0 && <>
        <h2 className="section">Comparisons</h2>
        <div className="grid gap-4 xl:grid-cols-2">{compares.map((a) => <CompareCard key={a.id} a={a} />)}</div>
      </>}
      {singles.length > 0 && <>
        <h2 className="section">Single ads</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{singles.map((a) => <AnalysisCard key={a.id} a={a} />)}</div>
      </>}
    </>
  );
}

function Meta({ a }: { a: Row }) {
  return (
    <div className="flex items-center justify-between gap-2 small pt-3 mt-3 border-t" style={{ borderColor: 'var(--line)' }}>
      <span className="muted">{time(a.createdAt)} · {usd(a.priceUsd)}</span>
      <ReceiptLink url={a.receiptUrl} />
    </div>
  );
}

function AnalysisCard({ a }: { a: Row }) {
  const r = a.result as Analysis;
  const offer = new URLSearchParams({ tab: 'offers', creative: a.creativeUrl, score: String(r.score), analysis: a.id, name: r.verdict ?? 'Validated ad' });
  const dims = Object.entries(r.dimensions ?? {});
  return (
    <article className="card-flush flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.creativeUrl} alt="Scored ad creative" className="w-full h-full object-cover" />
        {r.heatmap?.map((p, i) => (
          <span key={i} aria-hidden="true" className="absolute rounded-full pointer-events-none" style={{
            left: `${(p.x - p.r) * 100}%`, top: `${(p.y - p.r) * 100}%`, width: `${p.r * 200}%`, aspectRatio: '1',
            background: `radial-gradient(circle, rgb(242 106 69 / ${0.75 * p.v}) 0%, rgb(250 204 21 / ${0.4 * p.v}) 45%, transparent 70%)`,
          }} />
        ))}
        {a.item === 'video' && <span className="badge plain absolute top-2 left-2" style={{ background: '#000a', color: '#fff' }}>Video</span>}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-3">
          <Score value={r.score} size={48} />
          <div className="min-w-0">
            <div className="font-semibold leading-tight">{r.verdict ?? (r.score >= 70 ? 'Ready to run' : r.score >= 50 ? 'Worth a fix' : 'Rework first')}</div>
            <div className="small muted">Neural Score</div>
          </div>
        </div>
        {r.insights?.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {r.insights.slice(0, 3).map((t) => <li key={t} className="flex gap-2"><span style={{ color: 'var(--accent)' }}>•</span>{t}</li>)}
          </ul>
        )}
        {dims.length > 0 && (
          <dl className="mt-3 grid gap-1.5">
            {dims.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[80px_1fr_28px] items-center gap-2 small">
                <dt className="muted capitalize">{k}</dt>
                <dd className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${v}%`, background: 'var(--accent)' }} /></dd>
                <dd className="text-right num">{Math.round(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto">
          <Meta a={a} />
          <Link href={`/affiliates?${offer}`} className="btn w-full mt-3"><Icon name="offers" size={14} /> Create affiliate offer</Link>
        </div>
      </div>
    </article>
  );
}

function CompareCard({ a }: { a: Row }) {
  const r = a.result as Comparison;
  return (
    <article className="card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div><span className="badge b-accent plain">Compare</span> <span className="font-semibold ml-1">{r.ranking.length} creatives ranked</span></div>
      </div>
      <ol className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        {r.ranking.map((c, i) => (
          <li key={c.url} className="rounded-lg p-2" style={i === 0 ? { boxShadow: '0 0 0 2px var(--accent)', background: 'var(--accent-soft)' } : { background: 'var(--surface-2)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.url} alt={`Creative ranked ${i + 1}`} className="w-full aspect-square object-cover rounded-md" />
            <div className="flex items-center justify-between mt-2">
              <span className="small font-semibold" style={i === 0 ? { color: 'var(--accent)' } : undefined}>{i === 0 ? 'Winner' : `#${i + 1}`}</span>
              <Score value={c.score} size={34} />
            </div>
          </li>
        ))}
      </ol>
      <Meta a={a} />
    </article>
  );
}
