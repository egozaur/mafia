// Wspólny serwer gier PL3Y: Mafia, Tajniacy, Milion, Rozejrzyj się i Kurczacze Imperium. Tworzenie pokojów, połączenia WebSocket do Durable Objects
// i wspólna lista zapisanych gier Tajniaków.
import { Room } from './room.js';
import { TjRoom } from './tajniacy/room.js';
import { TjSaves } from './tajniacy/saves.js';
import { MlRoom } from './milion/room.js';
import { MlScores } from './milion/scores.js';
import { RzWords } from './rozejrzyj/words.js';
import { KiRoom } from './kurczacze/room.js';
import { TjDuo } from './tajniacy/duo.js';
import { authMode, login, refresh, tokenFrom, verifyToken } from './auth.js';
import { IpLimiter } from './limits.js';

export { Room, TjRoom, TjSaves, MlRoom, MlScores, RzWords, KiRoom, TjDuo };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // bez 0/O, 1/I
const CODE_LEN = 5;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return [...b].map(x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Origin z listy ALLOWED_ORIGINS. Localhost przechodzi tylko z ALLOW_LOCALHOST="true" (dev) albo
// z tokenem testowym (kind "t"), czyli E2E na prawdziwym serwerze (?server=prod) bez otwierania produkcji.
// `local` = wolno localhost (np. preflight CORS, który nie niesie tokena).
function allowedOrigin(req, env, kind, local = false) {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.includes(origin)) return origin;
  if (LOCAL_RE.test(origin) && (env.ALLOW_LOCALHOST === 'true' || kind === 't' || local)) return origin;
  return null;
}

function cors(origin, res) {
  if (!origin) return res;
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}

// Zakłada pokój pod wolnym kodem w danej przestrzeni Durable Objects.
async function createRoom(ns, origin) {
  if (!origin) return new Response('Forbidden', { status: 403 });
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    const stub = ns.get(ns.idFromName(code));
    const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code }) });
    if (res.status === 409) continue;
    return cors(origin, new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
  }
  return cors(origin, new Response('Brak wolnych kodów', { status: 503 }));
}

function roomSocket(ns, req, origin, rawCode) {
  if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
  if (!origin) return new Response('Forbidden', { status: 403 });
  const code = rawCode.toUpperCase();
  if (!CODE_RE.test(code)) return new Response('Bad code', { status: 400 });
  return ns.get(ns.idFromName(code)).fetch(req);
}

// Rodzaj limitu tempa dla żądania (patrz HTTP_LIMITS w limits.js).
export function limitKind(method, path) {
  if (path === '/api/auth/login') return 'login';
  if (path === '/api/auth/refresh') return 'read';
  if (method === 'POST' && /^\/api\/(rooms|tj\/rooms|tj\/duo\/rooms|ml\/rooms|ki\/rooms)$/.test(path)) return 'create';
  if (/\/ws$/.test(path)) return 'ws';
  if (path.startsWith('/api/rz/')) return method === 'GET' ? 'read' : method === 'POST' ? 'write' : 'admin';
  if (path === '/api/ml/scores') return method === 'GET' ? 'read' : 'write';
  if (path.startsWith('/api/tj/saves')) return method === 'GET' ? 'read' : 'write';
  return null;
}

const limiter = new IpLimiter();
const deny = (origin, status, err, code, extra) =>
  cors(origin, new Response(JSON.stringify({ err, code }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extra || {}) } }));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Preflight CORS nie niesie tokena: odpowiadamy samymi nagłówkami (dane zostają za tokenem w żądaniu właściwym).
    if (req.method === 'OPTIONS') return cors(allowedOrigin(req, env, null, !!env.PL3Y_TEST_SECRET), new Response(null, { status: 204 }));

    // ---------- Autoryzacja (hasło sprawdza Worker, sesja = token HMAC) ----------
    const mode = authMode(env);
    const tok = tokenFrom(req, url);
    const claims = tok ? await verifyToken(env.PL3Y_TOKEN_SECRET, tok) : null;
    const origin = allowedOrigin(req, env, claims && claims.k, url.pathname.startsWith('/api/auth/') && !!env.PL3Y_TEST_SECRET);

    if (url.pathname === '/api/health') return cors(origin, Response.json({ ok: true }));

    const kind = limitKind(req.method, url.pathname);
    if (kind) {
      const wait = limiter.check(kind, req.headers.get('CF-Connecting-IP') || 'brak');
      if (wait) return deny(origin, 429, 'Za dużo prób. Spróbuj za chwilę.', 'rate', { 'Retry-After': String(wait) });
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      if (!origin) return new Response('Forbidden', { status: 403 });
      let body; try { body = JSON.parse((await req.text()).slice(0, 1000)); } catch { body = null; }
      const r = await login(env, body);
      return cors(origin, new Response(JSON.stringify(r.err ? { err: r.err, code: 'auth' } : { token: r.token, exp: r.exp, kind: r.kind, mode }), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (url.pathname === '/api/auth/refresh' && req.method === 'POST') {
      if (!origin) return new Response('Forbidden', { status: 403 });
      let rb; try { rb = JSON.parse((await req.text()).slice(0, 200)); } catch { rb = null; }
      const r = await refresh(env, tok, Date.now(), rb && rb.profile === 'p' ? 'p' : null);
      return cors(origin, new Response(JSON.stringify(r.err ? { err: r.err, code: 'auth' } : { token: r.token, exp: r.exp, kind: r.kind, mode }), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }

    // Wszystko poza health i logowaniem wymaga ważnego tokena (tryb "required"); w "optional" token jest sprawdzany tylko, gdy jest.
    if (mode !== 'off' && url.pathname.startsWith('/api/')) {
      if (mode === 'required' && !env.PL3Y_TOKEN_SECRET) return deny(origin, 503, 'Serwer nie ma ustawionego klucza sesji.', 'config');
      if (mode === 'required' ? !claims : (tok && !claims)) return deny(origin, 401, 'Sesja wygasła. Zaloguj się ponownie.', 'auth');
    }

    // ---------- Mafia ----------
    if (url.pathname === '/api/rooms' && req.method === 'POST') return createRoom(env.ROOMS, origin);
    let m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) return roomSocket(env.ROOMS, req, origin, m[1]);

    // ---------- Tajniacy ----------
    if (url.pathname === '/api/tj/rooms' && req.method === 'POST') return createRoom(env.TJ_ROOMS, origin);
    m = url.pathname.match(/^\/api\/tj\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) return roomSocket(env.TJ_ROOMS, req, origin, m[1]);
    // Tryb dla 2 osób (Duet): osobny pokój, serwer pilnuje zasad i kluczy.
    if (url.pathname === '/api/tj/duo/rooms' && req.method === 'POST') return createRoom(env.TJ_DUO, origin);
    m = url.pathname.match(/^\/api\/tj\/duo\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) return roomSocket(env.TJ_DUO, req, origin, m[1]);
    m = url.pathname.match(/^\/api\/tj\/saves(\/\d{1,16})?$/);
    if (m) {
      if (!origin) return new Response('Forbidden', { status: 403 });
      const stub = env.TJ_SAVES.get(env.TJ_SAVES.idFromName('saves'));
      const init = { method: req.method, headers: { 'Content-Type': 'application/json' } };
      if (req.method === 'PUT') init.body = await req.text();
      return cors(origin, await stub.fetch('https://saves' + (m[1] || '/'), init));
    }

    // ---------- Milion ----------
    if (url.pathname === '/api/ml/rooms' && req.method === 'POST') return createRoom(env.ML_ROOMS, origin);
    m = url.pathname.match(/^\/api\/ml\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) return roomSocket(env.ML_ROOMS, req, origin, m[1]);
    // Z zewnątrz tylko odczyt rankingu i wynik solo; wyniki meczów multi zapisuje sam pokój (MlRoom).
    if (url.pathname === '/api/ml/scores' && (req.method === 'GET' || req.method === 'POST')) {
      if (!origin) return new Response('Forbidden', { status: 403 });
      const stub = env.ML_SCORES.get(env.ML_SCORES.idFromName('scores'));
      const init = { method: req.method, headers: { 'Content-Type': 'application/json' } };
      if (req.method === 'POST') init.body = (await req.text()).slice(0, 2000);
      return cors(origin, await stub.fetch('https://scores' + (req.method === 'POST' ? '/solo' : '/'), init));
    }

    // ---------- Kurczacze Imperium (2 graczy, serwer pilnuje zasad) ----------
    if (url.pathname === '/api/ki/rooms' && req.method === 'POST') return createRoom(env.KI_ROOMS, origin);
    m = url.pathname.match(/^\/api\/ki\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) return roomSocket(env.KI_ROOMS, req, origin, m[1]);

    // ---------- Rozejrzyj się (gra na jednym komputerze; tylko wspólna baza słów) ----------
    m = url.pathname.match(/^\/api\/rz\/(stats|export|rounds|alias(?:\/[^/]{1,200})?)$/);
    if (m) {
      if (!origin) return new Response('Forbidden', { status: 403 });
      const ok = { stats: ['GET'], export: ['GET'], rounds: ['POST'], alias: ['PUT'] }[m[1]] || (m[1].startsWith('alias/') ? ['DELETE'] : []);
      if (!ok.includes(req.method)) return cors(origin, new Response('Method not allowed', { status: 405 }));
      const stub = env.RZ_WORDS.get(env.RZ_WORDS.idFromName('words'));
      const init = { method: req.method, headers: { 'Content-Type': 'application/json' } };
      if (req.method === 'POST' || req.method === 'PUT') init.body = (await req.text()).slice(0, 8000);
      return cors(origin, await stub.fetch('https://words/' + m[1], init));
    }

    return new Response('Not found', { status: 404 });
  },
};
