# Shapes, tools, and bindings

## Default shapes

Built-ins include geo, text, note, draw, highlight, line, arrow, frame, group, image, video, embed, bookmark (verify `defaultShapeUtils` on installed version).

**Geo:** rectangles, ellipses, diamonds, etc. are **one** shape type:

```ts
{ type: 'geo', props: { geo: 'rectangle', w, h, richText: toRichText('…') } }
```

There is no `type: 'rectangle'`.

## Rich text & styles

- Labels: `toRichText` / rich text model (v3+); not plain `props.text`.
- Styles: shared style props (color, size, fill, dash, font, align, …).
- Text measurement APIs for layout.

## Custom shapes

Minimum public surface:

1. Augment `TLGlobalShapePropsMap` with props type.
2. `ShapeUtil` subclass: `type`, `getDefaultProps`, `getGeometry`, `component`, and public `getIndicatorPath` (plus clipping/additional paths as required). The older `indicator` SVG method is deprecated in 5.2.5 and should not be taught for new shapes.
3. Validators + **migrations** for props evolution.
4. Optional: `toSvg` / export, `getText` / a11y description, handles, snapping, clipping.
5. Register util with `<Tldraw shapeUtils={…}>` (keep needed defaults).

Portability: receiving apps (including tldraw.com) only render customs they register.

## Tools

- Tools are **state charts** (`StateNode`) handling input events.
- Custom tools: implement tool + optional child states; add toolbar entry via UI overrides/components.
- Dynamic tools: `setTool` / `removeTool` patterns from examples.
- Driver dispatches into the same tool machines as real input.

## Bindings

Bindings are first-class relationships (not mere visual proximity).

1. Augment `TLGlobalBindingPropsMap`.
2. Implement `BindingUtil` lifecycle (`onBefore…` / `onAfter…` / shape change hooks as documented).
3. Create bindings through public Editor APIs when attaching arrows or custom links.
4. Register `bindingUtils` alongside shapes.
5. Sync: **client and server schemas must both include** custom bindings.

## Geometry & handles

- `Geometry2d` family for hit-testing, bounds, SVG.
- Handles for editable control points; snap geometry extensions for custom snap targets.

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | Registered shapeUtils/bindingUtils/tools; migration sequences |
| Implement | Typed props map → util → validator → migrations → UI registration |
| Verify | Create/select/transform; undo; SVG export; a11y text; multiplayer schema parity if sync |

## Feature map

shapes, default-shapes, geo-shape, text-shape, note-shape, draw-shape, frame-shape, embed-shape, geometry, handles, styles, rich-text, text-measurement, tools, bindings, shape-clipping, shape-indexing, shape-transforms, locked-shapes, groups, parenting.

## Sources

- https://tldraw.dev/docs/shapes
- https://tldraw.dev/docs/tools
- https://tldraw.dev/sdk-features/shapes
- https://tldraw.dev/sdk-features/bindings
- Examples: custom-shape, custom-tool, custom-config, sticker-bindings, shape-with-migrations, toSvg-method-example
