// Wspólny serwer gier PL3Y: Mafia, Tajniacy, Milion, Rozejrzyj się i Kurczacze Imperium. Tworzenie pokojów, połączenia WebSocket do Durable Objects
// i wspólna lista zapisanych gier Tajniaków.
import { Room } from './room.js';
import { TjRoom } from './tajniacy/room.js';
import { TjSaves } from './tajniacy/saves.js';
import { MlRoom } from './milion/room.js';
import { MlScores } from './milion/scores.js';
import { RzWords } from './rozejrzyj/words.js';
import { KiRoom } from './kurczacze/room.js';

export { Room, TjRoom, TjSaves, MlRoom, MlScores, RzWords, KiRoom };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // bez 0/O, 1/I
const CODE_LEN = 5;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return [...b].map(x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

function allowedOrigin(req, env) {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.includes(origin)) return origin;
  if (env.ALLOW_LOCALHOST === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function cors(origin, res) {
  if (!origin) return res;
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = allowedOrigin(req, env);

    if (req.method === 'OPTIONS') return cors(origin, new Response(null, { status: 204 }));
    if (url.pathname === '/api/health') return cors(origin, Response.json({ ok: true }));

    // ---------- Mafia ----------
    if (url.pathname === '/api/rooms' && req.method === 'POST') return createRoom(env.ROOMS, origin);
    let m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) return roomSocket(env.ROOMS, req, origin, m[1]);

    // ---------- Tajniacy ----------
    if (url.pathname === '/api/tj/rooms' && req.method === 'POST') return createRoom(env.TJ_ROOMS, origin);
    m = url.pathname.match(/^\/api\/tj\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) return roomSocket(env.TJ_ROOMS, req, origin, m[1]);
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
