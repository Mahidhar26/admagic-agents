// All backend calls go through here; the page and popup never hold the token in their own code.
const DEFAULT_BACKEND = 'http://localhost:3000';

async function settings() {
  const s = await chrome.storage.local.get(['backend', 'token']);
  return { backend: (s.backend as string) || DEFAULT_BACKEND, token: s.token as string | undefined };
}

async function api(path: string, init: RequestInit = {}) {
  const { backend, token } = await settings();
  const res = await fetch(backend + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) await chrome.storage.local.set({ revoked: false });
  else if (res.status === 401 && token) await chrome.storage.local.set({ revoked: true });
  return { status: res.status, body };
}

/** Pays (once) and waits through phone approval, reporting each step. */
async function paid(path: string, payload: object, report: (s: string) => void) {
  report('Paying…');
  let r = await api(path, { method: 'POST', body: JSON.stringify(payload) });
  for (let i = 0; r.status === 202 && i < 60; i++) {
    report('Waiting for phone approval…');
    await new Promise((ok) => setTimeout(ok, 1500));
    r = await api(`/api/purchase/${r.body.purchaseId}`);
  }
  if (r.status === 200) report('Analyzing… done');
  return r;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab?.id;
  const report = (status: string) => tabId && chrome.tabs.sendMessage(tabId, { type: 'status', id: msg.id, status }).catch(() => {});

  if (msg.type === 'validate') {
    paid('/api/validate', { creativeUrl: msg.url, type: msg.kind }, report).then(async (r) => {
      if (r.status === 200) {
        const { results = {} } = await chrome.storage.local.get('results');
        await chrome.storage.local.set({ results: { ...(results as object), [msg.url]: r.body } });
      }
      reply(r);
    });
    return true;
  }
  if (msg.type === 'compare') {
    paid('/api/compare', { creativeUrls: msg.urls }, () => {}).then(async (r) => {
      if (r.status === 200) await chrome.storage.local.set({ compare: r.body, selected: [] });
      reply(r);
    });
    return true;
  }
  if (msg.type === 'pair') {
    api('/api/pair', { method: 'POST', body: JSON.stringify({ code: msg.code }) }).then(async (r) => {
      if (r.status === 200) await chrome.storage.local.set({ token: r.body.token, revoked: false });
      reply(r);
    });
    return true;
  }
  if (msg.type === 'get') {
    api(msg.path).then(reply); // read-only calls from the popup: budget, receipts
    return true;
  }
  if (msg.type === 'openOffer') {
    settings().then(({ backend }) => {
      const q = new URLSearchParams({ tab: 'offers', creative: msg.url, score: String(msg.score ?? ''), analysis: msg.analysisId ?? '' });
      chrome.tabs.create({ url: `${backend}/affiliates?${q}` });
    });
  }
});
