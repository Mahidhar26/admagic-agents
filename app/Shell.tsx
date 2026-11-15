'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { AgentName } from '@/lib/agent';
import { AgentDot } from './agents';
import { Icon } from './Icon';

const NAV: { href: string; label: string; agent: AgentName; sub: string }[] = [
  { href: '/validator', label: 'Scout', agent: 'scout', sub: 'Scored ads' },
  { href: '/affiliates?tab=offers', label: 'Broker', agent: 'broker', sub: 'Offers' },
  { href: '/affiliates?tab=affiliates', label: 'Broker', agent: 'broker', sub: 'Affiliates' },
  { href: '/affiliates?tab=performance', label: 'Broker', agent: 'broker', sub: 'Performance' },
  { href: '/affiliates?tab=payouts', label: 'Paymaster', agent: 'paymaster', sub: 'Payouts' },
  { href: '/activity', label: 'Guard', agent: 'guard', sub: 'Limits and access' },
];

/** Brand pages get the sidebar; the demo store and sign-in are shown bare. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const tab = useSearchParams().get('tab') ?? 'offers';
  if (path === '/') return <>{children}</>; // the landing page brings its own header
  if (path.startsWith('/demo-store') || path === '/login') return <main className="flex-1 px-4 py-10">{children}</main>;

  const active = (href: string) => {
    const [p, q] = href.split('?');
    return q ? path === p && q === `tab=${tab}` : path === p;
  };
  const item = 'flex items-center gap-2.5 px-2 h-9 rounded-lg text-[13px] no-underline whitespace-nowrap transition-colors';
  const on = { background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600 };

  return (
    <div className="flex-1 md:grid md:grid-cols-[240px_1fr]">
      <aside className="md:sticky md:top-0 md:h-screen flex flex-col border-b md:border-b-0 md:border-r" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
        <Link href="/workspace" className="flex items-center gap-2.5 px-5 h-14 no-underline shrink-0">
          <span className="grid place-items-center w-7 h-7 rounded-lg font-bold text-[13px]" style={{ background: 'var(--text)', color: 'var(--bg)' }}>A</span>
          <span className="font-semibold tracking-tight">AdMagic</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>Agents</span>
        </Link>
        <nav aria-label="Main" className="flex md:flex-col gap-0.5 overflow-x-auto px-3 pb-3 md:pb-0 md:flex-1">
          <Link href="/workspace" aria-current={path === '/workspace' ? 'page' : undefined} className={item} style={path === '/workspace' ? on : { color: 'var(--muted)' }}>
            <span className="grid place-items-center w-[22px] h-[22px] rounded-md" style={{ background: 'var(--text)', color: 'var(--bg)' }}><Icon name="spark" size={12} /></span>
            Workspace
          </Link>
          <div className="hidden md:block px-2 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Agents</div>
          {NAV.map((n) => {
            const isOn = active(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={isOn ? 'page' : undefined} className={item} style={isOn ? on : { color: 'var(--muted)' }}>
                <AgentDot agent={n.agent} size={22} />
                <span><span style={{ color: isOn ? 'var(--text)' : undefined }}>{n.sub}</span><span className="hidden lg:inline text-[11px] ml-1.5" style={{ color: 'var(--faint)', fontWeight: 400 }}>{n.label}</span></span>
              </Link>
            );
          })}
        </nav>
        <Link href="/settings" aria-current={path === '/settings' ? 'page' : undefined} className={`${item} md:m-3 md:mt-0`} style={path === '/settings' ? on : { color: 'var(--muted)' }}>
          <span className="grid place-items-center w-[22px] h-[22px] rounded-md" style={{ background: 'var(--surface-2)' }}><Icon name="settings" size={13} /></span>
          Settings
        </Link>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8 max-w-[1280px] w-full">{children}</main>
    </div>
  );
}
