import Link from 'next/link';
import type { Metadata } from 'next';
import type { AgentName } from '@/lib/agent';
import { AGENTS, AgentDot, agentVars } from './agents';
import { Icon, type IconName } from './Icon';

export const metadata: Metadata = {
  title: 'AdMagic Agents · Score ads, pay for results',
  description: 'A crew of AI agents that scores your ads before you spend, launches affiliate offers from the winners, and pays only for verified results.',
};

const NAV = [['Agents', '#agents'], ['How it works', '#how'], ['Guardrails', '#guardrails'], ['For AI agents', '#mcp']] as const;

const CREW: { agent: AgentName; title: string; body: string; did: string }[] = [
  { agent: 'scout', title: 'Knows what will work', body: 'Scores any ad with neural analysis: attention, emotion, memory, language. Compare up to five and get a winner before you spend.', did: 'Scored “Summer runner” 82/100 · face holds attention' },
  { agent: 'broker', title: 'Turns winners into offers', body: 'Launches affiliate offers from your best creative with per-click, per-sale and revenue-share terms, caps and a budget.', did: 'Launched offer · $0.10/click, $5/sale, 10% share' },
  { agent: 'paymaster', title: 'Pays only for results', body: 'Counts a click after 5 seconds on page, a sale on a signed webhook. Holds for refunds, then pays with a receipt.', did: 'Paid Maya $10.00 · receipt attached' },
  { agent: 'guard', title: 'Keeps every dollar in bounds', body: 'Daily budgets, phone approval above the limit, scoped tokens you can revoke, and a log of everything it refused.', did: 'Refused a duplicate order webhook' },
];

const STEPS: { n: string; title: string; body: string; icon: IconName }[] = [
  { n: '01', title: 'Score', body: 'Paste an ad link or select ads in the Meta Ad Library. Scout buys one analysis, checks it against your budget, and remembers it so a repeat is free.', icon: 'scan' },
  { n: '02', title: 'Launch', body: 'Broker drafts an offer from the winner. You set the terms; creators, agencies and AI agents get tracked links.', icon: 'offers' },
  { n: '03', title: 'Pay', body: 'Verified clicks and sales become earnings. Paymaster releases them after the refund window and pays each affiliate with a receipt.', icon: 'wallet' },
];

const GUARDS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'control', title: 'Daily budget', body: 'Requests that would cross today’s limit are refused before any payment.' },
  { icon: 'hand', title: 'You approve big payments', body: 'Above the wallet’s limit, the payment waits for a tap on your phone.' },
  { icon: 'check', title: 'Never pays twice', body: 'Every creative is fingerprinted; a repeat score costs nothing.' },
  { icon: 'lock', title: 'Keys stay on the server', body: 'The extension and AI agents hold scoped tokens that expire and can be revoked.' },
  { icon: 'affiliates', title: 'Verified payees only', body: 'Affiliates are paid only to a verified payout account.' },
  { icon: 'receipt', title: 'A receipt for everything', body: 'Every payment, both directions, exportable for your books.' },
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap flex items-center gap-6 h-16">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <span className="grid place-items-center w-8 h-8 rounded-[9px] font-bold" style={{ background: 'var(--text)', color: 'var(--bg)' }}>A</span>
            <span className="font-semibold tracking-tight text-[15px] whitespace-nowrap">AdMagic Agents</span>
          </Link>
          <nav aria-label="Sections" className="hidden md:flex gap-6 text-[13.5px]" style={{ color: 'var(--muted)' }}>
            {NAV.map(([l, h]) => <a key={h} href={h} className="no-underline hover:text-[var(--text)]">{l}</a>)}
          </nav>
          <span className="flex-1" />
          <Link href="/login" className="btn btn-ghost">Log in</Link>
          <Link href="/login?mode=signup" className="btn btn-primary">Sign up</Link>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center">
            <div>
              <span className="lp-pill"><span className="live-dot" aria-hidden="true" /> Agentic ad operations</span>
              <h1 className="lp-h1">Agents that know which ads will work, and pay only for what does.</h1>
              <p className="lp-lead">AdMagic Agents scores your creative before you spend, launches affiliate offers from the winners, and pays creators, agencies and AI agents for verified clicks and sales. Every payment checked against your limits, every one with a receipt.</p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/login" className="btn btn-primary lp-cta">Try the live demo <Icon name="arrow" size={15} /></Link>
                <a href="#how" className="btn lp-cta">See how it works</a>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-8 small muted">
                {['Neural ad scoring', 'Verified clicks and sales', 'Receipt for every payment'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><span style={{ color: 'var(--ok)' }}><Icon name="check" size={14} /></span>{t}</li>
                ))}
              </ul>
            </div>
            <RunPreview />
          </div>
        </section>

        <section aria-label="How the rules work" className="lp-wrap">
          <dl className="lp-facts">
            {[['$0', 'for a creative scored before'], ['5 s', 'on page before a click counts'], ['1', 'receipt for every payment'], ['0', 'wallet keys on any device']].map(([v, k]) => (
              <div key={k}><dt className="sr-only">{k}</dt><dd><span className="lp-fact">{v}</span><span className="small muted">{k}</span></dd></div>
            ))}
          </dl>
        </section>

        <section id="agents" className="lp-section lp-wrap">
          <div className="lp-head">
            <span className="eyebrow">Your crew</span>
            <h2 className="lp-h2">Four agents, one job each.</h2>
            <p className="lp-sub">Give them a task in plain words. Each step they take shows up live, with who did it and what it cost.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {CREW.map((c) => (
              <article key={c.agent} className="lp-card" style={agentVars(c.agent)}>
                <div className="flex items-center gap-3">
                  <AgentDot agent={c.agent} size={38} />
                  <div><div className="agent-name">{AGENTS[c.agent].name}</div><div className="small muted">{AGENTS[c.agent].job}</div></div>
                </div>
                <h3 className="lp-h3">{c.title}</h3>
                <p className="muted">{c.body}</p>
                <div className="lp-did"><span className="spin-dot" aria-hidden="true" />{c.did}</div>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="lp-section lp-wrap">
          <div className="lp-head">
            <span className="eyebrow">How it works</span>
            <h2 className="lp-h2">From a hunch to a paid result, with proof at every step.</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="lp-step">
                <div className="flex items-center justify-between"><span className="lp-step-n">{s.n}</span><span className="muted"><Icon name={s.icon} size={20} /></span></div>
                <h3 className="lp-h3">{s.title}</h3>
                <p className="muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="guardrails" className="lp-ink">
          <div className="lp-wrap lp-section">
            <div className="lp-head">
              <span className="eyebrow" style={{ color: '#a8a29e' }}>Guardrails</span>
              <h2 className="lp-h2" style={{ color: '#fafaf9' }}>Autonomy, with a hand on the brake.</h2>
              <p className="lp-sub" style={{ color: '#a8a29e' }}>Agents move money only on the server, after checks, with a receipt. You decide how far they go.</p>
            </div>
            <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 lp-guard-grid">
              {GUARDS.map((g) => (
                <li key={g.title} className="lp-guard">
                  <span className="lp-guard-icon"><Icon name={g.icon} size={18} /></span>
                  <h3 className="font-semibold mt-4" style={{ color: '#fafaf9' }}>{g.title}</h3>
                  <p className="mt-1.5 text-[14px]" style={{ color: '#a8a29e' }}>{g.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="mcp" className="lp-section lp-wrap grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <span className="eyebrow">For AI agents</span>
            <h2 className="lp-h2">Your affiliates can be agents too.</h2>
            <p className="lp-sub">AI shopping and content agents connect over MCP with their own scoped token. They find offers, get tracked links and check their earnings, and they can’t see anyone else’s.</p>
            <ul className="grid gap-2 mt-6">
              {[['list_affiliate_offers', 'Live offers and their terms'], ['get_affiliate_link', 'A tracked link for one offer'], ['get_affiliate_earnings', 'Its own earnings, nothing else']].map(([t, d]) => (
                <li key={t} className="flex flex-wrap items-baseline gap-x-3"><code className="lp-code-inline">{t}</code><span className="small muted">{d}</span></li>
              ))}
            </ul>
          </div>
          <pre className="lp-code" aria-label="Example MCP client configuration"><code>{`{
  "admagic-affiliates": {
    "url": "https://<your-app>/api/mcp/mcp",
    "headers": {
      "Authorization": "Bearer <agent token>"
    }
  }
}`}</code></pre>
        </section>

        <section className="lp-wrap pb-24">
          <div className="lp-cta-band">
            <div>
              <h2 className="lp-h2 m-0">Watch your agents work.</h2>
              <p className="lp-sub mt-2">Sign in with the demo account and give them a task. No setup.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className="btn btn-primary lp-cta">Try the live demo <Icon name="arrow" size={15} /></Link>
              <Link href="/login?mode=signup" className="btn lp-cta">Create an account</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="lp-wrap flex flex-wrap items-center justify-between gap-4 py-8 small muted">
          <span>© {new Date().getFullYear()} AdMagic Agents</span>
          <span className="flex gap-5"><Link href="/login">Log in</Link><Link href="/login?mode=signup">Sign up</Link><a href="https://github.com/Mahidhar26/admagic-agents">GitHub</a></span>
        </div>
      </footer>
    </div>
  );
}

/** A still of a real run in the workspace: what you ask, then each agent step with its cost and receipt. */
function RunPreview() {
  const steps: { agent: AgentName; title: string; detail: string; tag?: string }[] = [
    { agent: 'guard', title: 'Checking today’s budget', detail: '$7.96 of $50.00 spent · this costs $0.99' },
    { agent: 'scout', title: 'Buying one analysis from AdMagic', detail: 'Paid $0.99', tag: 'Receipt' },
    { agent: 'scout', title: 'Neural analysis', detail: 'Neural Score 82/100 · Face in the first frame holds attention' },
    { agent: 'broker', title: 'Ready to become an affiliate offer', detail: 'Open the offer builder with this ad filled in.', tag: 'Needs you' },
  ];
  return (
    <div className="lp-preview" aria-label="Example of an agent run">
      <div className="lp-preview-bar"><i /><i /><i /><span className="small muted ml-2">Workspace</span></div>
      <div className="p-4 sm:p-5">
        <div className="composer" style={{ padding: '12px 12px 8px' }}>
          <div className="text-[14.5px]">Score this ad for traffic <span className="muted">https://…/summer-runner.jpg</span></div>
          <div className="flex items-center gap-2 pt-3">
            <span className="flex -space-x-1.5" aria-hidden="true">{(['scout', 'broker', 'paymaster', 'guard'] as const).map((a) => <AgentDot key={a} agent={a} size={20} />)}</span>
            <span className="flex-1" />
            <span className="btn-primary btn btn-sm" aria-hidden="true" style={{ borderRadius: 9 }}>Run <Icon name="send" size={12} /></span>
          </div>
        </div>
        <ol className="mt-3">
          {steps.map((s, i) => (
            <li key={i} className="tl-step lp-step-in" style={{ ...agentVars(s.agent), animationDelay: `${0.25 + i * 0.35}s` }}>
              <AgentDot agent={s.agent} />
              <div className="min-w-0">
                <div className="tl-title text-[13.5px]">{s.title}</div>
                <div className="tl-detail text-[12.5px]"><span className="agent-name">{AGENTS[s.agent].name}</span> · {s.detail}</div>
              </div>
              <div className="pt-1">
                {s.tag === 'Receipt' && <span className="badge b-ok plain"><Icon name="receipt" size={11} /> Receipt</span>}
                {s.tag === 'Needs you' && <span className="badge b-warn plain">Needs you</span>}
                {!s.tag && <span style={{ color: 'var(--ok)' }}><Icon name="check" /></span>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
