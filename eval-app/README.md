# tldraw skill evaluation app

Vite + React + TypeScript app for **Stage C** of the tldraw Hermes skill.

## Stack

- Node 22.x
- tldraw **5.2.5**
- `@tldraw/driver` 5.2.5
- `@tldraw/mermaid` 5.2.5
- `@tldraw/sync` 5.2.5 (compile-time example only)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run typecheck` | `tsc -b` |
| `npm run build` | production build (bridge disabled via `import.meta.env.DEV === false`) |
| `npm run test` | bridge gate unit tests + prod safety scan + rendered ErrorBoundary fallback |
| `npm run verify` / `e2e` | Playwright browser harness; writes fixtures + artifacts |
| `npm run benchmark` | Fresh-page 3,999-shape local Chromium baseline; writes `tests/results/performance/latest.json` |
| `npm run visual:scenarios` | Build and capture flowchart, architecture, sequence, mind-map, and annotated-image scenarios with binding/overlap gates |
| `npm run dev` | local Vite dev server |

## Verify gates (machine-readable in `artifacts/eval-status.json`)

- Real `@tldraw/driver` create → select → transform → dispose (dev + prod)
- Custom shape props migrations **registered and exercised**: legacy `name` → `label` via public `schema.migrateStoreSnapshot` (`com.tldraw.shape.eval-badge`)
- Official `.tldr` round-trip: serialize → `parseTldrawJsonFile` → load into a clean store with the app schema → instantiate a fresh public `Editor`; assert tracked shape IDs/types, binding endpoints, and non-empty image `altText` (`parseStoreSemantics`, `cleanSnapshotSemantics`, `cleanEditorSemantics`, `liveEditorInvariants`)
- Standalone `getSnapshot`/`loadSnapshot`, `store.listen` + cleanup, `editor.run`, undo/redo, readonly rejection
- `persistenceKey` survives page reload and second-tab load (`?pk=…`)
- A11y: keyboard focus path, aria descriptor, reduced-motion CSS, responsive panel, status text ≥12px + contrast ≥4.5:1
- `hideUi` runtime impact: chrome hides, tool shortcut (`d` → draw) still works on 5.2.5, UI restored (not left hidden)
- No console errors; production bridge absent
- Custom ErrorBoundary fallback renders on an intentional isolated component failure
- Five representative visual workflows render in real tldraw with all arrows bound, zero semantic-node overlaps, and durable full-resolution visual review under `tests/reviews/`

## Safety

`src/bridge/hermes-dev-bridge.ts` is copied from `skills/tldraw/templates/hermes-dev-bridge.ts`.
It mounts only when **DEV** and host is **localhost / 127.0.0.1 / ::1**.

## Not runtime verified

Within this eval app only:

- Multiplayer `@tldraw/sync` (no server)
- AI agent / starter kits (no provider credentials)
- Live cross-tab mutation sync (second-tab **load** of same IndexedDB key is verified; concurrent BroadcastChannel edits are not asserted)

Repository-owned sync and credential-free agent/starter harnesses live under `integration/`. Provider-backed AI execution remains explicitly unverified without credentials.
