// Połączenie z serwerem gry: WebSocket (Cloudflare) albo MessagePort (lokalny SharedWorker).
// Automatyczne ponowne łączenie z backoffem, heartbeat, kolejka akcji z identyfikatorami (serwer deduplikuje).
import { API } from './config.js';

export const LOCAL = !API || new URLSearchParams(location.search).has('local');

// ---------- transport lokalny ----------
let shared = null, sharedSeq = 0;
const sharedHandlers = new Map();
function sharedPort() {
  if (shared) return shared;
  const w = new SharedWorker(new URL('../dev/server.js', import.meta.url), { type: 'module', name: 'mafia-dev' });
  shared = w.port;
  shared.onmessage = ({ data }) => { const h = sharedHandlers.get(data.cid ?? data.rid); if (h) h(data); };
  shared.start();
  return shared;
}
class LocalSocket {
  constructor(code) {
    this.cid = 'c' + (++sharedSeq) + Math.random().toString(36).slice(2, 6);
    this.readyState = 0;
    const port = sharedPort();
    sharedHandlers.set(this.cid, m => {
      if (m.t === 'open') { this.readyState = 1; this.onopen && this.onopen(); }
      else if (m.t === 'msg') this.onmessage && this.onmessage({ data: m.data });
      else if (m.t === 'close') this._closed(m.code);
    });
    port.postMessage({ t: 'connect', cid: this.cid, code });
    addEventListener('pagehide', () => this.close());
  }
  send(data) { if (this.readyState === 1) shared.postMessage({ t: 'send', cid: this.cid, data }); }
  close() { if (this.readyState > 1) return; shared.postMessage({ t: 'close', cid: this.cid }); this._closed(1000); }
  _closed(code) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    sharedHandlers.delete(this.cid);
    this.onclose && this.onclose({ code });
  }
}

// ---------- tworzenie pokoju ----------
export async function createRoom() {
  if (LOCAL) {
    const port = sharedPort();
    const rid = 'r' + (++sharedSeq);
    return new Promise(res => { sharedHandlers.set(rid, m => { sharedHandlers.delete(rid); res(m); }); port.postMessage({ t: 'create', rid }); });
  }
  const r = await fetch(API + '/api/rooms', { method: 'POST' });
  if (!r.ok) throw new Error('Nie udało się założyć pokoju (' + r.status + ').');
  return r.json();
}

// ---------- połączenie ----------
const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export class Conn {
  // opts: { code, hello: () => object, onMessage(msg), onStatus(status) }
  constructor(opts) {
    this.o = opts;
    this.ws = null;
    this.status = 'connecting';
    this.retry = 0;
    this.pending = new Map();      // id -> { msg, resolve, reject, timer }
    this.skew = 0;                 // serwer - klient [ms]
    this.lastMsg = 0;
    this.stopped = false;
    this.connect();
    this.beat = setInterval(() => this.heartbeat(), LOCAL ? 3000 : 15000);
    addEventListener('online', () => this.kick());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick(); });
  }

  setStatus(s) { if (this.status !== s) { this.status = s; this.o.onStatus && this.o.onStatus(s); } }

  connect() {
    if (this.stopped) return;
    this.setStatus(this.retry ? 'reconnecting' : 'connecting');
    const ws = LOCAL ? new LocalSocket(this.o.code) : new WebSocket(API.replace(/^http/, 'ws') + '/api/rooms/' + encodeURIComponent(this.o.code) + '/ws');
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastMsg = Date.now();
      this.raw(this.o.hello());
      // ponowienie akcji, na które nie przyszło potwierdzenie
      for (const p of this.pending.values()) this.raw(p.msg);
    };
    ws.onmessage = e => {
      this.lastMsg = Date.now();
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') return;
      if (m.t === 'state' || m.t === 'welcome' || m.t === 'lobby') this.setStatus('online');
      if (m.t === 'state' && m.now) this.skew = m.now - Date.now();
      if (m.t === 'ack' && m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        m.ok ? p.resolve(m.data) : p.reject(new Error(m.err || 'Błąd.'));
        return;
      }
      if (m.t === 'error' && (m.code === 'noroom')) this.stop('noroom');
      this.o.onMessage(m);
    };
    ws.onclose = e => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (e && (e.code === 4404)) return this.stop('noroom');
      if (e && (e.code === 4401)) return this.stop('revoked');
      if (this.stopped) return;
      this.setStatus('reconnecting');
      const delay = Math.min(8000, 400 * 2 ** this.retry++) * (0.75 + Math.random() * 0.5);
      clearTimeout(this.rt);
      this.rt = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }

  // natychmiastowa próba po powrocie sieci / karty
  kick() {
    if (this.stopped) return;
    if (!this.ws || this.ws.readyState > 1) { clearTimeout(this.rt); this.retry = 0; this.connect(); }
    else this.heartbeat();
  }

  heartbeat() {
    if (!this.ws || this.ws.readyState !== 1) return;
    const limit = LOCAL ? 9000 : 40000;
    if (Date.now() - this.lastMsg > limit) { try { this.ws.close(); } catch {} this.ws.onclose && this.ws.onclose({ code: 1006 }); return; }
    this.raw({ t: 'ping' });
  }

  raw(obj) {
    if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; }
    return false;
  }

  // Akcja gry → Promise z odpowiedzią serwera.
  act(action) {
    const id = rid();
    const msg = { t: 'act', id, action };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Brak połączenia z serwerem. Spróbuj ponownie.')); }, 20000);
      this.pending.set(id, { msg, resolve, reject, timer });
      this.raw(msg);
    });
  }

  send(obj) { return this.raw(obj); }

  reconnectNow() { if (this.ws) { try { this.ws.close(); } catch {} } this.retry = 0; this.stopped = false; this.ws = null; this.connect(); }

  stop(reason) {
    this.stopped = true;
    clearTimeout(this.rt);
    this.setStatus(reason || 'closed');
    if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch {} }
  }

  now() { return Date.now() + this.skew; }
}
