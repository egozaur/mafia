// Ekran końcowy: zwycięska frakcja, wszystkie role, statystyki, historia głosowań, MVP, rewanż.
import { esc, pad, roleFaction, roleName } from '../ui.js';
import { who } from './board.js';

const tag = id => `<span class="tag ${roleFaction(id)}">${esc(roleName(id))}</span>`;

function historyHtml(v) {
  if (!v.history.length) return '<p class="muted">Nie było żadnego głosowania.</p>';
  return v.history.map(h => {
    const label = `Dzień ${h.round}${h.runoff ? ' · dogrywka' : ''}`;
    if (h.reason === 'skipped') return `<div class="hist"><span class="eyebrow">${label}</span><div class="res muted">Głosowanie pominięte</div></div>`;
    const byTarget = {};
    for (const b of h.ballots) (byTarget[b.target] = byTarget[b.target] || []).push(b.voter);
    const lines = Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length).map(([t, vs]) =>
      `<li><b>${t === 'skip' ? 'Wstrzymali się' : esc(who(v, t))}</b> <span class="muted">← ${vs.map(x => pad((v.players.find(p => p.id === x) || {}).no || 0)).join(', ')}</span></li>`).join('');
    const res = h.outcome === 'elim' ? `Odpada: ${esc(who(v, h.eliminated))}` : h.outcome === 'runoff' ? 'Dogrywka' : 'Nikt nie odpada';
    return `<div class="hist"><span class="eyebrow">${label}</span><ul>${lines || '<li class="muted">Brak głosów</li>'}</ul><div class="res">${res}</div></div>`;
  }).join('');
}

export function endHtml(v) {
  const w = v.winner;
  const stats = Object.fromEntries(v.end.stats.map(s => [s.id, s]));
  const mvp = v.players.find(p => p.id === v.end.mvp);
  const rows = v.players.filter(p => !p.left).slice().sort((a, b) => (stats[b.id].score - stats[a.id].score) || a.no - b.no).map(p => {
    const s = stats[p.id], st = s.stats || {};
    const ability = s.role === 'doctor' ? `uratowani: ${st.saves}` : s.role === 'detective' ? `wykryta mafia: ${st.checksMafia}` : roleFaction(s.role) === 'mafia' ? `zabójstwa: ${st.kills}` : '—';
    return `<tr class="${p.alive ? '' : 'dead'} ${p.id === v.end.mvp ? 'mvp' : ''}">
      <td class="no">${pad(p.no)}</td><td>${esc(p.name)}</td><td>${tag(s.role)}</td>
      <td class="muted">${p.alive ? 'żyje' : p.cause === 'night' ? `noc ${p.diedRound}` : `dzień ${p.diedRound}`}</td>
      <td class="num">${st.votesOnMafia}/${st.votes}</td><td class="num">${st.suspectsOnMafia}/${st.suspects}</td><td>${ability}</td><td class="num">${s.score}</td></tr>`;
  }).join('');
  return `
  <div class="end-wrap">
    <section class="winner ${w}">
      <div class="ray" aria-hidden="true"></div>
      <p class="eyebrow" style="position:relative">Koniec gry · ${v.round} ${v.round === 1 ? 'runda' : 'rund'}</p>
      <h1 class="big-title" style="position:relative">${w === 'mafia' ? 'Mafia wygrywa' : 'Miasto wygrywa'}</h1>
      <p class="lead" style="position:relative;margin:14px auto 0">${w === 'mafia' ? 'Rodzina przejęła miasto. Nikt już nie odważy się mówić.' : 'Wszyscy członkowie mafii zostali zdemaskowani.'}</p>
      <div class="controls" style="position:relative;margin-top:22px">
        <button class="btn big" data-act="rematch">Zagraj ponownie</button>
        <button class="btn ghost" data-act="newroom">Nowy pokój</button>
      </div>
    </section>
    <div class="end-grid">
      <div class="panel">
        <p class="eyebrow">Ujawnione role i statystyki</p>
        <div style="overflow-x:auto;margin-top:12px">
        <table class="stats">
          <thead><tr><th>Nr</th><th>Gracz</th><th>Rola</th><th>Los</th><th title="Głosy na mafię / wszystkie">Głosy</th><th title="Trafne podejrzenia nocą / wszystkie">Podejrz.</th><th>Umiejętność</th><th>Pkt</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        ${mvp ? `<div class="panel mvp-card"><p class="eyebrow">MVP</p><div class="num">${pad(mvp.no)}</div><h3 class="h3">${esc(mvp.name)}</h3><p style="margin:8px 0 0">${tag(stats[mvp.id].role)} · ${stats[mvp.id].score} pkt</p></div>` : ''}
        <div class="panel"><p class="eyebrow">Historia głosowań</p><div class="history" style="margin-top:12px">${historyHtml(v)}</div></div>
      </div>
    </div>
  </div>`;
}

