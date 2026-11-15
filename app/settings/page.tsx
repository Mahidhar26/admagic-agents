import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth';
import { qatom, WALLETS } from '@/lib/qatom';
import { dailyLimit } from '@/lib/validator';
import { Icon } from '../Icon';
import { PageHead, usd } from '../ui';

// shortcut: Qatom is the only payment rail wired (lib/qatom.ts); others are listed as not connected until a client exists for them
const RAILS = [
  { id: 'qatom', name: 'Qatom', what: 'Agent wallets with spend limits, phone approval and a receipt per payment', connected: true },
  { id: 'stripe', name: 'Stripe', what: 'Cards and Connect payouts', connected: false },
  { id: 'usdc', name: 'USDC (x402)', what: 'Stablecoin pay-per-call', connected: false },
  { id: 'bank', name: 'Bank transfer', what: 'ACH / EFT payouts in batches', connected: false },
];

export default async function Settings() {
  await requireAdminPage();
  const [buyer, offer, limit] = await Promise.all([qatom.getWalletBalance(WALLETS.buyer), qatom.getWalletBalance(WALLETS.offer), dailyLimit()]);
  const mode = process.env.QATOM_MODE === 'live' ? 'Live' : 'Test mode';

  return (
    <>
      <PageHead eyebrow="Settings" title="Payments">How your agents pay for analyses and pay affiliates. Every payment uses the default method.</PageHead>

      <section className="card-flush" aria-labelledby="rails">
        <div className="card-head"><h2 id="rails">Payment method</h2></div>
        <ul>
          {RAILS.map((r) => (
            <li key={r.id} className="flex items-center gap-4 px-4 py-3.5 border-b last:border-b-0" style={{ borderColor: 'var(--line)', opacity: r.connected ? 1 : 0.7 }}>
              <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0" style={{ background: 'var(--surface-2)' }}><Icon name="wallet" size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.name}</span>{r.connected && <span className="badge b-ok plain">Default</span>}</div>
                <div className="small muted">{r.what}</div>
              </div>
              {r.connected ? <span className="badge b-ok">Connected · {mode}</span> : <span className="badge plain">Not connected</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 section md:grid-cols-2">
        <section className="card">
          <h2>Wallets</h2>
          <dl className="grid grid-cols-2 gap-3">
            <div><dt className="small muted">Pays for analyses</dt><dd className="num font-semibold text-lg">{usd(buyer.balanceUsd)}</dd></div>
            <div><dt className="small muted">Pays affiliates</dt><dd className="num font-semibold text-lg">{usd(offer.balanceUsd)}</dd></div>
          </dl>
          <p className="small muted mt-3">Wallet keys stay on the server. The extension and AI agents only hold scoped, revocable tokens.</p>
        </section>
        <section className="card">
          <h2>Limits</h2>
          <div className="num font-semibold text-lg">{usd(limit)} <span className="small muted font-normal">a day for analyses</span></div>
          <p className="small muted mt-1">Above the wallet’s own limit, each payment waits for your approval on your phone.</p>
          <Link href="/activity" className="btn btn-sm mt-3">Change limits and access <Icon name="arrow" size={12} /></Link>
        </section>
      </div>
    </>
  );
}
