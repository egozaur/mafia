# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond to the user in Polish (zawsze odpowiadaj po polsku). UI text and code comments are in Polish.

## Project

"Mafia" is a PL3Y party game: a host screen (TV/laptop, `index.html`) and private player phones (`play.html`). Unlike the other PL3Y games it has a **server**: a Cloudflare Worker with one Durable Object per room (`worker/`). The frontend is static (GitHub Pages, served at `https://pl3y.pl/mafia/`, no build step); the Worker is deployed by GitHub Actions (`.github/workflows/worker.yml`, secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). There is no Node or Python on the dev machine.

## Architecture

- `worker/src/engine/*` — pure game engine, no I/O (time, RNG and token generator come in `ctx`). `machine.js` is the phase machine (`apply`, `tick`), with modules for roles, balance, lobby, deal, night, vote, victory and CHAOS events.
- `worker/src/engine/view.js` is the **only** place that decides what leaves the server: `viewForScreen` (host/TV, never roles) and `viewForPlayer` (own role only while the envelope is open, own night task, own notes). Any new state field must be filtered here. Tests assert no leaks.
- `worker/src/room.js` — Durable Object `Room` (plain class, runtime-agnostic): WebSocket hibernation, tokens (`hostToken`, per-player tokens, one-time rebind codes), dedup of action ids, alarms for timers. It clones state, applies the action and commits only on success.
- `worker/src/index.js` — `POST /api/rooms`, `GET /api/rooms/:code/ws`, origin allow-list (`ALLOWED_ORIGINS`, plus localhost while `ALLOW_LOCALHOST="true"`).
- **Shared PL3Y server**: the Worker is `pl3y-server` (`https://pl3y-server.pl3y.workers.dev`) and also hosts Tajniacy: `worker/src/tajniacy/room.js` (DO `TjRoom`: the host page is the source of truth and pushes `{t:'set', game, cfg}`; captains connect with per-team tokens and receive the board; one room serves many games, TTL 7 days) and `worker/src/tajniacy/saves.js` (DO `TjSaves`, singleton, shared saved-games list). Routes: `POST /api/tj/rooms`, `GET /api/tj/rooms/:code/ws`, `GET /api/tj/saves`, `PUT|DELETE /api/tj/saves/:id`. The Tajniacy client lives in the `egozaur/tajniacy` repo; keep both sides of the protocol in sync. Future PL3Y games with a server go here too.
- `js/net.js` — client connection (WebSocket or local SharedWorker), reconnect with backoff, heartbeat, pending actions re-sent after reconnect.
- `js/host/*` — TV views (wizard, lobby, board, phases, results); `js/player/*` — phone views (join, envelope, night, screens). Views are string templates; regions are updated with `setHTML()` only when the HTML changes, so CSS animations don't restart.
- `js/config.js` — `API` (Worker URL). **Empty = local mode**: `dev/server.js` runs the same `Room` class in a SharedWorker, so the game works across tabs of one browser without Cloudflare.
- `index.html` loads the shared PL3Y password gate `/auth.js`; `play.html` deliberately does not (players come from a QR code; tokens protect access).
- Both pages carry the shared PL3Y app meta tags (see the lobby's CLAUDE.md). In the home-screen app there is no browser Back button, so on the phone the header logo becomes a button (`data-act="home"`, only when `APP`) that returns to `/` after a confirm; the player token stays in localStorage, so rescanning the code resumes the game.

## Testing

- Engine + room protocol: `worker/test/suite.js`, `worker/test/room.suite.js`, Tajniacy server: `worker/test/tajniacy.suite.js`. CI runs `node --test worker/test/engine.test.js`. Locally open `worker/test/run.html` in headless Edge with `--allow-file-access-from-files` (prints `RESULT:PASS`).
- Sandbox for solo testing: `dev/podglad.html` (host + N phones, bots, `?demo` plays a whole game). Pages forced into local mode with `?local=1`; the host then appends `&local=1` to player links and stores its room under `mafia_host_local`.
- End-to-end UI: start `dev/serve.ps1` (PowerShell static server, keep it ASCII-only — PS 5.1 reads it as ANSI), open `http://localhost:8080/dev/e2e.html?n=7&games=2`. It drives the real buttons in iframes (host + N phones), plays full games and checks the DOM for role leaks. Run it in **real time** (headless Edge with `--enable-logging=stderr`, read `E2E RESULT`), not with `--virtual-time-budget`: virtual time skews the page clocks against the SharedWorker and gives false timeouts. `?stopAt=<phase>&view=host|phone` freezes on a phase for screenshots.
