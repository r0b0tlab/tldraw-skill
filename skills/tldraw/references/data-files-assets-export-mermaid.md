# Data, files, assets, export, and Mermaid

## Persistence

```tsx
<Tldraw persistenceKey="my-app" />
```

- Storage backend: **IndexedDB** (via `idb`), **not** localStorage.
- Cross-tab synchronization for the same key.
- Without `persistenceKey`, default in-memory / session behavior applies (assets may use inline base64 store for prototyping).

Snapshots (in-memory / custom backends):

```ts
import { getSnapshot, loadSnapshot } from 'tldraw'
const snap = getSnapshot(editor.store)
loadSnapshot(editor.store, snap)
```

## `.tldr` files

Public envelope (`packages/tldraw/.../tldr/file.ts`):

```ts
interface TldrawFile {
  tldrawFileFormatVersion: number
  schema: SerializedSchema
  records: UnknownRecord[]
}
```

| API | Role |
|---|---|
| `await serializeTldrawJson(editor)` | Async export from live Editor (may inline asset bytes) |
| `await serializeTldrawJsonBlob(editor)` | Async Blob variant |
| `parseTldrawJsonFile({ json, schema })` | Validate, migrate, build store |
| `v1File` parse error | Public signal for legacy v1 documents; conversion is not a public 5.2.5 API |

**Rules**

- Generate only through a mounted Editor + serializer.
- Parse with the **application** `TLSchema` (including custom shapes/bindings).
- Structural Python checks (top-level keys) are diagnostics only—not semantic validation.
- V1 files: inspect `!parsed.ok && parsed.error.type === 'v1File'`; do not import unexported legacy-detection helpers. The UI's conversion implementation is internal; do not recommend `buildFromV1Document` or claim a public conversion API exists. Ask the user to open/resave with an official compatible client, or re-check a newer installed release for a newly public converter.
- Unused assets may be pruned on serialize/parse paths—verify installed behavior.

Semantic round trip with a clean store and Editor:

```ts
import {
  createTLStore, Editor, getSnapshot, loadSnapshot,
  parseTldrawJsonFile, serializeTldrawJson,
} from 'tldraw'

const json = await serializeTldrawJson(editor)
const parsed = parseTldrawJsonFile({ json, schema: editor.store.schema })
if (!parsed.ok) {
  if (parsed.error.type === 'v1File') throw new Error('Open and resave this v1 file')
  throw new Error(`Invalid .tldr file: ${parsed.error.type}`)
}

const cleanStore = createTLStore({ schema: editor.store.schema })
loadSnapshot(cleanStore, { document: getSnapshot(parsed.value).document })
const cleanEditor = new Editor({
  store: cleanStore,
  shapeUtils, bindingUtils, assetUtils, tools,
  getContainer: () => container,
})
try {
  // Assert semantic IDs/types, binding endpoints, asset metadata, and custom props.
} finally {
  cleanEditor.dispose()
}
```

Use the same custom `shapeUtils` and `bindingUtils` that produced the file. Parse success or record counts alone are insufficient.

MIME: `application/vnd.tldraw+json`; extension `.tldr`.

## Assets

- Types: image, video, bookmark (+ custom via `AssetUtil`).
- Shapes reference assets by id; bytes live in `TLAssetStore` (`upload` / `resolve` / `remove`).
- Production: host on a **separate domain** when possible; sanitize SVG; CSP.
- Unfurl bookmarks via external asset handlers on the server when needed.

## Clipboard, external content, deep links

- Clipboard events and custom paste handlers.
- External content: files, URLs, Excalidraw, tldraw content—register handlers explicitly when customizing.
- Drag/drop trays and deep links: use documented APIs; do not invent URL schemes.

## Image / SVG export

Current Editor family (verify names on installed types):

```ts
const ids = [...editor.getCurrentPageShapeIds()]
const { blob } = await editor.toImage(ids, { format: 'png', scale: 2 })
const result = await editor.getSvgString(ids)
if (!result) throw new Error('nothing to export')
const svg = result.svg
// also: toImageDataUrl, getSvgElement
```

Reject stale `exportToBlob` / invented `editor.getSvg` as current primary APIs.

Custom shapes must implement export hooks for faithful SVG. Fonts, embeds, and CORS failures need explicit handling.

**Non-goals unless docs change:** first-class PDF export; guaranteed headless/server rendering.

## Mermaid

```bash
npm install @tldraw/mermaid
```

Use public helpers such as `createMermaidDiagram` / blueprint render APIs from `@tldraw/mermaid` (check installed exports). In 5.2.5, installed types define `createMermaidDiagram` as `Promise<void>`; do not depend on its stale return-value JSDoc. Examples: mermaid-pasting, custom-shape-mermaids, hundred-mermaids.

Keep package version aligned with `tldraw`.

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | persistenceKey, asset store, schema, export call sites |
| Implement | Official serialize/parse; asset upload/resolve; Mermaid package |
| Verify | Refresh reload; multi-tab; round-trip fixture; PNG/SVG files exist; Mermaid nodes render |

## Feature map

persistence, assets, clipboard, drag-and-drop, external-content, deep-links, image-export, plus Mermaid docs/package.

## Sources

- https://tldraw.dev/docs/persistence
- https://tldraw.dev/docs/assets
- https://tldraw.dev/docs/mermaid
- https://tldraw.dev/sdk-features/persistence
- https://tldraw.dev/sdk-features/assets
- https://tldraw.dev/sdk-features/image-export
- https://tldraw.dev/reference/tldraw/parseTldrawJsonFile
- https://tldraw.dev/reference/tldraw/serializeTldrawJson
