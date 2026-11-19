// Lobby: QR do dołączania, kod pokoju, lista graczy (z usuwaniem), kreator i start.
import { MAX_PLAYERS } from '../../worker/src/engine/balance.js';
import { esc, ICONS, pad, qrSvg } from '../ui.js';
import { rolesProblem, wizardHtml } from './wizard.js';

export const lobbySkeleton = () => `
  <div class="lobby">
    <div class="panel join-card" id="join"></div>
    <div class="panel roster-card" id="roster"></div>
    <div id="wizard"></div>
  </div>`;

export const joinHtml = (v, joinUrl) => `
  <p class="eyebrow">Dołącz do gry</p>
  <div class="qr" aria-label="Kod QR do dołączenia">${qrSvg(joinUrl)}</div>
  <p class="eyebrow" style="color:var(--muted)">Kod pokoju</p>
  <div class="room-code">${esc(v.code)}</div>
  <p class="join-url">${esc(joinUrl.replace(/^https?:\/\//, ''))}</p>`;

// seen: identyfikatory już pokazane (animujemy tylko nowych graczy)
export function rosterHtml(v, seen) {
  const prob = rolesProblem(v);
  const roster = v.players.length ? v.players.map(p => {
    const fresh = !seen.has(p.id);
    return `
    <div class="roster-item" style="${fresh ? '' : 'animation:none'}">
      <span class="dot ${p.online ? 'on' : ''}" title="${p.online ? 'połączony' : 'rozłączony'}"></span>
      <span class="no">${pad(p.no)}</span>
      <span class="nm">${esc(p.name)}</span>
      <button class="x" data-act="kick" data-id="${p.id}" aria-label="Usuń gracza ${esc(p.name)}">${ICONS.x}</button>
    </div>`;
  }).join('') : '<div class="empty">Zeskanujcie kod QR telefonami, żeby dołączyć.</div>';
  return `
    <div class="roster-head">
      <div><p class="eyebrow">Gracze</p><h2 class="h2" style="margin-top:8px">Stowarzyszenie</h2></div>
      <div class="count">${v.players.length}<small> / ${MAX_PLAYERS}</small></div>
    </div>
    <div class="roster">${roster}</div>
    <hr class="rule">
    <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <p class="muted" style="margin:0;font-size:14px">${prob ? esc(prob) : 'Wszyscy są? Zatwierdź zestaw ról i rozpocznij.'}</p>
      <button class="btn big" data-act="start" ${prob ? 'disabled' : ''}>Rozpocznij grę</button>
    </div>`;
}

export { wizardHtml };
