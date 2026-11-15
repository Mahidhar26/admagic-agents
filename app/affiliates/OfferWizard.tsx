'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '../Icon';

// Step-by-step offer builder (adapted from the AdMagic campaign wizard). Posts to /api/affiliates/offers.
const STEPS = ['Creative', 'Pay for', 'Timing and limits', 'Review'] as const;
const MODES = [
  { v: 'hold', t: 'Hold, then release', d: 'Earnings wait out a refund window, then pay automatically.' },
  { v: 'instant', t: 'Instant', d: 'Pay the affiliate the moment a result is verified.' },
  { v: 'batch', t: 'Batch', d: 'Collect earnings; you press Pay affiliates.' },
] as const;
const ORDER_USD = 49; // the demo store's price, used for the example

type Defaults = { name: string; creative: string; score: string; analysis: string };

export function OfferWizard({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!defaults.creative);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [f, setF] = useState({
    name: defaults.name || 'Validated ad', creativeUrl: defaults.creative, neuralScore: defaults.score, analysisId: defaults.analysis, landingUrl: '',
    cpcUsd: '0.10', cpaUsd: '5', revsharePct: '10', payoutMode: 'hold', holdMinutes: '2', dailyCapPerAffiliateUsd: '50', totalBudgetUsd: '500',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => Number(v) || 0;
  const example = 100 * n(f.cpcUsd) + 2 * (n(f.cpaUsd) + (ORDER_USD * n(f.revsharePct)) / 100);
  const canNext = step !== 0 || /^https?:\/\/.+/.test(f.creativeUrl);

  async function submit() {
    setBusy(true);
    const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
    const res = await fetch('/api/affiliates/offers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setMsg({ ok: res.ok, text: data.message ?? data.error ?? `Failed (${res.status})` });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ New offer</button>;

  return (
    <section className="card-flush mb-6" aria-label="New offer">
      <div className="card-head">
        <h2>New affiliate offer</h2>
        <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>
      <ol className="flex gap-1 px-4 pt-4" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}
              className="w-full flex-col items-start h-auto p-0 border-0 bg-transparent hover:bg-transparent gap-1.5 disabled:opacity-100">
              <span className="h-1 w-full rounded-full" style={{ background: i <= step ? 'var(--broker)' : 'var(--line)' }} />
              <span className="small" style={{ color: i === step ? 'var(--text)' : 'var(--faint)', fontWeight: i === step ? 600 : 400 }}>{i + 1}. {s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="p-4 min-h-[220px]">
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field sm:col-span-2">Offer name<input value={f.name} onChange={set('name')} required /></label>
              <label className="field sm:col-span-2">Creative URL<input type="url" value={f.creativeUrl} onChange={set('creativeUrl')} required placeholder="https://…" /></label>
              <label className="field">Neural Score <span className="hint">from the Validator</span><input inputMode="numeric" value={f.neuralScore} onChange={set('neuralScore')} /></label>
              <label className="field">Landing page <span className="hint">blank = demo store</span><input type="url" value={f.landingUrl} onChange={set('landingUrl')} placeholder="https://…" /></label>
            </div>
            <div className="rounded-lg overflow-hidden aspect-square grid place-items-center small muted" style={{ background: 'var(--surface-2)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.creativeUrl ? <img src={f.creativeUrl} alt="Creative preview" className="w-full h-full object-cover" /> : 'Preview'}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3 md:grid-cols-3">
            {([
              ['cpcUsd', 'Per qualified click', '$', 'A unique visitor who stays 5 s or more. Plain clicks earn nothing.'],
              ['cpaUsd', 'Per sale', '$', 'Confirmed by a signed webhook from your store.'],
              ['revsharePct', 'Revenue share', '%', 'Share of each order value, on top of the per-sale amount.'],
            ] as const).map(([k, t, unit, d]) => (
              <label key={k} className="rounded-lg p-3 grid gap-2 cursor-pointer" style={{ border: `1px solid ${n(f[k]) > 0 ? 'var(--broker)' : 'var(--line)'}`, background: n(f[k]) > 0 ? 'var(--broker-soft)' : undefined }}>
                <span className="font-semibold">{t}</span>
                <span className="small muted">{d}</span>
                <span className="flex items-center gap-2"><span className="muted">{unit}</span><input inputMode="decimal" value={f[k]} onChange={set(k)} aria-label={`${t} (${unit})`} /></span>
              </label>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Payout timing">
              {MODES.map((m) => (
                <label key={m.v} className="rounded-lg p-3 grid gap-1 cursor-pointer" style={{ border: `1px solid ${f.payoutMode === m.v ? 'var(--broker)' : 'var(--line)'}`, background: f.payoutMode === m.v ? 'var(--broker-soft)' : undefined }}>
                  <span className="flex items-center gap-2 font-semibold"><input type="radio" name="payoutMode" value={m.v} checked={f.payoutMode === m.v} onChange={set('payoutMode')} className="w-4 min-h-0 accent-[var(--broker)]" />{m.t}</span>
                  <span className="small muted">{m.d}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {f.payoutMode === 'hold' && <label className="field">Hold (minutes)<input inputMode="numeric" value={f.holdMinutes} onChange={set('holdMinutes')} /></label>}
              <label className="field">Daily cap per affiliate ($)<input inputMode="decimal" value={f.dailyCapPerAffiliateUsd} onChange={set('dailyCapPerAffiliateUsd')} /></label>
              <label className="field">Total budget ($)<input inputMode="decimal" value={f.totalBudgetUsd} onChange={set('totalBudgetUsd')} /></label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 md:grid-cols-2">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[13px]">
              <dt className="muted">Offer</dt><dd className="font-medium">{f.name}{f.neuralScore && <span className="badge b-ok plain ml-2">Score {f.neuralScore}</span>}</dd>
              <dt className="muted">Pays</dt><dd>${f.cpcUsd}/qualified click · ${f.cpaUsd}/sale · {f.revsharePct}% share</dd>
              <dt className="muted">Timing</dt><dd>{MODES.find((m) => m.v === f.payoutMode)!.t}{f.payoutMode === 'hold' && ` (${f.holdMinutes} min)`}</dd>
              <dt className="muted">Limits</dt><dd>${f.dailyCapPerAffiliateUsd}/day per affiliate · ${f.totalBudgetUsd} total</dd>
              <dt className="muted">Lands on</dt><dd className="truncate">{f.landingUrl || 'Demo store'}</dd>
            </dl>
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-2)' }}>
              <div className="small muted">Example</div>
              <p className="mt-1 text-[13px]">An affiliate who sends <b>100 qualified clicks</b> and <b>2 sales</b> of ${ORDER_USD} earns</p>
              <div className="text-2xl font-semibold num mt-1">${example.toFixed(2)}</div>
              <p className="small muted mt-1">Paid to their verified payout account, one receipt per payout.</p>
            </div>
          </div>
        )}
        {msg && <p role="status" className={`msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</p>}
      </div>

      <div className="flex justify-between gap-2 px-4 pb-4">
        <button type="button" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
        {step < STEPS.length - 1
          ? <button type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next <Icon name="arrow" size={14} /></button>
          : <button type="button" className="btn-primary" disabled={busy || msg?.ok} onClick={submit}><Icon name="check" size={14} /> {msg?.ok ? 'Created' : 'Create offer'}</button>}
      </div>
    </section>
  );
}
