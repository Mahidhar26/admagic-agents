// End-to-end run against a running dev server (real database, mock Qatom). Prints one line per check.
// Run: npm run dev, then npm run e2e  (BASE=http://localhost:3000 by default). Adds test rows: an E2E offer, affiliate and tokens.
import { neon } from '@neondatabase/serverless';
import { createHmac } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const exp = String(Date.now() + 3600_000);
const ADMIN = `admin_session=${exp}.${createHmac('sha256', process.env.SESSION_SECRET).update(exp).digest('hex')}`;
const IMG = (n) => `https://images.unsplash.com/photo-${['1542291026-7eec264c27ff', '1523275335684-37898b6baf30', '1505740420928-5e560c06d30e', '1526170375885-4d8ecf77b99f'][n]}?w=${WIDTH}`;
const WIDTH = 400 + Math.floor(Math.random() * 800); // a new size per run means new bytes, so the cache doesn't hide the first payment
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  · ' + extra : ''}`); };

async function call(path, { method = 'GET', body, token, admin, headers = {}, raw } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { cookie: ADMIN } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

// ---- access ----
check('brand route without session is refused', (await call('/api/affiliates')).status === 401);
const code = (await call('/api/pair', { method: 'PUT', admin: true })).body.code;
check('pairing code issued', /^\d{6}$/.test(code ?? ''));
const pair = await call('/api/pair', { method: 'POST', body: { code } });
const ext = pair.body.token;
check('extension paired', pair.status === 200 && !!ext);
check('pairing code is single use', (await call('/api/pair', { method: 'POST', body: { code } })).status === 401);

// ---- validator ----
const b0 = (await call('/api/budget', { token: ext })).body;
const v1 = await call('/api/validate', { method: 'POST', token: ext, body: { creativeUrl: IMG(0), type: 'image' } });
check('validate pays and scores', v1.status === 200 && typeof v1.body.score === 'number' && !v1.body.cached && !!v1.body.receiptId, JSON.stringify({ s: v1.status, score: v1.body.score, err: v1.body.error }));
const v2 = await call('/api/validate', { method: 'POST', token: ext, body: { creativeUrl: IMG(0), type: 'image' } });
check('same creative again is cached, not paid', v2.status === 200 && v2.body.cached === true && v2.body.receiptId === v1.body.receiptId);
const b1 = (await call('/api/budget', { token: ext })).body;
check('spend went up by exactly $0.99', Math.abs(b1.spentTodayUsd - b0.spentTodayUsd - 0.99) < 0.001, `${b0.spentTodayUsd} → ${b1.spentTodayUsd}, limit ${b1.limitUsd}`);
check('SSRF guard: http / IP URLs refused', (await call('/api/validate', { method: 'POST', token: ext, body: { creativeUrl: 'https://127.0.0.1/x.png', type: 'image' } })).status === 502);

let c = await call('/api/compare', { method: 'POST', token: ext, body: { creativeUrls: [IMG(1), IMG(2), IMG(3)] } });
check('compare $2.99 waits for phone approval (202)', c.status === 202 && !!c.body.purchaseId, JSON.stringify(c.body));
for (let i = 0; c.status === 202 && i < 10; i++) { await sleep(1000); c = await call(`/api/purchase/${c.body.purchaseId ?? c.body.id}`, { token: ext }); }
check('compare completes with a winner', c.status === 200 && !!c.body.winnerUrl && c.body.ranking?.length === 3, JSON.stringify({ s: c.status, w: c.body.winnerUrl?.slice(-40), err: c.body.error }));
const rc = await call('/api/receipts?limit=10', { token: ext });
check('receipts list', rc.status === 200 && rc.body.length >= 2);

// ---- affiliates ----
const offer = await call('/api/affiliates/offers', { method: 'POST', admin: true, body: { name: 'E2E offer', creativeUrl: IMG(0), neuralScore: '58', cpcUsd: '0.10', cpaUsd: '5', revsharePct: '10', payoutMode: 'hold', holdMinutes: '0', dailyCapPerAffiliateUsd: '50', totalBudgetUsd: '500' } });
const offerId = offer.body.id;
const secret = offer.body.message?.match(/whsec_\w+/)?.[0];
check('offer created, secret shown once', offer.status === 201 && !!secret);
check('offer list hides the secret', !JSON.stringify((await call('/api/affiliates/offers', { admin: true })).body).includes('whsec_'));

const inv = await call('/api/affiliates', { method: 'POST', admin: true, body: { type: 'creator', displayName: 'E2E creator', qatomAccountId: 'qa_e2e', offerId } });
const affCode = inv.body.message?.match(/\/r\/([\w-]+)/)?.[1];
check('affiliate invited with tracked link', inv.status === 201 && !!affCode);
check('verify affiliate with Qatom', (await call(`/api/affiliates/${inv.body.id}/verify`, { method: 'POST', admin: true, body: {} })).body.verified === true);

const visitor = { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200)}`, 'user-agent': 'e2e-browser' };
const r = await call(`/r/${affCode}`, { headers: visitor });
check('tracked link logs click, sets cookie, redirects', r.status === 302 && r.headers.get('location')?.includes(`aff=${affCode}`) && r.headers.get('set-cookie')?.startsWith('aff='));
check('beacon before 5 s is not a qualified click', (await call('/api/affiliates/beacon', { method: 'POST', headers: visitor, body: { code: affCode, dwellMs: 9999 } })).body.reason === 'dwell_too_short');
await sleep(5200);
check('beacon after 5 s qualifies (CPC)', (await call('/api/affiliates/beacon', { method: 'POST', headers: visitor, body: { code: affCode, dwellMs: 5200 } })).body.ok === true);
check('second qualified click same day is deduped', (await call('/api/affiliates/beacon', { method: 'POST', headers: visitor, body: { code: affCode, dwellMs: 6000 } })).body.reason === 'click_dedupe');

const sign = (raw) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
const sale = JSON.stringify({ offer_id: offerId, order_id: `e2e_${Date.now()}`, order_value_usd: 49, aff_code: affCode, is_new_customer: true });
check('bad signature refused', (await call('/api/affiliates/webhooks/conversion', { method: 'POST', raw: sale, headers: { 'x-admagic-signature': 'sha256=bad' } })).status === 401);
const conv = await call('/api/affiliates/webhooks/conversion', { method: 'POST', raw: sale, headers: { 'x-admagic-signature': sign(sale) } });
check('signed sale → CPA $5 + revshare $4.90', conv.status === 200 && JSON.stringify(conv.body.earnings) === JSON.stringify([{ kind: 'cpa', amountUsd: 5, status: 'pending_hold' }, { kind: 'revshare', amountUsd: 4.9, status: 'pending_hold' }]), JSON.stringify(conv.body));
check('duplicate order ignored with 200', (await call('/api/affiliates/webhooks/conversion', { method: 'POST', raw: sale, headers: { 'x-admagic-signature': sign(sale) } })).body.duplicate === true);

await sleep(500);
let stats = await call(`/api/affiliates/stats?offer_id=${offerId}`, { admin: true }); // releases due holds and pays (mock: >$2 needs 3 s approval)
await sleep(3500);
stats = await call(`/api/affiliates/stats?offer_id=${offerId}`, { admin: true });
check('stats: 1 click, 1 qualified, 1 conversion, $49 revenue', stats.body.clicks === 1 && stats.body.qualifiedClicks === 1 && stats.body.conversions === 1 && stats.body.revenueUsd === 49, JSON.stringify({ c: stats.body.clicks, q: stats.body.qualifiedClicks, v: stats.body.conversions, rev: stats.body.revenueUsd }));
check('hold released and paid: $10.00 paid out', Math.abs(stats.body.payoutsUsd - 10) < 0.001, `payouts ${stats.body.payoutsUsd}`);

const refund = JSON.stringify({ offer_id: offerId, order_id: JSON.parse(sale).order_id });
check('refund after payout accepted', (await call('/api/affiliates/webhooks/refund', { method: 'POST', raw: refund, headers: { 'x-admagic-signature': sign(refund) } })).body.ok === true);

// ---- AI agent over MCP ----
const agents = (await call('/api/affiliates', { admin: true })).body.filter((a) => a.type === 'agent');
const at = await call('/api/tokens', { method: 'POST', admin: true, body: { name: 'E2E agent', affiliateId: agents[0].id } });
const agent = at.body.token;
check('agent token created', at.status === 201 && !!agent);
const mcp = async (name, args, tok = agent) => {
  const res = await fetch(`${BASE}/api/mcp/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${tok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  const t = await res.text();
  const j = JSON.parse(t.includes('data:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('') : t);
  return { status: res.status, data: j.result ? JSON.parse(j.result.content[0].text) : j };
};
const offers = await mcp('list_affiliate_offers', {});
check('MCP list_affiliate_offers', offers.status === 200 && offers.data.offers?.some((o) => o.offer_id === offerId), JSON.stringify(offers.data).slice(0, 160));
const link = await mcp('get_affiliate_link', { offer_id: offerId, qatom_account_id: agents[0].qatomAccountId });
check('MCP get_affiliate_link', !!link.data.url?.includes('/r/'), JSON.stringify(link.data));
check('MCP refuses another affiliate\'s account', !!(await mcp('get_affiliate_link', { offer_id: offerId, qatom_account_id: 'qa_e2e' })).data.error);
check('MCP get_affiliate_earnings', Array.isArray((await mcp('get_affiliate_earnings', { qatom_account_id: agents[0].qatomAccountId })).data.by_status));
check('MCP without token refused', (await mcp('list_affiliate_offers', {}, 'nope')).status === 401);
check('agent token cannot buy (missing scope → 403)', (await call('/api/validate', { method: 'POST', token: agent, body: { creativeUrl: IMG(0), type: 'image' } })).status === 403);

// ---- budget + revoke ----
// (left out: budget 402 is covered by unit tests; changing the limit would affect the user's own testing)
const tokens = await call('/api/budget', { token: ext });
check('budget readable by extension', tokens.status === 200);
check('extension cannot change the budget', (await call('/api/budget', { method: 'PUT', token: ext, body: { limitUsd: 999 } })).status === 401);

// revoke our own E2E extension token
const sql = neon(process.env.DATABASE_URL);
const [{ id: extId }] = await sql`select id from api_tokens where kind = 'extension' order by created_at desc limit 1`;
check('revoke extension token', (await call('/api/tokens', { method: 'DELETE', admin: true, body: { id: extId } })).status === 200);
const rv = await call('/api/validate', { method: 'POST', token: ext, body: { creativeUrl: IMG(0), type: 'image' } });
check('revoked token → 401 "Access revoked"', rv.status === 401 && rv.body.error === 'Access revoked');

const blocked = await sql`select reason, count(*)::int n from blocked_events group by reason order by reason`;
console.log('\nBlocked log:', blocked.map((b) => `${b.reason} ×${b.n}`).join(', '));
for (const p of ['/affiliates?tab=offers', '/affiliates?tab=affiliates', '/affiliates?tab=performance', '/affiliates?tab=payouts', '/activity', `/demo-store/${offerId}`, '/login']) {
  const res = await call(p, { admin: true });
  check(`page ${p} renders`, res.status === 200 && !String(res.body).includes('Application error'), String(res.status));
}
console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
process.exit(fails ? 1 : 0);
