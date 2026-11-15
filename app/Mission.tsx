'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { RunEvent } from './api/agent/run/route';
import type { Analysis, Comparison } from '@/lib/admagic';
import { AGENTS, AgentDot, agentVars } from './agents';
import { Icon } from './Icon';
import { Score } from './ui';

type Step = Extract<RunEvent, { type: 'step' }>;
type Suggestion = { label: string; prompt: string };

/** The composer and the live run: what you ask, then each agent step as it really happens. */
export function Mission({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState('');
  const [asked, setAsked] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [analysis, setAnalysis] = useState<{ result: Analysis; imageUrl: string } | null>(null);
  const [compare, setCompare] = useState<Comparison | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  async function run(text = prompt) {
    if (!text.trim()) { setError('Tell the agents what to do first'); box.current?.focus(); return; }
    if (state === 'running') return;
    setError(''); setAsked(text.trim()); setSteps([]); setAnalysis(null); setCompare(null); setSummary(''); setState('running');
    try {
      const res = await fetch('/api/agent/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: text }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `The run couldn't start (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line) as RunEvent;
          if (e.type === 'step') setSteps((s) => s.some((x) => x.id === e.id) ? s.map((x) => (x.id === e.id ? e : x)) : [...s, e]);
          else if (e.type === 'analysis') setAnalysis({ result: e.result, imageUrl: e.imageUrl });
          else if (e.type === 'compare') setCompare(e.result);
          else if (e.type === 'end') setSummary(e.summary);
        }
      }
    } catch (e) {
      setSummary((e as Error).message);
    }
    setState('done');
    router.refresh(); // crew, guardrails and the activity feed pick up what just happened
  }

  return (
    <div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label htmlFor="ask" className="sr-only">Ask your agents</label>
        <textarea id="ask" ref={box} rows={2} value={prompt} placeholder="Paste an ad link to score it, or ask: launch an offer from my best ad"
          onChange={(e) => { setPrompt(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }} />
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="flex -space-x-1.5" aria-hidden="true">{(['scout', 'broker', 'paymaster', 'guard'] as const).map((a) => <AgentDot key={a} agent={a} size={22} />)}</span>
          <span className="small muted hidden sm:inline">4 agents ready</span>
          <span className="flex-1" />
          <span className="hidden sm:inline-flex items-center gap-1 small muted"><span className="kbd">Enter</span> to run</span>
          <button type="submit" className="btn-primary" disabled={state === 'running'} style={{ background: 'var(--text)', borderColor: 'var(--text)', color: 'var(--bg)', minHeight: 36, borderRadius: 10 }}>
            {state === 'running' ? <><span className="spin" aria-hidden="true" /> Running</> : <>Run <Icon name="send" size={14} /></>}
          </button>
        </div>
      </form>
      {error && <p role="alert" className="msg bad">{error}</p>}
      <div className="flex flex-wrap gap-2 mt-3" aria-label="Suggested tasks">
        {suggestions.map((s) => (
          <button key={s.label} type="button" className="chip" onClick={() => { setPrompt(s.prompt); run(s.prompt); }} disabled={state === 'running'}>
            <Icon name="spark" size={13} /> {s.label}
          </button>
        ))}
      </div>

      {state !== 'idle' && (
        <section className="card-flush mt-5" aria-live="polite" aria-busy={state === 'running'}>
          <div className="card-head">
            <div className="min-w-0">
              <div className="eyebrow">Run</div>
              <div className="font-medium truncate mt-0.5">{asked}</div>
            </div>
            <span className={`badge ${state === 'running' ? 'b-info' : steps.some((s) => s.status === 'failed') ? 'b-bad' : steps.some((s) => s.status === 'needs_you') ? 'b-warn' : 'b-ok'}`}>
              {state === 'running' ? 'Working…' : summary || 'Done'}
            </span>
          </div>
          <ol className="timeline px-4 py-2">
            {steps.map((s) => <StepRow key={s.id} s={s} />)}
          </ol>
          {analysis && <AnalysisResult a={analysis.result} img={analysis.imageUrl} />}
          {compare && <CompareResult c={compare} />}
        </section>
      )}
    </div>
  );
}

function StepRow({ s }: { s: Step }) {
  const a = AGENTS[s.agent];
  return (
    <li className="tl-step" style={agentVars(s.agent)}>
      <AgentDot agent={s.agent} />
      <div className="min-w-0">
        <div className="tl-title">{s.title}</div>
        <div className="small mt-0.5"><span className="agent-name">{a.name}</span>{s.ms != null && s.ms >= 100 && <span className="muted"> · {(s.ms / 1000).toFixed(1)}s</span>}</div>
        {s.detail && <div className="tl-detail" style={s.status === 'failed' ? { color: 'var(--bad)' } : undefined}>{s.detail}</div>}
        {(s.receiptUrl || (s.href && s.status === 'needs_you')) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {s.receiptUrl && <a href={s.receiptUrl} target="_blank" rel="noreferrer" className="badge b-ok plain"><Icon name="receipt" size={12} /> Receipt ↗</a>}
            {s.href && s.status === 'needs_you' && <Link href={s.href} className="btn btn-sm" style={{ borderColor: 'var(--a)', color: 'var(--a)' }}>Open <Icon name="arrow" size={12} /></Link>}
          </div>
        )}
      </div>
      <div className="pt-1.5" aria-label={s.status.replace('_', ' ')}>
        {s.status === 'running' && <span className="spin block" style={{ color: 'var(--a)' }} />}
        {s.status === 'done' && <span style={{ color: 'var(--ok)' }}><Icon name="check" /></span>}
        {s.status === 'needs_you' && <span className="badge b-warn plain">Needs you</span>}
        {s.status === 'failed' && <span style={{ color: 'var(--bad)' }}><Icon name="x" /></span>}
      </div>
    </li>
  );
}

function AnalysisResult({ a, img }: { a: Analysis; img: string }) {
  return (
    <div className="grid gap-4 p-4 border-t sm:grid-cols-[180px_1fr]" style={{ borderColor: 'var(--line)' }}>
      <div className="relative rounded-xl overflow-hidden aspect-square" style={{ background: 'var(--surface-2)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="Scored ad creative" className="w-full h-full object-cover" />
        {a.heatmap?.map((p, i) => (
          <span key={i} aria-hidden="true" className="absolute rounded-full" style={{
            left: `${(p.x - p.r) * 100}%`, top: `${(p.y - p.r) * 100}%`, width: `${p.r * 200}%`, aspectRatio: '1',
            background: `radial-gradient(circle, rgb(242 106 69 / ${0.7 * p.v}) 0%, rgb(250 204 21 / ${0.35 * p.v}) 45%, transparent 70%)`,
          }} />
        ))}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-3"><Score value={a.score} size={52} /><div><div className="font-semibold text-lg leading-tight">{a.verdict ?? 'Neural Score'}</div><div className="small muted">AdMagic neural analysis</div></div></div>
        <ul className="mt-3 space-y-1.5 text-[13.5px]">{a.insights.slice(0, 4).map((t) => <li key={t} className="flex gap-2"><span style={{ color: 'var(--scout)' }}>•</span>{t}</li>)}</ul>
        {a.dimensions && (
          <dl className="mt-3 grid gap-1.5 sm:grid-cols-2 sm:gap-x-6">
            {Object.entries(a.dimensions).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[72px_1fr_26px] items-center gap-2 small">
                <dt className="muted capitalize">{k}</dt>
                <dd className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${v}%`, background: 'var(--scout)' }} /></dd>
                <dd className="text-right num">{Math.round(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function CompareResult({ c }: { c: Comparison }) {
  return (
    <ol className="grid gap-3 p-4 border-t grid-cols-2 sm:grid-cols-5" style={{ borderColor: 'var(--line)' }}>
      {c.ranking.map((r, i) => (
        <li key={r.url} className="rounded-xl p-2" style={i === 0 ? { boxShadow: '0 0 0 2px var(--scout)', background: 'var(--scout-soft)' } : { background: 'var(--surface-2)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.url} alt={`Creative ranked ${i + 1}`} className="w-full aspect-square object-cover rounded-lg" />
          <div className="flex items-center justify-between mt-2"><span className="small font-semibold" style={i === 0 ? { color: 'var(--scout)' } : undefined}>{i === 0 ? 'Winner' : `#${i + 1}`}</span><Score value={r.score} size={32} /></div>
        </li>
      ))}
    </ol>
  );
}
