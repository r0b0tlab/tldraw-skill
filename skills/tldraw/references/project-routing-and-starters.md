# Project routing and starters

## Decide project class first

| Class | Signals | First move |
|---|---|---|
| **Existing app** | `package.json` with React app, no or partial tldraw | Add `tldraw`, CSS, sized container; preserve framework |
| **Greenfield app** | Empty or new repo, wants full product | `npm create tldraw@latest` or kit matching use case |
| **Artifact only** | Need `.tldr`/PNG/SVG, not a product | Minimal Vite/React app + Editor serialize pipeline |
| **Upstream monorepo** | Inside `tldraw/tldraw` | Follow the repository agent instructions (Yarn 4, targeted tests) |

Run:

```bash
python3 ${HERMES_SKILL_DIR}/scripts/inspect_project.py [dir] --json
```

## Scaffolding

```bash
npm create tldraw@latest
```

Also: GitHub `tldraw` org templates and monorepo `templates/*`.

### Official starter kits (docs)

| Kit | When |
|---|---|
| [workflow](https://tldraw.dev/starter-kits/workflow) | Node graphs, automation, executable connections |
| [chat](https://tldraw.dev/starter-kits/chat) | Sketch/annotate before AI chat |
| [agent](https://tldraw.dev/starter-kits/agent) | Agent reads/manipulates canvas |
| [image-pipeline](https://tldraw.dev/starter-kits/image-pipeline) | Visual AI image pipelines |
| [branching-chat](https://tldraw.dev/starter-kits/branching-chat) | Conversation trees on canvas |
| [multiplayer](https://tldraw.dev/starter-kits/multiplayer) | Self-hosted sync (e.g. Cloudflare DO) |
| [shader](https://tldraw.dev/starter-kits/shader) | WebGL backgrounds reacting to shapes |

**When not to start from a kit:** plain whiteboard embed, single custom shape, or simple persistence—use `tldraw` quick start instead.

Starter **application** code may be MIT-licensed in places, but the **SDK dependency** remains under the tldraw license. Re-check each kit's notice.

### Repair scaffold dependency drift

Do not use `--force` as the first response to a stale starter. Inspect the generated `package.json`, lockfile, and npm peer-conflict report; align the smallest conflicting package to an actually published compatible version; then run a clean install, typecheck, and production build.

Dated evidence: on 2026-07-17, the `tldraw@5.2.5` agent starter declared `@cloudflare/workers-types` `^4`, while `wrangler@4.112` required a compatible `^5.20260714.1`; aligning the types package to `^5.20260714.1` produced a successful build. Re-inspect current metadata before applying that exact pin.

### Monorepo templates (repo)

`agent`, `branching-chat`, `chat`, `image-pipeline`, `nextjs`, `shader`, `simple-server-example`, `socketio-server-example`, `sync-cloudflare`, `vite`, `vue`, `workflow` — verify names against current repo; Vue template does not make Vue a first-class SDK surface (React is the public model).

## Integration shape

| Choice | Use |
|---|---|
| `<Tldraw>` | Full defaults: shapes, tools, UI |
| `<TldrawEditor>` + optional `<TldrawUi>` | Exploded/minimal (see “Sublibraries” example) |
| `hideUi` | Hides default UI chrome. On installed 5.2.5, built-in keyboard shortcuts still run; verify the target version instead of assuming UI visibility controls shortcut registration |

### Hard requirements for embeds

```tsx
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw persistenceKey="my-app" colorScheme="system" />
    </div>
  )
}
```

- Import **`tldraw/tldraw.css`**.
- Give the container an explicit size (fixed inset, or width/height 100% chain).
- Client-only rendering: do not SSR the editor without a documented client boundary.
- Static assets (icons/fonts): self-host when you need offline or to reduce third-party requests; see assets + license docs.
- Align React 18/19 with package peer range.

## Package manager / monorepo detection

Detect npm / pnpm / Yarn / Bun from lockfiles. In monorepos, identify workspace root vs package root before installing. Align every `@tldraw/*` version with `tldraw`.

## Demo multiplayer vs production

`useSyncDemo` is for **prototyping** only. Production: self-host via `@tldraw/sync` + `@tldraw/sync-core` (Cloudflare template or custom WebSocket backend). See `sync-collaboration.md`.

## Inspect → implement → verify

1. **Inspect:** framework, PM, versions, existing canvas code.
2. **Implement:** correct class path; CSS; container; license key env for production builds.
3. **Verify:** `typecheck`/`build`; browser load without console errors; persistence/tab sync if `persistenceKey` used.

## Canonical sources

- Quick start: https://tldraw.dev/quick-start
- Installation: https://tldraw.dev/installation
- Starters: https://tldraw.dev/starter-kits/overview
- CLI: `create-tldraw` package / `npm create tldraw@latest`
