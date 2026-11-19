// Noc na telefonie: każdy żywy gracz ma zadanie o identycznym układzie (żeby aktywność nie zdradzała ról).
import { esc, pad, timerHtml } from '../ui.js';

const PROMPT = {
  kill: ['Wybierzcie ofiarę', 'Mafia decyduje większością. Przy remisie rozstrzyga Don.'],
  protect: ['Kogo chronisz?', 'Jeśli mafia zaatakuje tę osobę, przeżyje.'],
  check: ['Kogo sprawdzasz?', 'Dowiesz się, czy ta osoba należy do mafii.'],
  compare: ['Porównaj dwie osoby', 'Raz w grze: czy należą do tej samej frakcji? Możesz też poczekać.'],
  suspect: ['Kogo podejrzewasz?', 'Twoje podejrzenie liczy się do statystyk po grze.'],
};

const nm = (v, id) => { const p = v.players.find(q => q.id === id); return p ? `${pad(p.no)} ${esc(p.name)}` : '?'; };

export function notesHtml(v) {
  const n = v.me.notes || [];
  if (!n.length) return '';
  const line = x => x.kind === 'check' ? `Noc ${x.round}: ${nm(v, x.target)} — <b style="color:${x.mafia ? 'var(--red-hi)' : 'var(--gold)'}">${x.mafia ? 'MAFIA' : 'nie mafia'}</b>`
    : x.kind === 'compare' ? `Noc ${x.round}: ${nm(v, x.a)} i ${nm(v, x.b)} — <b>${x.same ? 'ta sama frakcja' : 'różne frakcje'}</b>`
      : x.kind === 'bounty' ? `Dzień ${x.round}: wśród ${x.targets.map(t => nm(v, t)).join(', ')} jest <b>co najmniej jeden członek mafii</b>` : '';
  return `<button class="btn ghost block hold" data-hold="notes">Przytrzymaj, aby zobaczyć notatki</button>
    <div class="note-box" data-notes hidden><span class="eyebrow">Poufne notatki</span><ul>${n.map(x => `<li>${line(x)}</li>`).join('')}</ul></div>`;
}

// sel: lokalny wybór dla porównania dziennikarza
export function nightHtml(v, sel) {
  const t = v.task;
  const [title, sub] = PROMPT[t.kind];
  const chosen = id => t.kind === 'compare' ? sel.includes(id) || (Array.isArray(t.choice) && !sel.length && t.choice.includes(id)) : t.choice === id;
  const partnerMarks = id => (t.partners || []).filter(p => p.target === id).map(p => `<span class="mk ${p.confirmed ? 'ok' : ''}">${p.don ? 'DON' : pad((v.players.find(q => q.id === p.id) || {}).no)}</span>`).join('');
  // Wszyscy żywi; niedostępni (np. wspólnicy mafii, osoba chroniona poprzedniej nocy) są wyszarzeni. Siebie pokazujemy tylko, gdy wolno.
  const list = v.players.filter(p => p.alive && (p.id !== v.me.id || t.targets.includes(p.id))).map(p => {
    const ok = t.targets.includes(p.id);
    return `<button class="tg" data-act="pick" data-id="${p.id}" aria-pressed="${chosen(p.id)}" ${ok ? '' : 'disabled'}>
      <span class="no">${pad(p.no)}</span><span class="nm">${esc(p.name)}${p.id === v.me.id ? ' (Ty)' : ''}</span>
      ${t.kind === 'kill' ? `<span class="marks">${partnerMarks(p.id)}</span>` : ''}
    </button>`;
  }).join('');
  // choice: undefined = jeszcze nic, null = „nikogo”, id / [a, b] = wybór
  const hasChoice = t.kind === 'compare' ? (sel.length === 2 || (!sel.length && t.choice !== undefined)) : t.choice !== undefined;
  const passLabel = t.kind === 'compare' ? 'Nie teraz' : 'Nikogo';
  const passSel = t.choice === null && (t.kind !== 'compare' || !sel.length);
  const team = t.partners && t.partners.length
    ? `<p class="status-line">Wspólnicy: ${t.partners.map(p => `${pad((v.players.find(q => q.id === p.id) || {}).no)}${p.don ? ' (Don)' : ''} ${p.confirmed ? '✓' : '…'}`).join(' · ')}</p>` : '';
  return `
  <div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Noc ${v.round} · Twoje zadanie</span>${timerHtml(v, 'mono muted')}</div>
    <h1>${title}</h1>
    <p class="lead">${sub}${t.kind === 'protect' && t.blocked ? ` Nie możesz chronić ${nm(v, t.blocked)} drugą noc z rzędu.` : ''}</p>
    ${team}
    <div class="targets">${list}<button class="tg wide" data-act="pick" data-id="" aria-pressed="${passSel}"><span class="nm">${passLabel}</span></button></div>
    ${notesHtml(v)}
    <div class="foot">
      <p class="status-line ${t.confirmed ? 'ok' : ''}">${t.confirmed ? 'Zatwierdzono · możesz jeszcze zmienić zdanie' : hasChoice ? 'Zatwierdź swój wybór' : t.kind === 'compare' ? 'Wybierz dwie osoby' : 'Wybierz osobę'}</p>
      <button class="btn big block" data-act="confirm" ${t.confirmed || !hasChoice ? 'disabled' : ''}>Zatwierdź</button>
    </div>
  </div>`;
}

export const deadNightHtml = v => `
  <div class="screen center">
    <p class="eyebrow">Noc ${v.round}</p>
    <h1>Jesteś poza grą</h1>
    <p class="lead">Zamknij oczy razem z innymi i nie zdradzaj niczego, co wiesz.</p>
  </div>`;
