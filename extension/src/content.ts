// Runs on the Meta Ad Library. Adds Validate + Select to each visible ad creative. Never buys without a click.
type Result = { score?: number; verdict?: string; insights?: string[]; heatmap?: { x: number; y: number; r: number; v: number }[]; receiptUrl?: string; analysisId?: string; cached?: boolean; error?: string };

const MIN_SIZE = 150; // skips avatars, icons and hidden or zero-size elements
const cards = new Map<string, { media: HTMLImageElement | HTMLVideoElement; box: HTMLElement; url: string }>();
let n = 0;

// videos are scored by their poster frame: AdMagic has no video tool yet
const creativeUrl = (m: HTMLImageElement | HTMLVideoElement) => (m instanceof HTMLImageElement ? m.currentSrc || m.src : m.poster);

function scan() {
  document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video').forEach((media) => {
    if (media.dataset.admagic) return;
    const rect = media.getBoundingClientRect();
    const url = creativeUrl(media);
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE || !url.startsWith('https://') || getComputedStyle(media).visibility === 'hidden') return;
    const id = `am${++n}`;
    media.dataset.admagic = id;
    // Ad Library wraps creatives in a link that grabs clicks: put our controls beside the link, not inside it
    const box = (media.closest('a')?.parentElement ?? media.parentElement)!;
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    cards.set(id, { media, box, url });

    const bar = document.createElement('div');
    bar.className = 'admagic-bar';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Validate $0.99';
    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); validate(id); };
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => toggleSelect(url, cb.checked);
    label.append(cb, 'Select');
    bar.append(btn, label);
    box.append(bar);
  });
  chrome.storage.local.set({ adsFound: cards.size });
}

async function toggleSelect(url: string, on: boolean) {
  const { selected = [] } = await chrome.storage.local.get('selected');
  const next = (selected as string[]).filter((u) => u !== url);
  if (on) next.push(url);
  await chrome.storage.local.set({ selected: next.slice(-5) });
}

function panel(id: string) {
  const c = cards.get(id)!;
  let p = c.box.querySelector<HTMLDivElement>(':scope > .admagic-panel');
  if (!p) { p = document.createElement('div'); p.className = 'admagic-panel'; p.setAttribute('role', 'status'); c.box.append(p); }
  return p;
}

function show(id: string, r: Result) {
  const c = cards.get(id)!;
  const p = panel(id);
  p.replaceChildren();
  if (r.error) { p.textContent = r.error; return; }
  const score = document.createElement('div');
  score.className = 'score';
  score.textContent = `Neural Score ${r.score}${r.verdict ? ` · ${r.verdict}` : ''}`;
  const list = document.createElement('ul');
  for (const i of (r.insights ?? []).slice(0, 3)) { const li = document.createElement('li'); li.textContent = i; list.append(li); }
  const links = document.createElement('div');
  if (r.receiptUrl) { const a = document.createElement('a'); a.href = r.receiptUrl; a.target = '_blank'; a.textContent = r.cached ? 'Receipt (cached, $0)' : 'Receipt'; links.append(a, ' · '); }
  const offer = document.createElement('a');
  offer.href = '#';
  offer.textContent = 'Create offer';
  offer.onclick = (e) => { e.preventDefault(); chrome.runtime.sendMessage({ type: 'openOffer', url: c.url, score: r.score, analysisId: r.analysisId }); };
  links.append(offer);
  p.append(score, list, links);
  if (r.heatmap?.length) drawHeat(c, r.heatmap);
}

function drawHeat(c: { media: HTMLElement; box: HTMLElement }, points: NonNullable<Result['heatmap']>) {
  c.box.querySelector(':scope > .admagic-heat')?.remove();
  const canvas = document.createElement('canvas');
  canvas.className = 'admagic-heat';
  const m = c.media.getBoundingClientRect();
  const b = c.box.getBoundingClientRect();
  const { width, height } = m;
  canvas.width = width; canvas.height = height;
  Object.assign(canvas.style, { left: `${m.left - b.left}px`, top: `${m.top - b.top}px`, width: `${width}px`, height: `${height}px` });
  const ctx = canvas.getContext('2d')!;
  for (const pt of points) {
    const g = ctx.createRadialGradient(pt.x * width, pt.y * height, 0, pt.x * width, pt.y * height, pt.r * Math.max(width, height));
    g.addColorStop(0, `rgba(255,0,0,${0.55 * pt.v})`);
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  c.box.append(canvas);
}

async function validate(id: string) {
  const c = cards.get(id)!;
  panel(id).textContent = 'Paying…';
  const r = await chrome.runtime.sendMessage({ type: 'validate', id, url: c.url, kind: 'image' });
  show(id, r.status === 200 ? r.body : { error: r.status === 401 ? 'Access revoked: pair again in the popup' : r.body?.error ?? 'Failed' });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status' && cards.has(msg.id)) panel(msg.id).textContent = msg.status;
});

// Highlight the Compare winner when the popup's Compare finishes.
chrome.storage.onChanged.addListener((ch) => {
  const winner = (ch.compare?.newValue as { winnerUrl?: string } | undefined)?.winnerUrl;
  if (!winner) return;
  for (const c of cards.values()) c.box.classList.toggle('admagic-winner', c.url === winner);
  document.querySelectorAll<HTMLInputElement>('.admagic-bar input[type=checkbox]').forEach((cb) => { cb.checked = false; });
});

// Show saved results without paying again.
async function restore() {
  const { results = {} } = await chrome.storage.local.get('results');
  for (const [id, c] of cards) {
    const r = (results as Record<string, Result>)[c.url];
    if (r && !c.box.querySelector(':scope > .admagic-panel')) show(id, r);
  }
}

let timer: number | undefined;
const later = () => { clearTimeout(timer); timer = window.setTimeout(() => { scan(); restore(); }, 300); };
new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'poster'] });
document.addEventListener('load', later, true); // images that finish loading after they were added
scan();
restore();
