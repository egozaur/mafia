// Dzień, głosowanie, wyniki, eliminacja, zemsta i koniec gry na telefonie.
import { esc, pad, roleFaction, roleName, timerHtml } from '../ui.js';
import { notesHtml } from './night.js';

const nm = (v, id) => { const p = v.players.find(q => q.id === id); return p ? `${pad(p.no)} ${esc(p.name)}` : '?'; };
const tag = id => id ? `<span class="tag ${roleFaction(id)}">${esc(roleName(id))}</span>` : '';
const deadBanner = v => (!v.me.alive ? '<div class="dead-banner">Jesteś poza grą · obserwuj w ciszy</div>' : '');

export function reportHtml(v) {
  const r = v.day && v.day.report;
  if (!r) return '';
  if (r.killed) {
    const p = v.players.find(q => q.id === r.killed) || {};
    return `<div class="report blood"><span class="eyebrow" style="color:var(--red-hi)">Noc ${r.round}</span><p style="margin:6px 0 0">Ofiarą nocy jest <b>${nm(v, r.killed)}</b>. ${p.role ? tag(p.role) : ''}</p></div>`;
  }
  return `<div class="report"><span class="eyebrow">Noc ${r.round}</span><p style="margin:6px 0 0">${r.saved ? 'Mafia zaatakowała, ale <b>ofiara przeżyła</b>.' : '<b>Noc minęła spokojnie.</b> Nikt nie zginął.'}</p></div>`;
}
const eventHtml = e => e ? `<div class="report blood"><span class="eyebrow" style="color:var(--red-hi)">Wydarzenie · Chaos</span><p style="margin:6px 0 0"><b>${esc(e.name)}</b> — ${esc(e.desc)}</p></div>` : '';

export const dayHtml = v => `
  <div class="screen">
    ${deadBanner(v)}
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Dzień ${v.round}</span>${timerHtml(v, 'mono')}</div>
    <h1>Dyskusja</h1>
    ${reportHtml(v)}
    ${eventHtml(v.day && v.day.event)}
    <p class="lead">Rozmawiajcie przy stole. Głosowanie otworzy się na tym ekranie.</p>
    ${v.me.alive ? notesHtml(v) : ''}
  </div>`;

export function voteHtml(v) {
  const b = v.ballot;
  const vt = v.vote;
  if (!b) {
    return `<div class="screen center">${deadBanner(v)}<p class="eyebrow">${vt.runoff ? 'Dogrywka' : 'Głosowanie'}</p><h1>Trwa głosowanie</h1><p class="status-line">${vt.done} / ${vt.total} oddało głos</p></div>`;
  }
  const list = b.options.map(id => {
    const p = v.players.find(q => q.id === id);
    return `<button class="tg" data-act="vote" data-id="${id}" aria-pressed="${b.choice === id}"><span class="no">${pad(p.no)}</span><span class="nm">${esc(p.name)}</span></button>`;
  }).join('');
  return `
  <div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">${vt.runoff ? 'Dogrywka' : 'Głosowanie'} · Dzień ${v.round}</span>${timerHtml(v, 'mono')}</div>
    <h1>${vt.runoff ? 'Dogrywka' : 'Kto odpada?'}</h1>
    <p class="lead">Twój głos jest tajny do zamknięcia głosowania. Możesz go zmienić, dopóki wszyscy nie zagłosują.</p>
    <div class="targets">${list}<button class="tg wide" data-act="vote" data-id="skip" aria-pressed="${b.choice === 'skip'}"><span class="nm">Wstrzymuję się</span></button></div>
    <div class="foot"><p class="status-line ${b.choice !== undefined ? 'ok' : ''}">${b.choice !== undefined ? (b.choice === 'skip' ? 'Wstrzymałeś się' : `Twój głos: ${nm(v, b.choice)}`) : 'Wybierz osobę'} · ${vt.done}/${vt.total}</p></div>
  </div>`;
}

export function verdictHtml(v) {
  const r = v.verdict;
  let out;
  if (r.outcome === 'elim') out = `Odpada <b>${nm(v, r.eliminated)}</b>.`;
  else if (r.outcome === 'runoff') out = `Dogrywka: <b>${r.runoffIds.map(id => nm(v, id)).join(', ')}</b>.`;
  else out = 'Nikt nie odpada.';
  return `<div class="screen center">${deadBanner(v)}<p class="eyebrow">Wyniki głosowania</p><h1>Patrzcie na ekran</h1><p class="lead">${out}</p></div>`;
}

export function elimHtml(v) {
  const e = v.elim;
  const p = v.players.find(q => q.id === e.id) || {};
  const me = e.id === v.me.id;
  return `
  <div class="screen center">
    <p class="eyebrow" style="color:var(--red-hi)">${e.cause === 'avenger' ? 'Zemsta Mściciela' : 'Eliminacja'}</p>
    <h1>${me ? 'Zostałeś wyeliminowany' : nm(v, e.id)}</h1>
    ${p.role ? `<p>${tag(p.role)}</p>` : ''}
    <p class="lead">${me ? 'Masz czas na ostatnie słowa. Potem nie zdradzaj już niczego.' : 'Czas na ostatnie słowa.'}</p>
    ${e.lastWords ? timerHtml(v, 'timer') : ''}
  </div>`;
}

export function avengerHtml(v, pick) {
  if (!v.shot) {
    return `<div class="screen center">${deadBanner(v)}<p class="eyebrow" style="color:var(--red-hi)">Zemsta</p><h1>Mściciel celuje</h1><p class="lead"><b>${nm(v, v.avenger.id)}</b> wskazuje, kto zginie razem z nim.</p>${timerHtml(v, 'timer')}</div>`;
  }
  const list = v.shot.targets.map(id => {
    const p = v.players.find(q => q.id === id);
    return `<button class="tg" data-act="aim" data-id="${id}" aria-pressed="${pick === id}"><span class="no">${pad(p.no)}</span><span class="nm">${esc(p.name)}</span></button>`;
  }).join('');
  return `
  <div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow" style="color:var(--red-hi)">Zemsta</span>${timerHtml(v, 'mono')}</div>
    <h1>Kogo zabierasz ze sobą?</h1>
    <p class="lead">Jesteś Mścicielem. Wskazana osoba zginie natychmiast. Masz jedną szansę.</p>
    <div class="targets">${list}</div>
    <div class="foot">
      <button class="btn big block" data-act="shoot" ${pick ? '' : 'disabled'}>Strzelam</button>
      <button class="btn ghost block" data-act="noshoot">Nie strzelam</button>
    </div>
  </div>`;
}

export function endHtml(v) {
  const meP = v.players.find(p => p.id === v.me.id) || {};
  const myRole = meP.role;
  const won = myRole && ((v.winner === 'mafia') === (roleFaction(myRole) === 'mafia'));
  const mvp = v.end.mvp;
  const rows = v.players.filter(p => !p.left).map(p => `
    <div class="row ${p.alive ? '' : 'dead'}"><span class="no">${pad(p.no)}</span><span class="nm">${esc(p.name)}${p.id === mvp ? ' · <b style="color:var(--gold)">MVP</b>' : ''}</span>${tag(p.role)}</div>`).join('');
  return `
  <div class="screen">
    <div style="text-align:center">
      <p class="eyebrow">${won ? 'Zwycięstwo' : 'Porażka'}</p>
      <h1 style="color:${v.winner === 'mafia' ? 'var(--red-hi)' : 'var(--gold-hi)'}">${v.winner === 'mafia' ? 'Mafia wygrywa' : 'Miasto wygrywa'}</h1>
      <p class="lead" style="margin-top:8px">Byłeś: ${tag(myRole)}</p>
    </div>
    <div class="end-role">${rows}</div>
    <p class="status-line">Gospodarz może rozpocząć rewanż z tym samym składem.</p>
  </div>`;
}
