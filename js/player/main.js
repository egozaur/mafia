// Telefon gracza: sesja (token w localStorage), dołączanie, koperta, noc, głosowanie, zemsta, koniec.
import { Conn, LOCAL } from '../net.js';
import { $, ask, esc, setHTML, startClock, toast, vibrate } from '../ui.js';
import { roleHtml, sealedEnvelopeHtml, sealedHtml, waitTurnHtml } from './envelope.js';
import { codeHtml, joinHtml, waitHtml } from './join.js';
import { deadNightHtml, nightHtml } from './night.js';
import { avengerHtml, dayHtml, elimHtml, endHtml, verdictHtml, voteHtml } from './screens.js';

const app = $('#app');
const params = new URLSearchParams(location.search);
const code = (params.get('r') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
// Token sesji gracza. Lokalnie: sessionStorage (każda karta to inny gracz) + opcjonalny ?slot= do testów.
const slot = (params.get('slot') || '').replace(/[^0-9a-z]/gi, '').slice(0, 8);
const TOK = 'mafia_tok_' + code + (slot ? '_' + slot : '');
const tokStore = () => (LOCAL ? sessionStorage : localStorage);
let memTok = null;
const tokens = {
  get() { try { return tokStore().getItem(TOK) || memTok; } catch { return memTok; } },
  set(t) { memTok = t; try { t ? tokStore().setItem(TOK, t) : tokStore().removeItem(TOK); } catch {} },
};

let pendingRebind = (location.hash.match(/rb=([a-f0-9]{16,64})/) || [])[1] || null;
let conn = null, view = null, guest = null, status = 'connecting', msg = '', busy = false;
let revealMode = null;        // 'opening' przy pierwszym pokazaniu roli
let sel = [];                 // wybór dziennikarza (dwie osoby)
let aim = null;               // cel Mściciela
let lastPhaseKey = '';

const now = () => (conn ? conn.now() : Date.now());
const clock = startClock(now);

// ---------- nagłówek ----------
// W aplikacji PL3Y (ekran główny, pełny ekran) nie ma przycisku Wstecz, więc logo prowadzi do lobby.
const APP = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function head() {
  const me = view && view.me;
  const brand = '<span class="brand-mark" aria-hidden="true">P</span><span class="brand-name">MAFIA</span>';
  return `<header class="ph-head">
    ${APP ? `<button class="brand" data-act="home" style="background:none;border:0;padding:0;cursor:pointer" aria-label="Wróć do PL3Y">${brand}<span class="brand-name" style="opacity:.6"> ⌂</span></button>` : `<span class="brand">${brand}</span>`}
    <span class="grow me">${me ? `<b>${String(me.no).padStart(2, '0')}</b> · ${esc(me.name)}` : code ? `Pokój ${esc(code)}` : ''}</span>
  </header>`;
}

// ---------- ekran ----------
function screen() {
  if (!code) return codeHtml(msg);
  if (status === 'noroom') return codeHtml('Taki pokój nie istnieje albo wygasł.');
  if (status === 'revoked') {
    return `<div class="screen center"><p class="eyebrow">Sesja zamknięta</p><h1>Ten telefon został odłączony</h1>
      <p class="lead">Gospodarz usunął Cię z gry albo Twoje miejsce przejął inny telefon.</p>
      <div class="foot" style="width:100%"><button class="btn ghost block" data-act="rejoin">Połącz ponownie</button></div></div>`;
  }
  if (!view) {
    if (guest) return joinHtml(code, guest.joinable, msg, busy);
    return '<div class="screen center"><p class="eyebrow">Łączenie z pokojem…</p></div>';
  }
  const v = view;
  if (v.me.roleOpen && v.role) {
    if (!revealMode) revealMode = 'opening';
    return roleHtml(v, revealMode);
  }
  revealMode = null;
  if (v.me.canOpen) return sealedEnvelopeHtml(v, v.phase !== 'deal');
  switch (v.phase) {
    case 'lobby': return waitHtml(v);
    case 'deal': return v.me.ready ? sealedHtml(v) : waitTurnHtml(v);
    case 'night': return v.task ? nightHtml(v, sel) : v.me.alive ? sealedHtml(v, 'Noc trwa.') : deadNightHtml(v);
    case 'day': return dayHtml(v);
    case 'vote': return voteHtml(v);
    case 'verdict': return verdictHtml(v);
    case 'elim': return elimHtml(v);
    case 'avenger': return avengerHtml(v, aim);
    case 'end': return endHtml(v);
  }
  return '';
}

function render() {
  if (view) {
    const key = `${view.phase}:${view.round}:${view.vote && view.vote.runoff}`;
    if (key !== lastPhaseKey) {
      if (lastPhaseKey && view.phase !== 'lobby') vibrate(40);   // identycznie u wszystkich
      lastPhaseKey = key;
      sel = []; aim = null;
    }
  }
  if (!app.firstElementChild) app.innerHTML = '<div id="h"></div><div id="s" style="display:contents"></div>';
  setHTML($('#h'), head());
  setHTML($('#s'), screen());
  pauseVeil(view && view.paused);
  clock();
}

function pauseVeil(on) {
  let el = $('#pause');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'pause'; el.className = 'pause-veil';
    el.innerHTML = '<div><p class="eyebrow">Gra wstrzymana</p><h1 class="title" style="margin-top:10px">Pauza</h1><p class="muted">Gospodarz wstrzymał grę.</p></div>';
    document.body.append(el);
  } else if (!on && el) el.remove();
}

// ---------- połączenie ----------
function onMessage(m) {
  if (m.t === 'state') { view = m.view; guest = null; msg = ''; busy = false; render(); return; }
  if (m.t === 'welcome') {
    if (m.as === 'guest') {
      guest = { joinable: m.joinable };
      view = null;
      if (pendingRebind) conn.send({ t: 'rebind', code: pendingRebind });
    }
    render();
    return;
  }
  if (m.t === 'lobby') { if (guest) { guest.joinable = m.joinable; render(); } return; }
  if (m.t === 'token') {
    tokens.set(m.token);
    if (pendingRebind) { pendingRebind = null; history.replaceState(null, '', location.pathname + location.search); toast('Telefon przypisany do Twojego miejsca.'); }
    return;
  }
  if (m.t === 'error') {
    busy = false;
    if (m.code === 'badtoken') { tokens.set(null); view = null; }
    if (m.code === 'badrebind') { pendingRebind = null; history.replaceState(null, '', location.pathname + location.search); }
    msg = m.err || 'Błąd.';
    if (view) toast(msg, true);
    render();
  }
}

function onStatus(s) {
  status = s;
  const el = $('#net');
  el.classList.toggle('on', s === 'reconnecting');
  el.textContent = 'Brak połączenia · łączę ponownie';
  if (s === 'noroom' || s === 'revoked') { view = null; if (s === 'revoked') tokens.set(null); render(); }
}

async function act(action) {
  try { return await conn.act(action); }
  catch (e) { toast(e.message, true); return null; }
}

// ---------- zdarzenia ----------
const ACTIONS = {
  home: async () => { if (await ask('Wrócić do PL3Y?', 'Do gry wrócisz, skanując ponownie kod z ekranu.', { ok: 'Tak, wróć' })) location.href = '/'; },
  open: () => act({ a: 'open' }),
  memorized: () => act({ a: 'memorized' }),
  pick(el) {
    const t = view.task;
    if (!t) return;
    const id = el.dataset.id || null;
    if (t.kind === 'compare') {
      if (!id) { sel = []; act({ a: 'night', targets: null }); render(); return; }
      if (!sel.length && Array.isArray(t.choice)) sel = t.choice.slice();
      sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id].slice(-2);
      render();
      if (sel.length === 2) act({ a: 'night', targets: sel });
      return;
    }
    act({ a: 'night', target: id });
  },
  confirm() {
    const t = view.task;
    if (!t) return;
    if (t.kind === 'compare') act({ a: 'night', targets: sel.length === 2 ? sel : t.choice ?? null, confirm: true });
    else act({ a: 'night', target: t.choice ?? null, confirm: true });
  },
  vote: el => act({ a: 'vote', target: el.dataset.id }),
  aim: el => { aim = el.dataset.id; render(); },
  async shoot() {
    const p = view.players.find(q => q.id === aim);
    if (!p || !await ask(`Strzelić do ${String(p.no).padStart(2, '0')} ${p.name}?`, 'Tej decyzji nie można cofnąć.', { ok: 'Strzelam', danger: true })) return;
    act({ a: 'avenge', target: aim });
  },
  async noshoot() { if (await ask('Zrezygnować z zemsty?', '', { ok: 'Rezygnuję' })) act({ a: 'avenge', target: null }); },
  rejoin() { status = 'connecting'; conn.reconnectNow(); render(); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el);
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'code') {
    const c = String(new FormData(f).get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length === 5) location.search = '?r=' + c;
    else { msg = 'Kod ma 5 znaków.'; render(); }
  } else if (f.dataset.form === 'join') {
    const name = String(new FormData(f).get('name') || '').trim();
    if (name.length < 2) { msg = 'Pseudonim musi mieć co najmniej 2 znaki.'; render(); return; }
    busy = true; msg = ''; render();
    conn.send({ t: 'join', name });
  }
});

// Notatki widoczne tylko podczas przytrzymania (prywatność przy stole).
const showNotes = on => { const n = $('[data-notes]'); if (n) n.hidden = !on; };
document.addEventListener('pointerdown', e => { if (e.target.closest('[data-hold]')) { e.preventDefault(); showNotes(true); } });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) document.addEventListener(ev, () => showNotes(false), true);
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-hold]')) e.preventDefault(); });

let wake = null;
async function keepAwake() { try { if (!wake && navigator.wakeLock && !document.hidden) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch {} }
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('click', keepAwake, { once: true });

// ---------- start ----------
if (LOCAL) window.mafiaDebug = () => ({ view, status, guest });
if (code) {
  conn = new Conn({
    code,
    hello: () => ({ t: 'hello', token: tokens.get() || undefined }),
    onMessage,
    onStatus,
  });
}
render();
