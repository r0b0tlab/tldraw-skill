# Security & deployment notes — sync-eval harness

## What this is

A **local integration harness** for evaluating tldraw 5.2.5 self-hosted sync (`TLSocketRoom` + SQLite).
It is **not** production multiplayer infrastructure and **not** the hosted tldraw demo backend.

## Hardened local defaults (still not production)

| Control | Harness behavior |
|--------|------------------|
| Upload auth | `PUT`/`GET` `/uploads/:id` require the same token as `/connect` (`?token=` or `Authorization: Bearer`) |
| Upload size | Hard cap `MAX_UPLOAD_BYTES` (512 KiB); oversize → **413** |
| Upload MIME | Allowlist: `image/png`, `image/jpeg`, `image/gif`, `image/webp` only (no SVG/HTML); else **415** |
| CORS | Explicit decision: loopback browser origins + optional `SYNC_CORS_ORIGINS` allowlist. **Not** `origin: true` |
| Listen bind | Default `SYNC_HOST=127.0.0.1`. **Refuses** non-loopback bind while using the default demo token |

## Remaining non-goals / unsafe-if-misused

| Default | Why it exists | Production expectation |
|--------|----------------|------------------------|
| Shared static `SYNC_AUTH_TOKEN` (default `harness-ok`) in query string | Deterministic Playwright auth reject tests | Short-lived room JWTs or session cookies on the WebSocket upgrade; never long-lived secrets in URLs/logs |
| Demo token on loopback only | Local eval convenience | Never expose the demo token on a network interface |
| No TLS | Loopback only | Terminate TLS at reverse proxy / edge |
| No rate limits beyond size/MIME | Keep harness small | Limit WS message rate, rooms per IP, authenticated upload quotas |
| Filesystem `.rooms/*.db` + `.assets` | Prove `SQLiteSyncStorage` restart survival | Managed volume, backups, encryption at rest as required |
| Single Node process room map | Matches official simple-server-example | Horizontal scale needs sticky routing or Durable Objects (see Cloudflare template) |
| Open room creation for any authorized token | Tests create arbitrary room ids | Per-room ACL + authenticated room provisioning |
| Token embedded in asset `src` URLs | So authenticated `GET /uploads` works in the editor | Signed short-lived asset URLs or cookie-authenticated CDN |

## Auth behavior under test

- Connect URL: `/connect/:roomId?sessionId=…&token=…`
- Missing/invalid token → WebSocket close **4401** `unauthorized` (and HTTP `/auth-check`, `/connect-probe` return 401)
- Valid token → `makeOrLoadRoom` + `TLSocketRoom.handleSocketConnect`
- Uploads: same token gate; MIME allowlist + 512 KiB cap

This proves **rejection of unauthorized room/client connection and unauthenticated/invalid uploads** in the harness. It does **not** implement user identity, RBAC, or audit logging.

## Non-loopback fail-closed

```bash
# Fails (default demo token + non-loopback)
SYNC_HOST=0.0.0.0 SYNC_AUTH_TOKEN=harness-ok npm run dev:server

# Allowed only with an explicit non-default token (still not production)
SYNC_HOST=0.0.0.0 SYNC_AUTH_TOKEN="$(openssl rand -hex 24)" npm run dev:server
```

## CORS configuration

- Default: allow missing `Origin` (non-browser) and loopback origins (`http://127.0.0.1:*`, `http://localhost:*`, etc.)
- Extra origins: comma-separated `SYNC_CORS_ORIGINS=https://app.example,https://other.example`
- Arbitrary remote origins are **not** reflected

## Official production paths

From https://tldraw.dev/docs/sync:

1. **Recommended:** clone/deploy [tldraw-sync-cloudflare](https://github.com/tldraw/tldraw-sync-cloudflare) (Durable Objects + R2) and add your own authZ.
2. **Custom JS backend:** integrate `@tldraw/sync-core` using the simple-server-example as a **reference**, then add the deployment concerns above.

## Data isolation

- One authoritative `TLSocketRoom` per sanitized `roomId`
- SQLite file per room under `ROOMS_DIR`
- Room ids sanitized to `[a-zA-Z0-9_-]` to avoid path traversal

## Incident / secrets

- Do not commit `.rooms/`, `.assets/`, `.env`, or `tests/results/` binaries
- Rotate any token that was ever used outside loopback
- Treat uploaded assets as untrusted (CSP on download path is set; MIME/size limits apply; still scan in production)
- Never ship `harness-ok` (or any long-lived query token) as production auth
