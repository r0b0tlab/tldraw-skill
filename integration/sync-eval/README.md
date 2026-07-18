# tldraw sync-eval harness

Repository-owned **two-client** integration harness for **tldraw / `@tldraw/sync` / `@tldraw/sync-core` 5.2.5**.

This is a **local evaluation server**, not a production multiplayer deployment and not the hosted demo at tldraw.com.

## Pattern

Adapted from the official self-hosted example:

- Upstream: [`templates/simple-server-example`](https://github.com/tldraw/tldraw/tree/v5.2.5/templates/simple-server-example) @ **v5.2.5**
- Docs: https://tldraw.dev/docs/sync
- Server: Fastify + `@fastify/websocket` + **one `TLSocketRoom` per room**
- Persistence: **`SQLiteSyncStorage` + `NodeSqliteWrapper` + `better-sqlite3`** (survives process restart)
- Client: `useSync({ uri })` + matching default schema via shared `createTLSchema`
- Auth (harness-only): `?token=` (or `Authorization: Bearer`) must equal `SYNC_AUTH_TOKEN` (default `harness-ok`) or the socket is closed with `4401`
- Uploads: same token gate; image MIME allowlist; **512 KiB** body cap
- CORS: explicit loopback + optional `SYNC_CORS_ORIGINS` (not open `origin: true`)
- Bind safety: refuses non-loopback `SYNC_HOST` while using the default demo token

## Quick start

```bash
cd integration/sync-eval
npm install
npx playwright install chromium   # once per machine
npm run typecheck
npm run test:unit
npm run test:integration          # boots server + Vite + two Playwright clients
# or: npm test / npm run verify
```

Dev UI (optional):

```bash
npm run dev
# client http://127.0.0.1:5757/?roomId=demo&token=harness-ok&user=Alice&label=A
```

## Tests

`tests/security.unit.test.ts` covers pure helpers (loopback bind, CORS decision, MIME/size constants, token extraction).

`tests/sync.integration.test.ts` verifies:

| Case | What |
|------|------|
| `auth-reject-invalid-token` | HTTP probes + client stay out of `synced` without a valid token |
| `upload-requires-auth` | Unauthenticated / bad-token upload GET/PUT rejected; valid token works |
| `upload-rejects-invalid-media` | Non-allowlisted MIME → 415; oversize → 413 |
| `cors-explicit-not-open` | Evil origin not reflected; loopback origin allowed |
| `reject-non-loopback-default-token` | `SYNC_HOST=0.0.0.0` + default token exits non-zero |
| `two-client-create-and-update` | Client A creates geo shape → B sees it; B moves it → A sees update; presence names if observable |
| `room-isolation` | Shape in room X never appears in room Y |
| `persistence-survives-server-restart` | Shape remains after killing/restarting the Node server on the same `ROOMS_DIR` |

Machine-readable evidence:

- `tests/results/sync/latest.json`
- `tests/results/sync/sync-eval-<timestamp>.json`

Includes timestamps, package versions, shape/record ids, and presence observation flag.

## Layout

```
integration/sync-eval/
  shared/schema.ts      # createTLSchema — must match client defaults
  shared/auth.ts        # token check (dev only)
  shared/security.ts    # CORS/MIME/size/bind safety helpers
  src/server/           # Fastify TLSocketRoom host
  src/client/           # Vite + useSync editor + window.__syncEval harness API
  tests/                # unit + Playwright integration
  SECURITY.md           # deployment honesty
```

## Environment

See `.env.example`. Important vars:

- `SYNC_AUTH_TOKEN` — required token (query or Bearer). Default `harness-ok` is **loopback-only**
- `SYNC_PORT` / `SYNC_HOST` — default host `127.0.0.1`; non-loopback + default token is refused
- `SYNC_CORS_ORIGINS` — optional comma-separated extra allowed browser origins
- `ROOMS_DIR` / `ASSETS_DIR` — SQLite rooms + uploaded blobs
- `VITE_SYNC_HTTP_URL` — client default backend (tests also pass `syncUrl` query)

## License honesty

- This harness’s original glue code is MIT (repo).
- `tldraw`, `@tldraw/sync`, `@tldraw/sync-core` remain under the **tldraw license** (not MIT).
