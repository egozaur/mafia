// Dołączanie: wpisanie kodu pokoju, pseudonim, oczekiwanie w lobby.
import { esc, pad } from '../ui.js';

export const codeHtml = msg => `
  <form class="screen center" data-form="code" autocomplete="off">
    <p class="eyebrow">Mafia · PL3Y</p>
    <h1>Dołącz do pokoju</h1>
    <p class="lead">Zeskanuj kod QR z ekranu głównego albo wpisz kod pokoju.</p>
    <input class="field-in code" name="code" maxlength="5" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="KOD" aria-label="Kod pokoju" required>
    ${msg ? `<p class="warn" style="color:var(--red-hi)">${esc(msg)}</p>` : ''}
    <div class="foot"><button class="btn big block" type="submit">Dalej</button></div>
  </form>`;

export const joinHtml = (code, joinable, msg, busy) => joinable ? `
  <form class="screen center" data-form="join" autocomplete="off">
    <p class="eyebrow">Pokój ${esc(code)}</p>
    <h1>Kim jesteś?</h1>
    <p class="lead">Podaj pseudonim widoczny dla innych graczy.</p>
    <input class="field-in" name="name" maxlength="18" autocomplete="nickname" placeholder="Pseudonim" aria-label="Pseudonim" required>
    ${msg ? `<p style="color:var(--red-hi);margin:0">${esc(msg)}</p>` : ''}
    <div class="foot"><button class="btn big block" type="submit" ${busy ? 'disabled' : ''}>Dołącz</button></div>
  </form>` : `
  <div class="screen center">
    <p class="eyebrow">Pokój ${esc(code)}</p>
    <h1>Gra już trwa</h1>
    <p class="lead">Do trwającej gry nie można dołączyć. Jeśli grasz, a zmieniłeś telefon lub przeglądarkę, poproś gospodarza o <b>jednorazowy kod QR</b> dla Twojego miejsca.</p>
    ${msg ? `<p style="color:var(--red-hi);margin:0">${esc(msg)}</p>` : ''}
  </div>`;

export const waitHtml = v => `
  <div class="screen center">
    <p class="eyebrow">Twój numer</p>
    <div class="bignum">${pad(v.me.no)}</div>
    <h1>${esc(v.me.name)}</h1>
    <p class="lead">Jesteś w lobby. Czekamy, aż gospodarz rozpocznie grę.</p>
    <p class="status-line">${v.players.length} ${v.players.length === 1 ? 'gracz' : v.players.length < 5 ? 'graczy' : 'graczy'} w pokoju</p>
    <p class="muted" style="font-size:13px;margin:0">Nie zamykaj tej strony. Jeśli ją zamkniesz, wrócisz tym samym linkiem.</p>
  </div>`;
