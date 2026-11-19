// Tajna koperta: pieczęć → otwarcie → obrót karty z rolą → „ZAPAMIĘTANO” → zapieczętowanie.
import { esc, pad } from '../ui.js';

// Zamknięta koperta (gracz może ją otworzyć).
export const sealedEnvelopeHtml = (v, again) => `
  <div class="screen center">
    <p class="eyebrow">${again ? 'Zgoda gospodarza' : 'Twoja kolej'}</p>
    <h1>${again ? 'Koperta otwarta ponownie' : 'Ściśle tajne'}</h1>
    <p class="lead">${again ? 'Gospodarz pozwolił Ci jeszcze raz zobaczyć swoją rolę.' : 'Upewnij się, że nikt nie patrzy na Twój ekran.'} Dotknij pieczęci.</p>
    <div class="envelope-wrap">
      <div class="paper"></div>
      <div class="role-card"><div class="face front">Poufne</div></div>
      <div class="envelope"></div>
      <div class="flap"></div>
      <button class="seal-btn" data-act="open" aria-label="Złam pieczęć i otwórz kopertę">P</button>
    </div>
  </div>`;

// Karta roli. mode: 'opening' (animacja) albo 'shown'.
export function roleHtml(v, mode) {
  const r = v.role;
  const nm = id => { const p = v.players.find(q => q.id === id); return p ? `${pad(p.no)} ${esc(p.name)}` : '?'; };
  const team = r.team ? (r.team.length
    ? `<div class="sec"><span class="eyebrow">Twoja rodzina</span><div class="team">${r.team.map(t => `<span class="tag mafia">${nm(t.id)}${t.don ? ' · Don' : ''}</span>`).join('')}</div></div>`
    : '<div class="sec"><span class="eyebrow">Twoja rodzina</span>Działasz w pojedynkę.</div>') : '';
  return `
  <div class="screen center" style="gap:12px">
    <p class="eyebrow">Gracz ${pad(v.me.no)} · ${esc(v.me.name)}</p>
    <div class="envelope-wrap ${mode}">
      <div class="paper"></div>
      <div class="role-card">
        <div class="face front">Poufne</div>
        <div class="face back ${r.faction}">
          <span class="tag ${r.faction}" style="align-self:flex-start">${esc(r.factionName)}</span>
          <div class="rname">${esc(r.name)}</div>
          <div class="sec"><span class="eyebrow">Umiejętność</span>${esc(r.ability)}</div>
          <div class="sec"><span class="eyebrow">Cel</span>${esc(r.goal)}</div>
          ${team}
        </div>
      </div>
      <div class="envelope"></div>
      <div class="flap"></div>
      <div class="seal-btn" aria-hidden="true">P</div>
    </div>
    <div class="foot" style="width:100%"><button class="btn big block" data-act="memorized">Zapamiętano</button></div>
  </div>`;
}

export const sealedHtml = (v, sub) => `
  <div class="screen center">
    <div class="sealed-mark" aria-hidden="true">P</div>
    <p class="eyebrow">Gracz ${pad(v.me.no)}</p>
    <h1>Twoja tożsamość została zapieczętowana</h1>
    <p class="lead">${sub || 'Odłóż telefon ekranem do dołu i czekaj na pozostałych.'}</p>
  </div>`;

export function waitTurnHtml(v) {
  const cur = v.players.find(p => p.id === v.deal.current);
  const ahead = v.players.filter(p => !p.ready && !p.left && p.no < v.me.no).length;
  return `
  <div class="screen center">
    <p class="eyebrow">Tajne rozdawanie ról</p>
    <div class="bignum">${pad(v.me.no)}</div>
    <h1>Czekaj na swoją kolej</h1>
    <p class="lead">${cur ? `Teraz kopertę otwiera gracz <b>${pad(cur.no)} ${esc(cur.name)}</b>.` : ''} ${ahead ? `Przed Tobą: ${ahead}.` : ''}</p>
  </div>`;
}
