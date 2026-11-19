// Worker PL3Y Mafia: tworzenie pokojów i przekazywanie połączeń WebSocket do Durable Objects.
import { Room } from './room.js';

export { Room };

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
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = allowedOrigin(req, env);

    if (req.method === 'OPTIONS') return cors(origin, new Response(null, { status: 204 }));

    if (url.pathname === '/api/health') return cors(origin, Response.json({ ok: true }));

    // POST /api/rooms → { code, hostToken }
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      if (!origin) return new Response('Forbidden', { status: 403 });
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code }) });
        if (res.status === 409) continue;
        return cors(origin, new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
      }
      return cors(origin, new Response('Brak wolnych kodów', { status: 503 }));
    }

    // GET /api/rooms/:code/ws → WebSocket do pokoju
    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      if (!origin) return new Response('Forbidden', { status: 403 });
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return new Response('Bad code', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(req);
    }

    return new Response('Not found', { status: 404 });
  },
};
