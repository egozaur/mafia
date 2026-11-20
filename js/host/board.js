// Pasek górny i plansza graczy na ekranie głównym.
import { esc, ICONS, MODES, pad, PHASES, roleFaction, roleName, timerHtml } from '../ui.js';

export const who = (v, id) => { const p = v.players.find(q => q.id === id); return p ? `${pad(p.no)} ${p.name}` : '—'; };
export const whoHtml = (v, id) => { const p = v.players.find(q => q.id === id); return p ? `<span class="no">${pad(p.no)}</span> ${esc(p.name)}` : '—'; };

export function topbarHtml(v) {
  const phase = v.phase === 'vote' && v.vote && v.vote.runoff ? 'Dogrywka' : PHASES[v.phase];
  const showClock = v.phase !== 'lobby' && v.phase !== 'end' && v.phase !== 'deal';
  return `
  <header class="topbar">
    <button class="tolobby" data-act="lobby" title="Wróć do lobby PL3Y">← Lobby</button>
    <span class="brand"><span class="brand-mark" aria-hidden="true">P</span><span class="brand-name">MAFIA</span></span>
    <span class="grow"></span>
    ${v.round ? `<span class="phase-label"><span class="eyebrow">Runda ${v.round}</span><b>${esc(phase)}</b></span>` : `<span class="phase-label"><span class="eyebrow">${esc(MODES[v.settings.mode])}</span><b>${esc(phase)}</b></span>`}
    <span class="grow"></span>
    ${showClock ? timerHtml(v) : ''}
    <span class="code-badge" title="Kod pokoju">${esc(v.code)}</span>
    ${v.phase !== 'lobby' && v.phase !== 'end' ? `<button class="icon-btn" data-act="${v.paused ? 'resume' : 'pause'}" aria-label="${v.paused ? 'Wznów' : 'Pauza'}" title="${v.paused ? 'Wznów' : 'Pauza'}">${v.paused ? ICONS.play : ICONS.pause}</button>` : ''}
  </header>`;
}

function status(v, p) {
  if (p.left) return 'Opuścił grę';
  if (!p.alive) {
    const how = p.cause === 'night' ? 'Zabity nocą' : p.cause === 'avenger' ? 'Zastrzelony' : 'Wyeliminowany';
    return p.role ? `${how} · ${roleName(p.role)}` : how;
  }
  if (v.phase === 'deal') return p.ready ? 'Gotowy' : v.deal.current === p.id ? (v.deal.opened ? 'Czyta rolę…' : 'Jego kolej') : 'Czeka';
  if (v.phase === 'vote') return v.vote.voted.includes(p.id) ? 'Zagłosował' : v.vote.candidates.includes(p.id) && v.vote.runoff ? 'W dogrywce' : '';
  if (v.phase === 'end') return p.role ? 'Przeżył · ' + roleName(p.role) : 'Przeżył';
  return p.online ? '' : 'Rozłączony';
}

export function boardHtml(v) {
  const mvp = v.end && v.end.mvp;
  return `<section class="board" aria-label="Gracze">${v.players.map(p => {
    const role = p.role;
    const cls = ['pc',
      !p.alive && 'dead', p.left && 'left',
      v.phase === 'deal' && p.ready && 'ready',
      v.phase === 'deal' && v.deal.current === p.id && 'current',
      v.phase === 'vote' && v.vote.voted.includes(p.id) && 'done',
      role && roleFaction(role) === 'mafia' && (v.phase === 'end' || !p.alive) && 'mafia',
      (v.elim && v.elim.id === p.id) && 'target',
      mvp === p.id && 'mvp',
    ].filter(Boolean).join(' ');
    return `<button class="${cls}" data-act="player" data-id="${p.id}" aria-label="Gracz ${pad(p.no)} ${esc(p.name)}">
      ${mvp === p.id ? '<span class="crown">MVP</span>' : ''}
      <span class="pc-top"><span class="pc-no">${pad(p.no)}</span><span class="dot ${p.online ? 'on' : ''}"></span></span>
      <span class="pc-name">${esc(p.name)}</span>
      <span class="pc-status">${esc(status(v, p))}</span>
    </button>`;
  }).join('')}</section>`;
}
