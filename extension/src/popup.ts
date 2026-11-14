const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = (t: string) => { $('msg').textContent = t; };
const send = (m: object) => chrome.runtime.sendMessage(m) as Promise<{ status: number; body: Record<string, unknown> }>;
const usd = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

async function load() {
  const s = await chrome.storage.local.get(['backend', 'token', 'revoked', 'selected', 'adsFound']);
  $<HTMLInputElement>('backend').value = (s.backend as string) || 'http://localhost:3000';
  if (s.revoked) msg('Access revoked. Pair again with a new code.');
  $('noads').hidden = Number(s.adsFound ?? 0) > 0;

  const selected = (s.selected as string[] | undefined) ?? [];
  const btn = $<HTMLButtonElement>('compare');
  btn.disabled = selected.length < 2;
  btn.textContent = selected.length >= 2 ? `Compare ${selected.length} ads · $2.99 – needs phone approval` : 'Compare (select 2–5 ads)';
  if (!s.token) return;

  const b = await send({ type: 'get', path: '/api/budget' });
  if (b.status === 200) $('budget').textContent = `Today ${usd(b.body.spentTodayUsd)} of ${usd(b.body.limitUsd)} · wallet ${usd(b.body.walletBalanceUsd)}`;
  const r = await send({ type: 'get', path: '/api/receipts?limit=10' });
  if (r.status === 200) {
    $('receipts').replaceChildren(...(r.body as unknown as { item: string; priceUsd: number; status: string; receiptUrl?: string }[]).map((x) => {
      const li = document.createElement('li');
      li.textContent = `${x.item} ${usd(x.priceUsd)} · ${x.status} `;
      if (x.receiptUrl) { const a = document.createElement('a'); a.href = x.receiptUrl; a.target = '_blank'; a.textContent = 'receipt'; li.append(a); }
      return li;
    }));
  }
}

$('backend').addEventListener('change', async (e) => {
  const v = (e.target as HTMLInputElement).value.replace(/\/$/, '');
  await chrome.storage.local.set({ backend: v });
});

$('pair').addEventListener('click', async () => {
  const r = await send({ type: 'pair', code: $<HTMLInputElement>('code').value.trim() });
  msg(r.status === 200 ? 'Paired.' : String(r.body.error ?? 'Pairing failed'));
  load();
});

$('compare').addEventListener('click', async () => {
  const { selected = [] } = await chrome.storage.local.get('selected');
  msg('Paying $2.99, approve on your phone…');
  const r = await send({ type: 'compare', urls: selected });
  msg(r.status === 200 ? 'Winner highlighted on the page.' : String(r.body.error ?? 'Compare failed'));
  load();
});

$('validate').addEventListener('click', async () => {
  const url = $<HTMLInputElement>('paste').value.trim();
  if (!url) return;
  msg('Paying…');
  const r = await send({ type: 'validate', id: 'popup', url, kind: 'image' });
  msg(r.status === 200 ? '' : String(r.body.error ?? 'Failed'));
  if (r.status === 200) $('pasted').textContent = `Neural Score ${r.body.score} · ${((r.body.insights as string[]) ?? []).slice(0, 3).join(' · ')}`;
  load();
});

load();
