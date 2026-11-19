// Scena środkowa ekranu głównego dla każdej fazy + przyciski gospodarza.
import { esc, ICONS, roleFaction, roleName, timerHtml } from '../ui.js';
import { who, whoHtml } from './board.js';

const btn = (act, label, cls = '') => `<button class="btn ${cls}" data-act="${act}">${label}</button>`;
const progress = (done, totalN) => `<div class="progress" role="progressbar" aria-valuenow="${done}" aria-valuemax="${totalN}"><i style="width:${totalN ? (100 * done / totalN) : 0}%"></i></div>`;
const roleLine = id => id ? `<span class="tag ${roleFaction(id)}">${esc(roleName(id))}</span>` : '';
const dead = (v, id) => v.players.find(p => p.id === id) || {};

function deal(v) {
  const cur = v.deal.current;
  const ready = v.players.filter(p => p.ready).length;
  const total = v.players.filter(p => !p.left).length;
  if (!cur) {
    return { cls: '', html: `
      <p class="eyebrow">Rozdawanie zakończone</p>
      <h1 class="big-title">Tożsamości zapieczętowane</h1>
      <p class="lead">Każdy zna już swoją rolę. Odłóżcie telefony ekranem do dołu. Gdy wszyscy będą gotowi, zaczyna się pierwsza noc.</p>
      <div class="controls">${btn('begin', 'Rozpocznij grę', 'big')}</div>` };
  }
  const p = v.players.find(q => q.id === cur);
  return { cls: '', html: `
    <p class="eyebrow">Tajne rozdawanie ról · ${ready} / ${total}</p>
    <div class="now-player" aria-live="polite">
      <span class="eyebrow" style="color:var(--muted)">Teraz gracz</span>
      <span class="num">${String(p.no).padStart(2, '0')}</span>
      <span class="who">${esc(p.name)}</span>
    </div>
    <p class="lead">${v.deal.opened ? 'Koperta otwarta. Gracz poznaje swoją rolę…' : p.online ? 'Na Twoim telefonie czeka zapieczętowana koperta. Pozostali — nie zaglądajcie.' : '<b>Telefon gracza jest rozłączony.</b> Pokaż jednorazowy kod QR, żeby przypisać mu urządzenie.'}</p>
    ${progress(ready, total)}
    <div class="controls">${btn('rebind-current', 'Jednorazowy QR dla gracza', 'ghost small')}</div>` };
}

function night(v) {
  return { cls: 'night', html: `
    <span style="color:#9AA9D6">${ICONS.moon.replace('<svg', '<svg width="44" height="44"')}</span>
    <p class="eyebrow" style="color:#9AA9D6">Noc ${v.round}</p>
    <h1 class="big-title">Miasto zasypia</h1>
    <p class="lead">Zamknijcie oczy. Każdy — także obywatele — wykonuje swoje zadanie na telefonie, żeby nikt nie zdradził się stukaniem.</p>
    ${progress(v.night.done, v.night.total)}
    <p class="mono muted" style="margin:0;font-size:13px;letter-spacing:.14em">${v.night.done} / ${v.night.total} ZATWIERDZIŁO</p>
    <div class="controls">${btn('extend', '+30 s', 'ghost small')}${btn('next', 'Zakończ noc', 'ghost small')}</div>` };
}

export function reportHtml(v, r) {
  if (!r) return '';
  if (r.killed) {
    const p = dead(v, r.killed);
    return `<p class="lead">Ofiarą nocy jest <b>${whoHtml(v, r.killed)}</b>.${p.role ? ` Rola: ${roleLine(p.role)}` : ''}</p>`;
  }
  if (r.saved) return '<p class="lead">Mafia zaatakowała, ale <b>ofiara przeżyła</b>. Ktoś tej nocy czuwał.</p>';
  return '<p class="lead"><b>Noc minęła spokojnie.</b> Nikt nie zginął.</p>';
}

const eventHtml = e => e ? `<div class="event-card"><span class="eyebrow">Wydarzenie · Chaos</span><b>${esc(e.name)}</b><span class="muted">${esc(e.desc)}</span></div>` : '';

function day(v) {
  const r = v.day.report;
  return { cls: r && r.killed ? 'blood' : '', html: `
    <span style="color:var(--gold)">${ICONS.sun.replace('<svg', '<svg width="44" height="44"')}</span>
    <p class="eyebrow">Dzień ${v.round}</p>
    <h1 class="big-title">Miasto się budzi</h1>
    ${reportHtml(v, r)}
    ${eventHtml(v.day.event)}
    <p class="muted" style="margin:6px 0 0">Dyskusja — kto kłamie?</p>
    ${timerHtml(v, 'timer')}
    <div class="controls">${btn('extend', '+30 s', 'ghost small')}${btn('skipvote', 'Pomiń głosowanie', 'ghost small')}${btn('next', 'Głosowanie', '')}</div>` };
}

function vote(v) {
  const vt = v.vote;
  return { cls: '', html: `
    <p class="eyebrow">${vt.runoff ? 'Dogrywka' : 'Głosowanie'} · Dzień ${v.round}</p>
    <h1 class="big-title">${vt.runoff ? 'Dogrywka' : 'Kto odpada?'}</h1>
    ${vt.runoff ? `<p class="lead">Głosujemy tylko na: <b>${vt.candidates.map(id => esc(who(v, id))).join(', ')}</b></p>` : '<p class="lead">Głosujcie na telefonach. Głosy pozostają tajne do zamknięcia głosowania.</p>'}
    ${eventHtml(v.day && v.day.event)}
    ${progress(vt.done, vt.total)}
    <p class="mono muted" style="margin:0;font-size:13px;letter-spacing:.14em">${vt.done} / ${vt.total} ODDAŁO GŁOS</p>
    ${timerHtml(v, 'timer')}
    <div class="controls">${btn('skipvote', 'Pomiń głosowanie', 'ghost small')}${btn('next', 'Zamknij głosowanie', 'small')}</div>` };
}

function verdict(v) {
  const r = v.verdict;
  const rows = r.tallies.filter(t => t.count > 0).map(t => ({ ...t, label: who(v, t.id) }));
  if (r.skip) rows.push({ id: 'skip', count: r.skip, label: 'Wstrzymali się' });
  const max = Math.max(1, ...rows.map(x => x.count));
  const top = r.outcome === 'elim' ? r.eliminated : null;
  const voters = id => r.ballots.filter(b => b.target === id).map(b => String((v.players.find(p => p.id === b.voter) || {}).no || '').padStart(2, '0'));
  const T0 = 3.7, STEP = 1.3;
  const list = rows.map((x, i) => `
    <div class="tally-row ${x.id === top ? 'top' : ''}" style="--d:${T0 + i * STEP}s">
      <span class="who">${esc(x.label)}</span>
      <span class="bar"><i style="--w:${(100 * x.count / max).toFixed(1)}%"></i><span class="voters">${voters(x.id).join(' · ')}</span></span>
      <span class="n">${x.count}</span>
    </div>`).join('');
  let out;
  if (r.outcome === 'elim') out = `Miasto zdecydowało: <b>${esc(who(v, r.eliminated))}</b> odpada.`;
  else if (r.outcome === 'runoff') out = r.reason === 'double'
    ? `Podwójne podejrzenie! Pod dodatkowe głosowanie trafiają: <b>${r.runoffIds.map(id => esc(who(v, id))).join(' i ')}</b>.`
    : `Remis! Dogrywka między: <b>${r.runoffIds.map(id => esc(who(v, id))).join(', ')}</b>.`;
  else out = { nobody: 'Nikt nie oddał głosu. Nikt nie odpada.', skip: 'Większość wstrzymała się. Nikt nie odpada.', 'tie-again': 'Ponowny remis. Nikt nie odpada.' }[r.reason] || 'Nikt nie odpada.';
  return { cls: '', html: `
    <div class="countdown" aria-hidden="true"><span>3</span><span>2</span><span>1</span></div>
    <p class="eyebrow verdict-out" style="--d:3.4s">${r.runoff ? 'Wyniki dogrywki' : 'Wyniki głosowania'}</p>
    <div class="tally">${list || ''}</div>
    <p class="lead verdict-out" style="--d:${T0 + rows.length * STEP + .3}s">${out}</p>
    <div class="controls verdict-out" style="--d:${T0 + rows.length * STEP + .6}s">${btn('next', 'Dalej')}</div>` };
}

function elim(v) {
  const e = v.elim;
  const p = dead(v, e.id);
  const shot = e.cause === 'avenger';
  return { cls: 'blood', html: `
    <p class="eyebrow" style="color:var(--red-hi)">${shot ? 'Zemsta Mściciela' : 'Eliminacja'}</p>
    <div class="elim-card ${p.role ? 'flip' : ''}">
      <div class="in">
        <div class="face"><span class="no">${String(p.no).padStart(2, '0')}</span><span class="nm">${esc(p.name)}</span></div>
        <div class="face back ${p.role ? roleFaction(p.role) : ''}">
          <span class="eyebrow">${p.role ? (roleFaction(p.role) === 'mafia' ? 'Mafia' : 'Miasto') : ''}</span>
          <span class="role-big">${p.role ? esc(roleName(p.role)) : ''}</span>
          <span class="muted">${esc(p.name)}</span>
        </div>
      </div>
      <span class="stamp">${shot ? 'ZASTRZELONY' : 'WYELIMINOWANY'}</span>
    </div>
    ${p.role ? '' : `<p class="lead">${v.settings.revealRole ? 'Zamaskowany — rola pozostaje tajemnicą.' : 'Rola pozostaje tajemnicą.'}</p>`}
    ${e.lastWords ? `<p class="eyebrow">Ostatnie słowo</p>${timerHtml(v, 'timer')}` : '<p class="muted" style="margin:0">Czas na ostatnie słowa.</p>'}
    <div class="controls">${btn('next', 'Dalej')}</div>` };
}

function avenger(v) {
  return { cls: 'blood', html: `
    <p class="eyebrow" style="color:var(--red-hi)">Zemsta</p>
    <h1 class="big-title">Mściciel celuje</h1>
    <p class="lead"><b>${whoHtml(v, v.avenger.id)}</b> był Mścicielem i wskazuje na telefonie, kto zginie razem z nim.</p>
    ${timerHtml(v, 'timer')}
    <div class="controls">${btn('next', 'Pomiń zemstę', 'ghost small')}</div>` };
}

export function stageHtml(v) {
  const f = { deal, night, day, vote, verdict, elim, avenger }[v.phase];
  if (!f) return '';
  const { cls, html } = f(v);
  return `<section class="stage ${cls}"><div class="stage-inner">${html}</div></section>`;
}
