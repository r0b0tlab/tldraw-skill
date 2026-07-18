# Editor, store, state, and Driver

## Mental model

- **`Editor`** — primary control surface for document mutations, selection, camera, tools, export.
- **`Store`** — reactive record database (shapes, pages, assets, bindings, instance state, …).
- **Signals (`@tldraw/state`)** — `atom` / `computed` / reactors; React bindings via `track`, `useValue`, etc.
- **History** — undo/redo; batch with `editor.run` (options for `history: 'ignore'`, locked shapes).
- **Side effects** — lifecycle hooks around record create/change/delete.
- **Events / input / ticks** — tool state machines, pointer/keyboard, animation frames.
- **Camera & coordinates** — page vs screen space; `pageToScreen` / inverse when driving input.
- **`@tldraw/driver`** — imperative input simulation and selection transforms on a live Editor.

## Access patterns

```ts
// onMount
<Tldraw onMount={(editor) => { /* ... */ }} />

// inside tree
const editor = useEditor()
```

Reactive UI:

```ts
import { track, useEditor } from 'tldraw'

export const Count = track(() => {
  const editor = useEditor()
  return <div>{editor.getSelectedShapeIds().length}</div>
})
```

## Transactions

```ts
editor.run(() => {
  editor.createShapes(shapes)
  editor.setSelectedShapes(shapes.map((s) => s.id))
})
```

Reject stale `editor.batch` / `setSelectedShapeIds` unless installed types still export them.

## Snapshots (not `.tldr` files)

```ts
import { getSnapshot, loadSnapshot } from 'tldraw'

const snapshot = getSnapshot(editor.store)
loadSnapshot(editor.store, snapshot)
```

Standalone functions + **store** argument. For files, use `serializeTldrawJson` / `parseTldrawJsonFile` (data-files reference).

## Store scopes

- **document** — durable shared records
- **session** — per-instance UI
- **presence** — multiplayer ephemeral

Use `store.listen` filters; do not invent private record APIs.

## Side effects & permissions

- `before`/`after` create/update/delete for validation, meta, derived data
- Readonly mode and permission examples for unauthorized edits
- Prefer documented side-effect registration over monkey-patching store methods

## Camera & animation

- `setCamera`, `zoomToBounds`, `zoomToFit`, `slideCamera` with animation options
- Respect `editor.user.getAnimationSpeed()` for camera; shape animations may need manual reduced-motion checks

## Driver

```bash
npm install @tldraw/driver@5.2.5
```

```ts
import { Driver } from '@tldraw/driver'

const driver = new Driver(editor)
driver.click(100, 200).keyPress('a')
driver.translateSelection(50, 0)
driver.dispose()
```

- Coordinates for pointer APIs: **screen space** (convert with `editor.pageToScreen` as needed).
- Selection helpers: **page space**.
- Clipboard is driver-local, not necessarily system clipboard.
- Always `dispose()`; use only public Editor APIs under the hood.

Hermes automation: prefer Driver + optional `${HERMES_SKILL_DIR}/templates/hermes-dev-bridge.ts` (dev/localhost only).

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | Editor entry, store construction, custom side effects, tool state machines |
| Implement | Public Editor methods; `run` for batches; Driver for input scripts |
| Verify | Unit tests with Driver; browser console clean; undo/redo; selection transforms |

## Feature map (sdk-features)

editor, store, signals, side-effects, history, events, input-handling, ticks, camera, coordinates, focus, selection, shape-transforms, animation, pages, groups, parenting, instance-state, readonly, locked-shapes, validation, options, culling, visibility, highlighting, indicators, scribble, snapping, edge-scrolling, click-detection, performance (hooks).

## Sources

- https://tldraw.dev/docs/editor
- https://tldraw.dev/docs/driver
- https://tldraw.dev/sdk-features/editor
- https://tldraw.dev/sdk-features/store
- https://tldraw.dev/sdk-features/signals
- https://tldraw.dev/reference/editor/Editor
- https://tldraw.dev/reference/driver/Driver
