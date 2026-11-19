// Wspólne narzędzia interfejsu: escapowanie, toasty, okna, QR, liczniki.
import { ROLES, FACTIONS } from '../worker/src/engine/roles.js';

export { ROLES, FACTIONS };

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = ms => new Promise(r => setTimeout(r, calm() ? Math.min(ms, 50) : ms));

export const roleName = id => (ROLES[id] ? ROLES[id].name : '');
export const roleFaction = id => (ROLES[id] ? ROLES[id].faction : '');
export const factionName = f => (FACTIONS[f] ? FACTIONS[f].name : '');
export const roleTag = id => id ? `<span class="tag ${roleFaction(id)}">${esc(roleName(id))}</span>` : '';

export const PHASES = {
  lobby: 'Lobby', deal: 'Rozdawanie ról', night: 'Noc', day: 'Dzień', vote: 'Głosowanie',
  verdict: 'Wyniki głosowania', elim: 'Eliminacja', avenger: 'Zemsta', end: 'Koniec gry',
};
export const MODES = { classic: 'Classic', chaos: 'Chaos', custom: 'Custom' };

// Wstawia HTML tylko, gdy się zmienił (żeby nie restartować animacji i nie gubić fokusu).
export function setHTML(el, html) {
  if (el.__html !== html) { el.__html = html; el.innerHTML = html; return true; }
  return false;
}

// ---------- toast ----------
let toastEl, toastT;
export function toast(msg, err) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.toggle('err', !!err);
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), err ? 4200 : 2600);
}

// ---------- okna ----------
export function modal(html, { onClose, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="panel ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  const prev = document.activeElement;
  const close = v => { wrap.remove(); document.removeEventListener('keydown', key); onClose && onClose(v); prev && prev.focus && prev.focus(); };
  const key = e => { if (e.key === 'Escape') close(null); };
  wrap.addEventListener('click', e => { if (e.target === wrap) close(null); const b = e.target.closest('[data-close]'); if (b) close(b.dataset.close); });
  document.addEventListener('keydown', key);
  document.body.append(wrap);
  const f = wrap.querySelector('[autofocus], .btn');
  f && f.focus();
  return { el: wrap, close };
}

export function ask(title, text, { ok = 'Tak', cancel = 'Anuluj', danger = false } = {}) {
  return new Promise(res => {
    modal(`<p class="eyebrow">Potwierdź</p><h2 class="h2" style="margin:10px 0">${esc(title)}</h2>${text ? `<p class="muted">${text}</p>` : ''}
      <div class="actions"><button class="btn ghost" data-close="">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : ''}" data-close="ok" autofocus>${esc(ok)}</button></div>`,
    { onClose: v => res(v === 'ok') });
  });
}

// ---------- QR ----------
export function qrSvg(text) {
  try {
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch { return ''; }
}

// ---------- licznik czasu ----------
// Elementy z [data-ends] (ms czasu serwera) albo [data-left] (zamrożone ms przy pauzie) odliczają same.
export function startClock(nowFn) {
  const fmt = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + pad(t % 60); };
  const step = () => {
    const now = nowFn();
    for (const el of document.querySelectorAll('[data-ends]')) {
      const ms = +el.dataset.ends - now;
      const txt = fmt(ms);
      if (el.textContent !== txt) el.textContent = txt;
      el.classList.toggle('low', ms > 0 && ms <= 10000);
    }
    for (const el of document.querySelectorAll('[data-left]')) {
      const txt = fmt(+el.dataset.left);
      if (el.textContent !== txt) el.textContent = txt;
    }
    for (const el of document.querySelectorAll('[data-bar-ends]')) {
      const total = +el.dataset.total, ms = Math.max(0, +el.dataset.barEnds - now);
      el.style.transform = `scaleX(${total ? Math.min(1, ms / total) : 0})`;
    }
  };
  setInterval(step, 250);
  return step;
}

export const timerHtml = (v, cls = 'timer') =>
  v.paused && v.remaining != null ? `<span class="${cls}" data-left="${v.remaining}"></span>`
    : v.endsAt ? `<span class="${cls}" data-ends="${v.endsAt}"></span>` : '';

export const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

export const ICONS = {
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
};
