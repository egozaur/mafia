# CLAUDE.md

Always respond in Polish (zawsze odpowiadaj po polsku). UI text and code comments are in Polish.

## Project

"Mafia": host screen (`index.html`, TV/laptop) + private player phones (`play.html`). Static frontend, no build step, served at `https://pl3y.pl/mafia/` (GitHub Pages). Server: Cloudflare Worker in `worker/`, one Durable Object per room, deployed by GitHub Actions (`.github/workflows/worker.yml`). Work happens on two machines: **macOS** (Python 3, Node, Chrome; no PowerShell) and **Windows** (no Node or Python; PowerShell 5.1, Edge). Check which one you are on and use the matching command below.

**The Worker `pl3y-server` is shared by all PL3Y games.** `worker/src/tajniacy/`, `worker/src/milion/`, `worker/src/rozejrzyj/`, `worker/src/kurczacze/` and their `worker/test/<game>.suite.js` belong to the other games and are documented in their own CLAUDE.md (sibling folders `../tajniacy`, `../milion`, `../rozejrzyj`, `../kurczacze`); leave them alone when working on Mafia. Shared files: `worker/src/index.js` (routing for all games, origin allow-list `ALLOWED_ORIGINS`, localhost only with `ALLOW_LOCALHOST="true"` or a test token, the auth gate and per-IP rate limits) and `worker/wrangler.toml` (DO bindings; a new DO class needs a new `[[migrations]]` tag).

## Auth, limits, TTL (shared Worker)

- `worker/src/auth.js`: password check (secret `PL3Y_PASSWORD`) → HMAC token (`PL3Y_TOKEN_SECRET`; kinds `d` 30 min, `p` 12 h, `t` test 1 h; test token from `PL3Y_TEST_SECRET`). `index.js` requires a valid token for every `/api/*` route except `/api/health` and `/api/auth/login` according to `AUTH_MODE` (`off`/`optional`/`required`; unset or invalid = `required`, fail closed). WebSocket token comes as `?tok=`. See `../egozaur.github.io/CLAUDE.md` for the client contract.
- `worker/src/limits.js`: per-IP HTTP limits (`HTTP_LIMITS`: login 8/min, create room 10/min, ws join 30/min, writes 30/min, alias admin 20/min, reads 120/min; in-memory per Worker instance, so soft limits) and per-socket WebSocket limit (burst 40, then 20 msg/s; 100 strikes in a row close the socket with 4429). Every room's `webSocketMessage` starts with `limitMessage`. `ttlFor`/`ENDED_TTL`: a finished game (Mafia/Milion `phase==='end'`, Kurczacze/Tajniacy duet `game.phase==='end'`) keeps its room only 30 min after the last activity. Tajniacy with captains has no server-side end of game, so it keeps its 7-day TTL.
- `RzWords` keeps at most `MAX_ROUNDS` (5000) raw rounds; older ones are deleted, the `agg:*` counters stay.
- Tests: `worker/test/auth.suite.js` (part of `engine.test.js`).

## Architecture

- `worker/src/engine/*`: pure game engine, no I/O (time, RNG, token generator come in `ctx`). `machine.js` = phase machine (`apply`, `tick`); modules for roles, balance, lobby, deal, night, vote, victory, CHAOS events.
- `worker/src/engine/view.js` is the **only** place that decides what leaves the server: `viewForScreen` (TV, never roles) and `viewForPlayer` (own role only while the envelope is open, own night task, own notes). Every new state field must be filtered here; tests assert no leaks.
- `worker/src/room.js`: DO `Room` (plain class, runtime-agnostic): WebSocket hibernation, tokens (`hostToken`, per-player, one-time rebind codes), action-id dedup, alarms for timers. Clones state, applies the action, commits only on success. Routes: `POST /api/rooms`, `GET /api/rooms/:code/ws`.
- `js/net.js`: client connection (WebSocket or local SharedWorker), reconnect with backoff, heartbeat, pending actions re-sent after reconnect.
- `js/host/*` TV views (wizard, lobby, board, phases, results); `js/player/*` phone views (join, envelope, night, screens). String templates; regions updated by `setHTML()` only when HTML changes, so CSS animations don't restart.
- `js/config.js`: `API` (Worker URL). **Empty = local mode**: `dev/server.js` runs the same `Room` in a SharedWorker, so the game works across tabs without Cloudflare.
- Both pages load the shared password gate `/auth.js` (`play.html` with `data-no-idle`) and the PL3Y app meta tags (see `../egozaur.github.io/CLAUDE.md`). In the home-screen app the phone header gets „← Lobby” (`.tolobby`, `data-act="home"`, only when `APP`); the player token stays in localStorage, so rescanning resumes the game.

## Testing

- Mafia tests: `worker/test/suite.js` (engine), `worker/test/room.suite.js` (room protocol). CI runs `node --test worker/test/engine.test.js` (all games' suites). Locally: `node --test worker/test/engine.test.js` (same as CI), or `worker/test/run.html` in headless Chrome with `--allow-file-access-from-files` → `RESULT:PASS`.
- Solo sandbox: `dev/podglad.html` (host + N phones, bots, `?demo` plays a whole game). `?local=1` forces local mode; the host appends `&local=1` to player links and stores its room under `mafia_host_local`.
- E2E: run `python3 -m http.server 8080` in `mafia/` (`dev/serve.ps1` is the Windows version; keep it ASCII-only, PS 5.1 reads it as ANSI), open `http://localhost:8080/dev/e2e.html?n=7&games=2`. Drives real buttons in iframes and checks the DOM for role leaks. Run in **real time** (headless Chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new, `--enable-logging=stderr`, read `E2E RESULT`), not `--virtual-time-budget` (false timeouts). `?stopAt=<phase>&view=host|phone` freezes a phase for screenshots.
