# Sync and collaboration

## Official stack

| Package | Role |
|---|---|
| `@tldraw/sync` | Client hooks (`useSync`, demo helpers) |
| `@tldraw/sync-core` | Server room (`TLSocketRoom`), storage adapters |

**Not** the default: inventing `@tldraw/yjs` or claiming Yjs is the primary engine. Third-party bridges (e.g. Liveblocks, custom Yjs) may exist; treat them as optional integrations, not core docs.

Sync is **not** a general CRDT: the server holds the authoritative document and reconciles client diffs.

## Client sketch

```ts
import { Tldraw } from 'tldraw'
import { useSync } from '@tldraw/sync'

const store = useSync({
  uri: `wss://your-backend/connect/${roomId}`,
  assets: myAssetStore,
})

return <Tldraw store={store} />
```

`useSyncDemo` / hosted demo: **prototyping only**.

## Server responsibilities

1. **One** `TLSocketRoom` per document globally (e.g. Durable Object per room).
2. Persist via `SQLiteSyncStorage` (recommended) or `InMemorySyncStorage` + snapshots.
3. Asset upload/download service (R2/S3/etc.).
4. Optional bookmark unfurl service.
5. AuthZ: room membership, rate/size limits.
6. Schema passed to the room must match clients (**including custom shapes/bindings**).

Cloudflare template: https://github.com/tldraw/tldraw-sync-cloudflare
Also: monorepo `templates/sync-cloudflare`, `simple-server-example`, `socketio-server-example`.

## Presence and UX

- Cursors, cursor chat, user following, people menu.
- Custom user data / presence records with matching schema.
- Private content patterns from examples—document policy explicitly.
- Distinguish document vs presence scopes.

## Deployment concerns

- Coordinated deploys when schema/migrations change (clients + servers).
- Hibernation platforms: `onSessionSnapshot` / `handleSocketResume` / `clientTimeout` patterns.
- Restart recovery tests for durable storage.
- Never ship multiplayer without auth in production.

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | Client store wiring, server room uniqueness, schema modules |
| Implement | Official template first; add auth/assets/unfurl |
| Verify | Two-client convergence; restart persistence; unauthorized access rejected; reconnect |

## Feature map

collaboration, cursors, cursor-chat, user-following, plus sync docs.

## Sources

- https://tldraw.dev/docs/sync
- https://tldraw.dev/docs/collaboration
- https://tldraw.dev/sdk-features/collaboration
- https://tldraw.dev/starter-kits/multiplayer
- Reference: `TLSocketRoom`, `useSync`, `SQLiteSyncStorage`
