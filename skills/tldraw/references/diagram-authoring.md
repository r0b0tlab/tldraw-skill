# Diagram authoring

For user-facing diagrams (flowcharts, architecture, sequence-like, mind maps, annotated images) on a **real** tldraw Editor.

## Process

1. **Semantic model first** — nodes, edges, groups, swimlanes/frames, labels—before coordinates.
2. **Prefer built-ins** — `geo`, `text`, `note`, `arrow`, `frame`, `draw`, `image`—unless custom behavior is required.
3. **IDs and text** — `createShapeId()`; labels via `toRichText(...)`, never stale `props.text`.
4. **Layout** — deterministic grid/columns; measure text when possible; consistent spacing (e.g. 24–48px gaps); align edges.
5. **Arrows** — create arrow shapes **and** public **bindings** to endpoints; do not rely on visual overlap.
6. **Hierarchy** — frames/pages/groups for sections; parenting for containment.
7. **Styles** — default style props for contrast; avoid low-contrast gray-on-gray.
8. **Camera last** — `zoomToFit` / `zoomToBounds` only after geometry stabilizes.
9. **Export** — `.tldr` via `serializeTldrawJson`; PNG/SVG via `toImage` / `getSvgString`.
10. **A11y** — readable labels; shape text/ARIA descriptions where custom; respect reduced motion for optional animations.

## Recipes (built-in oriented)

### Rectangle + label

```ts
import { createShapeId, toRichText } from 'tldraw'

const id = createShapeId('step-1')
editor.createShape({
  id,
  type: 'geo',
  x: 100,
  y: 100,
  props: {
    geo: 'rectangle',
    w: 200,
    h: 80,
    richText: toRichText('Ingest'),
  },
})
```

### Bound arrow

Use the installed binding helpers / patterns from the “create an arrow” and binding examples. Ensure both ends have binding records; after layout changes, update bindings rather than only moving paths.

### Batching

```ts
editor.run(() => {
  editor.createShapes([...])
  editor.createBindings([...]) // public on Editor in 5.2.5; still verify the installed version
})
```

Prefer `editor.run` over stale `editor.batch`.

## Quality bar (visual verify)

| Check | Fail if |
|---|---|
| Overlap | Nodes or labels collide |
| Clipping | Text cut by frame/shape bounds |
| Detached edges | Arrow ends not bound / float free |
| Alignment | Columns/rows drift without reason |
| Contrast | Label unreadable on fill |
| Hierarchy | Unrelated nodes share no frame/page when they should |

## Artifact path

See SKILL.md artifact workflow: mount Editor → mutate → serialize → parse with app schema → reload → export image → absolute paths.

## Inspect / implement / verify

- **Inspect:** existing schema, page size, brand colors, whether Mermaid input is allowed.
- **Implement:** semantic model → shapes → bindings → styles → camera.
- **Verify:** typecheck; browser screenshot + vision; `.tldr` round-trip; no console errors.

## Sources

- Geo shape: https://tldraw.dev/sdk-features/geo-shape
- Bindings: https://tldraw.dev/sdk-features/bindings
- Rich text: https://tldraw.dev/sdk-features/rich-text
- Examples: create-arrow, arrow-labels, align-and-distribute, frames, mermaid-*
