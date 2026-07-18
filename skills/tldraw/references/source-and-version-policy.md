# Source and version policy

## Precedence (always)

1. **Project inspection** — lockfile-resolved versions of `tldraw` and every `@tldraw/*` package, React peers, custom schema entrypoints.
2. **Installed package surface** — TypeScript types, `node_modules/tldraw/DOCS.md`, `RELEASE_NOTES.md` when present.
3. **Release notes** for the interval between installed and target versions (`https://tldraw.dev/releases/…`, `llms-releases.txt`). Treat minor releases as potentially breaking until notes prove otherwise.
4. **Current official docs** — `https://tldraw.dev/llms.txt`, feature pages, long-form `/docs/*`.
5. **Official examples and starter kits** — for multi-file patterns.
6. **Repository `main`** — only when contributing upstream or when current stable docs explicitly point there.

Never import `@internal` symbols or cast through `any` to paper over an API gap.

## How to re-check sources

```bash
python3 ${HERMES_SKILL_DIR}/scripts/fetch_official_docs.py --corpus index
python3 ${HERMES_SKILL_DIR}/scripts/fetch_official_docs.py --corpus docs
# optional: examples | releases (not full by default)
```

Record URL, fetch time, and SHA-256 when updating `${HERMES_SKILL_DIR}/references/source-manifest.json`.

## Package alignment

- Install **`tldraw`** for the full SDK (shapes + UI). Do not recommend legacy `@tldraw/tldraw`.
- Keep `tldraw`, `@tldraw/editor`, `@tldraw/store`, `@tldraw/tlschema`, `@tldraw/sync`, `@tldraw/sync-core`, `@tldraw/driver`, `@tldraw/mermaid`, etc. on the **same published version** unless release notes document a deliberate mix.
- Peer React: current packages advertise `^18.2.0 || ^19.2.1` (verify installed `package.json`).
- Upstream monorepo: Yarn 4 + Node `>=22.12.0` per repo `AGENTS.md` — different from app-consumer workflows.

## Anti-hallucination checklist

Use as a pre-merge grep list. Names may appear only in labeled pitfalls/negative tests.

| Pattern to reject | Current public guidance |
|---|---|
| `npm i @tldraw/tldraw` | `npm install tldraw` |
| Canvas2D / rough.js pipeline as the main canvas | DOM + React HTML/CSS shapes |
| `type: 'rectangle' \| 'circle'` | `type: 'geo'`, `props.geo: 'rectangle' \| 'ellipse' \| …` |
| `props: { text: '…' }` | `props: { richText: toRichText('…') }` |
| `id: 'box1'` | `createShapeId()` / `createShapeId('box1')` |
| Arrow “stuck” by geometry only | Create/update **bindings** via public APIs |
| `editor.store.getSnapshot()` / `deserialize` | `import { getSnapshot, loadSnapshot } from 'tldraw'` |
| `exportToBlob` / inventing `editor.exportAs` | `editor.toImage`, `toImageDataUrl`, `getSvgString`, `getSvgElement` |
| `editor.batch` | `editor.run` |
| `setSelectedShapeIds` | `setSelectedShapes` |
| `@tldraw/yjs`, `useYjsStore` | `@tldraw/sync` / `useSync` (optional third-party Liveblocks/Yjs bridges are not the default) |
| “sync is a CRDT” | Authoritative server document + diffs (not a general CRDT) |
| `persistenceKey` → localStorage | IndexedDB + cross-tab |
| `darkMode` / `theme` / `forceDarkMode` / stale `inferDarkMode` | `colorScheme` prop or `editor.user.updateUserPreferences({ colorScheme })` |
| `hideWatermark` prop | Watermark follows license key type |
| MIT/Apache “open source SDK” | Source-available **tldraw license**; production key required |
| Invented revenue thresholds / fake env telemetry flags | Re-read current license pages; do not invent pricing |
| Raw Python record assembly as “valid `.tldr`” | Live `Editor` + `serializeTldrawJson` / `parseTldrawJsonFile` |
| Structural JSON key checks as semantic validation | App `TLSchema` parse + reload |

Primary anti-hallucination source: [20 things I wish AI chatbots knew about tldraw](https://tldraw.dev/blog/20-things-i-wish-ai-chatbots-knew-about-tldraw) (verify date when loading).

## Document vs session vs presence

| Scope | Typical contents | Sync notes |
|---|---|---|
| `document` | pages, shapes, bindings, assets | Shared durable state |
| `session` | instance/page UI state | Usually local |
| `presence` | cursors, follow, ephemeral user state | Ephemeral multiplayer |

Filter `store.listen` by source/scope; use documented remote-merge helpers when integrating low-level sync—do not invent merge APIs.

## Migration posture

1. Detect installed and target versions.
2. Prefer official **tldraw-migrate** skill + release-note migration blocks over ad-hoc rewrites.
3. Align all package versions, then typecheck after each migration category.
4. Reject resurrection of removed APIs as “compatibility shims” unless the installed version still exports them.

## Verify

- [ ] `inspect_project.py` versions match advice given
- [ ] Grep diff for stale patterns in the table
- [ ] Any main-branch citation justified
- [ ] License claims cite current pages, including hobby data-collection **conflict** (see source-manifest)
