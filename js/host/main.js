// Ekran główny Mafii: połączenie gospodarza, renderowanie regionów, akcje.
import { BASE_URL } from '../config.js';
import { Conn, createRoom, LOCAL } from '../net.js';
import { $, ask, calm, esc, ICONS, modal, pad, qrSvg, setHTML, startClock, toast } from '../ui.js';
import { boardHtml, topbarHtml, who } from './board.js';
import { joinHtml, lobbySkeleton, rosterHtml, wizardHtml } from './lobby.js';
import { stageHtml } from './phases.js';
import { endHtml } from './results.js';
import { plannedRoles, rolesSummary, wizardPatch } from './wizard.js';

const KEY = 'mafia_host';
const app = $('#app');
let conn = null, view = null, layout = '', lastPhase = null, lastRound = 0;
const seenRoster = new Set();
let rebindModal = null;

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} },
};
const base = () => (LOCAL ? new URL('./', location.href).href : BASE_URL);
const joinUrl = code => `${base()}play.html?r=${code}`;
const now = () => (conn ? conn.now() : Date.now());
const clock = startClock(now);

// ---------- ekran startowy ----------
function splash(msg) {
  layout = 'splash';
  view = null;
  const saved = store.get();
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="lobby" aria-label="Wróć do lobby PL3Y" title="Lobby PL3Y">${ICONS.back}</button>
      <span class="brand"><span class="brand-mark" aria-hidden="true">P</span><span class="brand-name">PL3Y</span></span>
    </header>
    <main class="splash">
      <div class="rise">
        <p class="eyebrow">Tajne stowarzyszenie · 5–16 graczy</p>
        <h1 class="title">Mafia</h1>
        <p class="sub">Ten ekran prowadzi grę. Gracze dołączają telefonami, poznają swoje tajne role i nocą działają w ukryciu.</p>
        ${msg ? `<p class="warn">${esc(msg)}</p>` : ''}
        <div class="row">
          ${saved ? `<button class="btn ghost big" data-act="resume-room">Wróć do pokoju ${esc(saved.code)}</button>` : ''}
          <button class="btn big" data-act="newroom-now">Nowa gra</button>
        </div>
        ${LOCAL ? '<p class="local-note">Tryb lokalny: serwer gry działa w tej przeglądarce. Gracze otwierają link w innych kartach. Aby grać na telefonach, ustaw adres serwera w js/config.js.</p>' : ''}
      </div>
    </main>`;
}

async function newRoom() {
  try {
    const r = await createRoom();
    store.set({ code: r.code, hostToken: r.hostToken });
    connect(r);
  } catch (e) { splash(e.message || 'Nie udało się połączyć z serwerem gry.'); }
}

function connect(r) {
  if (conn) conn.stop('closed');
  seenRoster.clear();
  layout = '';
  app.innerHTML = '<main class="splash"><p class="eyebrow">Łączenie z pokojem…</p></main>';
  conn = new Conn({
    code: r.code,
    hello: () => ({ t: 'hello', host: r.hostToken }),
    onMessage,
    onStatus,
  });
}

function onStatus(s) {
  const el = $('#net');
  el.classList.toggle('on', s === 'reconnecting' || s === 'connecting' && !!view);
  el.textContent = s === 'reconnecting' ? 'Ponowne łączenie…' : 'Łączenie…';
  if (s === 'noroom') { store.set(null); splash('Ten pokój wygasł. Załóż nową grę.'); }
}

function onMessage(m) {
  if (m.t === 'state') { view = m.view; render(); return; }
  if (m.t === 'error') {
    if (m.code === 'badhost' || m.code === 'noroom') { store.set(null); conn && conn.stop('closed'); splash(m.err); return; }
    toast(m.err, true);
  }
}

async function act(action, okMsg) {
  try { const out = await conn.act(action); if (okMsg) toast(okMsg); return out; }
  catch (e) { toast(e.message, true); return null; }
}

// ---------- renderowanie ----------
function ensureLayout(kind) {
  if (layout === kind) return;
  layout = kind;
  if (kind === 'lobby') app.innerHTML = '<div id="top"></div>' + lobbySkeleton();
  else if (kind === 'end') app.innerHTML = '<div id="top"></div><div id="body"></div>';
  else app.innerHTML = '<div id="top"></div><main class="game"><div id="stage"></div><div id="board"></div></main>';
}

function render() {
  const v = view;
  const kind = v.phase === 'lobby' ? 'lobby' : v.phase === 'end' ? 'end' : 'game';
  ensureLayout(kind);
  setHTML($('#top'), topbarHtml(v));
  if (kind === 'lobby') {
    setHTML($('#join'), joinHtml(v, joinUrl(v.code)));
    setHTML($('#roster'), rosterHtml(v, seenRoster));
    v.players.forEach(p => seenRoster.add(p.id));
    setHTML($('#wizard'), wizardHtml(v));
  } else if (kind === 'end') {
    setHTML($('#body'), endHtml(v));
  } else {
    setHTML($('#stage'), stageHtml(v));
    setHTML($('#board'), boardHtml(v));
  }
  pauseVeil(v.paused);
  transitions(v);
  syncRebind(v);
  clock();
  document.title = `Mafia · ${v.code}`;
}

function pauseVeil(on) {
  let el = $('#pause');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'pause';
    el.className = 'pause-veil';
    el.innerHTML = `<div><p class="eyebrow">Gra wstrzymana</p><h1 class="big-title" style="margin:12px 0 24px">Pauza</h1><button class="btn big" data-act="resume">Wznów grę</button></div>`;
    document.body.append(el);
  } else if (!on && el) el.remove();
}

function curtain(kind, title, lead, icon) {
  if (calm()) return;
  const el = document.createElement('div');
  el.className = `curtain ${kind}`;
  el.innerHTML = `<div>${icon || ''}<h1 class="big-title">${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 3300);
}

function transitions(v) {
  const prev = lastPhase;
  lastPhase = v.phase;
  if (prev === null || prev === v.phase) { lastRound = v.round; return; }
  if (v.phase === 'night' && v.round !== lastRound) curtain('night', 'Miasto zasypia', `Noc ${v.round}`, ICONS.moon);
  else if (v.phase === 'day') curtain(v.day && v.day.report && v.day.report.killed ? 'blood' : 'day', 'Miasto się budzi', `Dzień ${v.round}`, ICONS.sun);
  else if (v.phase === 'deal' && prev === 'lobby') curtain('night', 'Losowanie ról', 'Tożsamości zostały przydzielone');
  lastRound = v.round;
}

// ---------- jednorazowy QR ----------
async function showRebind(id) {
  const out = await act({ a: 'rebind', id });
  if (!out || !out.rebind) return;
  const rb = out.rebind;
  const url = `${base()}play.html?r=${view.code}#rb=${rb.token}`;
  if (rebindModal) rebindModal.close();
  rebindModal = modal(`
    <p class="eyebrow">Jednorazowy kod · ${esc(who(view, id))}</p>
    <div class="qr" style="width:min(100%,280px)">${qrSvg(url)}</div>
    <p class="muted" style="font-size:14px">Zeskanuj tym telefonem, który ma należeć do gracza. Kod działa raz. Poprzedni telefon gracza zostanie odłączony.</p>
    <p class="mono">Ważny jeszcze <span data-ends="${rb.exp}"></span></p>
    ${LOCAL ? `<p style="font-size:12px;word-break:break-all"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>` : ''}
    <div class="actions"><button class="btn ghost" data-close="">Zamknij</button></div>`,
  { onClose: () => { rebindModal = null; } });
  rebindModal.id = id;
  clock();
}
function syncRebind(v) {
  if (rebindModal && v.host && !v.host.rebind) { rebindModal.close(); toast('Telefon przypisany do gracza.'); }
}

// ---------- menu gracza ----------
function playerMenu(id) {
  const p = view.players.find(q => q.id === id);
  if (!p) return;
  const inGame = view.phase !== 'lobby' && view.phase !== 'end';
  const granted = view.host && view.host.grants.includes(id);
  modal(`
    <p class="eyebrow">Gracz</p>
    <h2 class="h2" style="margin:8px 0 4px"><span class="no" style="font-size:22px">${pad(p.no)}</span> ${esc(p.name)}</h2>
    <p class="muted" style="margin:0 0 18px">${p.left ? 'Opuścił grę' : p.alive ? (p.online ? 'Połączony' : 'Rozłączony') : 'Wyeliminowany'}</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${!p.left && inGame ? `<button class="btn ghost" data-close="rebind">Jednorazowy QR (nowy telefon)</button>` : ''}
      ${!p.left && inGame && view.phase !== 'deal' || (view.phase === 'deal' && p.ready) ? `<button class="btn ghost" data-close="grant" ${granted ? 'disabled' : ''}>${granted ? 'Zgoda udzielona' : 'Pozwól ponownie zobaczyć rolę'}</button>` : ''}
      ${!p.left && view.phase !== 'end' ? `<button class="btn danger" data-close="kick">Usuń z gry</button>` : ''}
      <button class="btn ghost" data-close="">Zamknij</button>
    </div>`, {
    onClose: async v => {
      if (v === 'rebind') showRebind(id);
      if (v === 'grant') act({ a: 'grant', id }, 'Gracz może raz jeszcze otworzyć kopertę na swoim telefonie.');
      if (v === 'kick') kick(id);
    },
  });
}

async function kick(id) {
  const p = view.players.find(q => q.id === id);
  const inGame = view.phase !== 'lobby';
  if (!await ask(`Usunąć ${pad(p.no)} ${p.name}?`, inGame ? 'Gracz zostanie oznaczony jako „opuścił grę”. Jego rola nie zostanie ujawniona.' : '', { ok: 'Usuń', danger: true })) return;
  act({ a: 'kick', id });
}

// ---------- zdarzenia ----------
const ACTIONS = {
  async lobby() {
    if (view && view.phase !== 'lobby' && view.phase !== 'end' && !await ask('Wrócić do lobby PL3Y?', 'Gra zostaje na serwerze — wrócisz do niej przyciskiem „Wróć do pokoju”.', { ok: 'Wróć' })) return;
    location.href = '/';
  },
  'newroom-now': () => newRoom(),
  'resume-room': () => { const s = store.get(); if (s) connect(s); },
  async newroom() {
    if (!await ask('Założyć nowy pokój?', 'Gracze będą musieli dołączyć od nowa. Aby zagrać tym samym składem, wybierz „Zagraj ponownie”.', { ok: 'Nowy pokój' })) return;
    conn && conn.stop('closed');
    store.set(null);
    newRoom();
  },
  async start() {
    const roles = plannedRoles(view);
    if (!await ask('Rozpocząć grę?', `Zestaw ról: <b>${esc(rolesSummary(roles))}</b>.<br>Role zostaną tajnie rozlosowane. Po starcie nikt nie dołączy.`, { ok: 'Losuj role' })) return;
    act({ a: 'start' });
  },
  kick: el => kick(el.dataset.id),
  player: el => playerMenu(el.dataset.id),
  'rebind-current': () => view.deal && view.deal.current && showRebind(view.deal.current),
  begin: () => act({ a: 'begin' }),
  next: async () => {
    if (view.phase === 'avenger' && !await ask('Pominąć zemstę?', 'Mściciel straci swoją umiejętność.', { ok: 'Pomiń' })) return;
    if (view.phase === 'night' && view.night.done < view.night.total && !await ask('Zakończyć noc?', `Zatwierdziło ${view.night.done} z ${view.night.total} graczy. Liczą się dotychczasowe wybory.`, { ok: 'Zakończ noc' })) return;
    act({ a: 'next' });
  },
  extend: () => act({ a: 'extend' }, 'Dodano 30 sekund.'),
  skipvote: async () => { if (await ask('Pominąć głosowanie?', 'Dziś nikt nie odpadnie, zapada noc.', { ok: 'Pomiń' })) act({ a: 'skipvote' }); },
  pause: () => act({ a: 'pause' }),
  resume: () => act({ a: 'resume' }),
  rematch: async () => { if (await ask('Zagrać ponownie?', 'Ten sam skład, nowe losowanie ról. Wracacie do lobby, gdzie możesz zmienić ustawienia.', { ok: 'Rewanż' })) act({ a: 'rematch' }); },
};
const SETTINGS = new Set(['mode', 'disc', 'exp', 'role+', 'role-', 'preset']);

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.tagName === 'INPUT') return;
  const a = el.dataset.act;
  if (SETTINGS.has(a)) { const patch = wizardPatch(view, el); if (patch) act({ a: 'settings', patch }); return; }
  const fn = ACTIONS[a];
  if (fn) fn(el);
});
document.addEventListener('change', e => {
  const el = e.target.closest('input[data-act]');
  if (!el || !view) return;
  const patch = wizardPatch(view, el);
  if (patch) act({ a: 'settings', patch });
});
document.addEventListener('keydown', e => {
  if (!view || e.target.closest('input, textarea') || document.querySelector('.modal')) return;
  if (e.key === 'p' || e.key === 'P') ACTIONS[view.paused ? 'resume' : 'pause']();
});

// Ekran ma nie gasnąć w trakcie gry.
let wake = null;
async function keepAwake() { try { if (!wake && navigator.wakeLock && !document.hidden) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch {} }
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('click', keepAwake, { once: true });

// ---------- start ----------
if (LOCAL) window.mafiaDebug = () => ({ view, layout });
const saved = store.get();
if (saved && saved.code && saved.hostToken) connect(saved);
else splash();
