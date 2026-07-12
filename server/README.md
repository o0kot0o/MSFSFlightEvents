# Flight Events — backend server

A small REST API for event discovery and flight-plan relay. Per `docs/ARCHITECTURE.md`, there is
exactly **one** instance of this — hosted centrally by whoever runs a Flight Events group (you,
for now), not something every pilot runs themselves. Each pilot's `/companion` app is pointed at
its address via the add-on's Settings screen.

## Running it

```powershell
cd server
npm install
npm run build
npm start
```

Or `npm run dev` for a rebuild-on-change loop. Listens on port 4000 by default (override with the
`PORT` environment variable), on all interfaces — it needs to be reachable by other pilots'
companion apps over the network, unlike the companion app itself which only binds to `localhost`.

If pilots outside your own LAN need to reach it, you're responsible for port-forwarding/hosting
it somewhere reachable (a VPS, a cloud box, etc.) — nothing here does that for you.

### Operator env vars

- `ADMIN_TOKEN` — unset by default, which means `DELETE /events/:id` only works for whichever
  companion app created that specific event (via its own `X-Host-Token`, see below). Set this to
  let yourself, as the operator, delete *any* event — e.g. a pilot closed their companion app
  without cleaning up, or posted something you want gone. See "Deleting someone else's event"
  below.
- `MAX_EVENT_AGE_HOURS` — how old an event can get before it's auto-deleted, checked once at
  startup and then every 15 minutes. Defaults to `24`. Set to `0` to disable auto-pruning
  entirely. This is the main answer to "abandoned posts pile up" — most of the time you shouldn't
  need `ADMIN_TOKEN` at all, just leave this running.

## Deleting someone else's event

Normally only the companion app that created an event can delete it (it's the only one holding
that event's `hostToken`, which the server hands out once, at creation). As the operator, set
`ADMIN_TOKEN` before starting the server, then delete any event by id with:

```bash
curl -X DELETE http://<your-server>:4000/events/<event-id> -H "X-Admin-Token: <your ADMIN_TOKEN>"
```

`GET /events` (or your own companion app's Join screen) shows you the ids of whatever's currently
posted. Keep `ADMIN_TOKEN` private — anyone who has it can delete any event on your server.

## API

- `GET /` — liveness + event count.
- `POST /events` — create an event. Body: `{ name, description?, hostName, password?, maxPlayers?, flightPlan }`.
  Returns `{ id, hostToken, event }` — `hostToken` is only returned once, to the creator; keep it
  if you want to delete the event later (Milestone 5+).
- `GET /events` — list active events as `EventSummary[]` (no password, no flight plan — just
  enough to render the Join list: id, name, hostName, route, playerCount, maxPlayers,
  passwordProtected).
- `POST /events/:id/join` — join an event. Body: `{ playerName, password? }`. Returns
  `{ flightPlan, event }` on success; 403 on wrong password, 409 if full, 404 if the event doesn't
  exist.
- `DELETE /events/:id` — remove an event. Requires either an `X-Host-Token` header matching the
  token returned at creation, or an `X-Admin-Token` header matching the server operator's
  `ADMIN_TOKEN` env var (see "Deleting someone else's event" below) — the latter works regardless
  of who created the event.

## Storage

In-memory only, deliberately — events don't survive a restart. This is intentionally minimal per
the original brief ("do not over-engineer the backend initially"); reach for SQLite or similar
only once there's an actual reason to (e.g. surviving restarts matters for real usage). Events
also get auto-pruned once they're older than `MAX_EVENT_AGE_HOURS` (see "Operator env vars"
above), so abandoned posts don't just accumulate forever between restarts either.

## Status

Built and tested end-to-end via direct HTTP calls (create → list → join) on 2026-07-09. Not yet
exercised through the full chain (EFB app → companion → this server) in a live MSFS session —
that's the next thing to verify.
