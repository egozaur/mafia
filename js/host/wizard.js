// Kreator gry: tryb, liczba graczy, czas dyskusji, zestaw ról (podgląd / ręczna edycja w CUSTOM).
import { MAX_PLAYERS, MIN_PLAYERS, presetFor, total, validateRoles } from '../../worker/src/engine/balance.js';
import { ROLE_ORDER } from '../../worker/src/engine/roles.js';
import { esc, roleFaction, roleName } from '../ui.js';

const MODE_INFO = {
  classic: 'Podstawowe role i klasyczne zasady.',
  chaos: 'Losowe wydarzenia na początku dnia: cisza nocna, ostatnie słowo, podwójne podejrzenie, zamaskowany, nagroda detektywa.',
  custom: 'Ręcznie ustawiasz zestaw ról. Wydarzenia CHAOS możesz włączyć osobno.',
};
const DISC = [[90, '90 s'], [180, '3 min'], [300, '5 min']];

// Liczba graczy, dla której pokazujemy zestaw: faktyczna (jeśli ≥ 5), inaczej zadeklarowana.
export const planCount = v => (v.players.length >= MIN_PLAYERS ? v.players.length : v.settings.expected);
export const plannedRoles = v => (v.settings.mode === 'custom' ? v.settings.roles : presetFor(planCount(v)));

export function rolesProblem(v) {
  const n = v.players.length;
  if (n < MIN_PLAYERS) return `Potrzeba jeszcze ${MIN_PLAYERS - n} ${MIN_PLAYERS - n === 1 ? 'gracza' : 'graczy'} (minimum ${MIN_PLAYERS}).`;
  return validateRoles(plannedRoles(v), n);
}

export function wizardHtml(v) {
  const st = v.settings;
  const roles = plannedRoles(v);
  const custom = st.mode === 'custom';
  const n = planCount(v);
  const prob = rolesProblem(v);
  const sum = total(roles);
  const rows = ROLE_ORDER.filter(r => custom || roles[r]).map(r => `
    <div class="role-row ${roleFaction(r)}">
      <span class="nm">${esc(roleName(r))}</span>
      ${custom ? `<span class="stepper"><button data-act="role-" data-role="${r}" aria-label="Mniej: ${esc(roleName(r))}" ${roles[r] ? '' : 'disabled'}>−</button><output class="n">${roles[r] | 0}</output><button data-act="role+" data-role="${r}" aria-label="Więcej: ${esc(roleName(r))}">+</button></span>`
        : `<span class="n">${roles[r]}</span>`}
    </div>`).join('');
  return `
  <div class="panel wizard">
    <div><p class="eyebrow">Kreator gry</p><h2 class="h2" style="margin-top:8px">Ustawienia</h2></div>
    <div class="field">
      <span class="eyebrow">Tryb gry</span>
      <div class="chips" role="group" aria-label="Tryb gry">
        ${['classic', 'chaos', 'custom'].map(m => `<button class="chip" data-act="mode" data-v="${m}" aria-pressed="${st.mode === m}">${m}</button>`).join('')}
      </div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">${MODE_INFO[st.mode]}</p>
    </div>
    <div class="field">
      <span class="eyebrow">Liczba graczy</span>
      <span class="stepper"><button data-act="exp" data-v="-1" ${st.expected <= MIN_PLAYERS ? 'disabled' : ''} aria-label="Mniej graczy">−</button><output>${st.expected}</output><button data-act="exp" data-v="1" ${st.expected >= MAX_PLAYERS ? 'disabled' : ''} aria-label="Więcej graczy">+</button></span>
      <span class="muted" style="font-size:13px;margin-left:10px">dołączyło: ${v.players.length}</span>
    </div>
    <div class="field">
      <span class="eyebrow">Czas dyskusji</span>
      <div class="chips">${DISC.map(([d, l]) => `<button class="chip" data-act="disc" data-v="${d}" aria-pressed="${st.discussion === d}">${l}</button>`).join('')}</div>
    </div>
    <div class="field">
      <span class="eyebrow">${custom ? `Zestaw ról · ${sum} / ${v.players.length || n}` : `Proponowany zestaw dla ${n} graczy`}</span>
      <div class="roles-list">${rows}</div>
      ${custom ? `<button class="btn ghost small" style="margin-top:10px" data-act="preset">Wczytaj preset dla ${n}</button>` : ''}
      <p class="warn" style="margin:10px 0 0">${prob ? esc(prob) : ''}</p>
      ${!prob ? '<p class="ok-note" style="margin:0">Zestaw gotowy. Role zostaną rozlosowane po starcie.</p>' : ''}
    </div>
    <label class="toggle"><input type="checkbox" data-act="reveal" ${st.revealRole ? 'checked' : ''}> Ujawniaj rolę wyeliminowanych</label>
    <label class="toggle"><input type="checkbox" data-act="events" ${st.events ? 'checked' : ''} ${custom ? '' : 'disabled'}> Wydarzenia CHAOS</label>
  </div>`;
}

// Zwraca łatkę ustawień dla kliknięcia (albo null).
export function wizardPatch(v, el) {
  const st = v.settings;
  const act = el.dataset.act;
  if (act === 'mode') return { mode: el.dataset.v };
  if (act === 'disc') return { discussion: +el.dataset.v };
  if (act === 'exp') return { expected: Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, st.expected + +el.dataset.v)) };
  if (act === 'reveal') return { revealRole: el.checked };
  if (act === 'events') return { events: el.checked };
  if (act === 'preset') return { roles: presetFor(planCount(v)) };
  if (act === 'role+' || act === 'role-') {
    const roles = { ...st.roles };
    const r = el.dataset.role;
    roles[r] = Math.max(0, (roles[r] | 0) + (act === 'role+' ? 1 : -1));
    return { roles };
  }
  return null;
}

export function rolesSummary(roles) {
  return ROLE_ORDER.filter(r => roles[r]).map(r => `${roles[r]}× ${roleName(r)}`).join(', ');
}
