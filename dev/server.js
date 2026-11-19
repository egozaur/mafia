// Lokalny serwer deweloperski: ta sama klasa Room co na Cloudflare, uruchomiona w SharedWorkerze
// z atrapą ctx (storage, gniazda, alarmy). Karty przeglądarki łączą się przez MessagePort.
// Działa tylko, gdy w js/config.js API jest puste (albo z ?local=1). Stan żyje, dopóki otwarta jest choć jedna karta.
import { Room } from '../worker/src/room.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();          // code -> { room, ctx }
const conns = new Map();          // `${portId}:${cid}` -> FakeWS
let portSeq = 0;

class FakeWS {
  constructor(port, cid, room) { this.port = port; this.cid = cid; this.room = room; this.open = true; this.att = null; this.seen = Date.now(); }
  send(data) { if (this.open) this.port.postMessage({ t: 'msg', cid: this.cid, data }); }
  close(code, reason) {
    if (!this.open) return;
    this.open = false;
    this.port.postMessage({ t: 'close', cid: this.cid, code, reason });
  }
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return this.att == null ? null : structuredClone(this.att); }
}

function makeRoom() {
  const store = new Map();
  const sockets = new Set();
  let timer = null;
  let queue = Promise.resolve();
  const holder = {};
  const ctx = {
    storage: {
      get: async k => (store.has(k) ? structuredClone(store.get(k)) : undefined),
      put: async (k, v) => { store.set(k, structuredClone(v)); },
      deleteAll: async () => store.clear(),
      setAlarm: async at => {
        clearTimeout(timer);
        timer = setTimeout(() => run(() => holder.room.alarm()), Math.max(0, Math.min(at - Date.now(), 2 ** 31 - 1)));
      },
    },
    acceptWebSocket: ws => sockets.add(ws),
    getWebSockets: () => [...sockets].filter(w => w.open),
    setWebSocketAutoResponse() {},
  };
  // Durable Object przetwarza zdarzenia po kolei — tu kolejka obietnic.
  const run = fn => (queue = queue.then(fn).catch(e => console.error(e)));
  holder.room = new Room(ctx, {});
  return { room: holder.room, run, sockets };
}

function newCode() {
  let c;
  do { c = Array.from(crypto.getRandomValues(new Uint8Array(5)), x => ALPHABET[x % 32]).join(''); } while (rooms.has(c));
  return c;
}

function closeConn(key) {
  const ws = conns.get(key);
  if (!ws) return;
  conns.delete(key);
  ws.open = false;
  const r = rooms.get(ws.room);
  if (r) { r.sockets.delete(ws); r.run(() => r.room.webSocketClose(ws)); }
}

// Karty zamknięte bez pożegnania: brak pingów przez 12 s = rozłączone.
setInterval(() => {
  const now = Date.now();
  for (const [key, ws] of conns) if (now - ws.seen > 12000) { ws.close(1006, 'timeout'); closeConn(key); }
}, 3000);

onconnect = e => {
  const port = e.ports[0];
  const pid = ++portSeq;
  port.onmessage = async ({ data: m }) => {
    const key = `${pid}:${m.cid}`;
    if (m.t === 'create') {
      const code = newCode();
      const r = makeRoom();
      rooms.set(code, r);
      const out = await r.room.init(code);
      port.postMessage({ t: 'created', rid: m.rid, ...out });
    } else if (m.t === 'connect') {
      const code = String(m.code || '').toUpperCase();
      const r = rooms.get(code);
      const ws = new FakeWS(port, m.cid, code);
      conns.set(key, ws);
      port.postMessage({ t: 'open', cid: m.cid });
      if (!r) {
        ws.send(JSON.stringify({ t: 'error', code: 'noroom', err: 'Taki pokój nie istnieje (lokalny serwer: pokoje znikają po zamknięciu wszystkich kart).' }));
        ws.close(4404, 'noroom');
        conns.delete(key);
        return;
      }
      r.run(async () => r.room.attach(ws, await r.room.load()));
    } else if (m.t === 'send') {
      const ws = conns.get(key);
      if (!ws || !ws.open) return;
      ws.seen = Date.now();
      const r = rooms.get(ws.room);
      r.run(() => r.room.webSocketMessage(ws, m.data));
    } else if (m.t === 'close') {
      closeConn(key);
    }
  };
  port.start();
};
