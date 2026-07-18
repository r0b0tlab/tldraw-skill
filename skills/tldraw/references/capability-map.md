# Capability map

Observed **tldraw@5.2.5** on **2026-07-17**. Machine source: `tests/capability-map.json` (keep in lockstep).

Every public feature routes to a reference with inspect → implement → verify. Exclusions require a source-backed reason.

## Buckets

- **core_editor**: Core editor, input, camera, history, events
- **store_data**: Store, signals, validation, side effects
- **shapes_ext**: Shapes, tools, bindings, geometry, styles
- **ui_a11y**: UI, a11y, i18n, themes, preferences
- **content_io**: Assets, persistence, .tldr, export, Mermaid, clipboard
- **automation**: Editor API automation and @tldraw/driver
- **collab**: Sync and collaboration
- **starters_ai**: AI integrations and starter kits
- **production**: Performance, security, license, deployment
- **upstream**: Migrations and upstream monorepo
- **routing**: Project routing and scaffolding
- **diagrams**: Diagram authoring quality
- **policy**: Source/version and anti-hallucination policy

## SDK features (`/sdk-features/*`)

| Slug | Reference | Bucket |
|---|---|---|
| `accessibility` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `actions` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `animation` | `references/editor-store-state-driver.md` | core_editor |
| `assets` | `references/data-files-assets-export-mermaid.md` | content_io |
| `attribution` | `references/performance-security-licensing-deployment.md` | production |
| `bindings` | `references/shapes-tools-bindings.md` | shapes_ext |
| `camera` | `references/editor-store-state-driver.md` | core_editor |
| `click-detection` | `references/editor-store-state-driver.md` | core_editor |
| `clipboard` | `references/data-files-assets-export-mermaid.md` | content_io |
| `collaboration` | `references/sync-collaboration.md` | collab |
| `coordinates` | `references/editor-store-state-driver.md` | core_editor |
| `culling` | `references/editor-store-state-driver.md` | core_editor |
| `cursor-chat` | `references/sync-collaboration.md` | collab |
| `cursors` | `references/sync-collaboration.md` | collab |
| `deep-links` | `references/data-files-assets-export-mermaid.md` | content_io |
| `default-shapes` | `references/shapes-tools-bindings.md` | shapes_ext |
| `drag-and-drop` | `references/data-files-assets-export-mermaid.md` | content_io |
| `draw-shape` | `references/shapes-tools-bindings.md` | shapes_ext |
| `edge-scrolling` | `references/editor-store-state-driver.md` | core_editor |
| `editor` | `references/editor-store-state-driver.md` | core_editor |
| `embed-shape` | `references/shapes-tools-bindings.md` | shapes_ext |
| `environment` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `errors` | `references/performance-security-licensing-deployment.md` | production |
| `events` | `references/editor-store-state-driver.md` | core_editor |
| `external-content` | `references/data-files-assets-export-mermaid.md` | content_io |
| `focus` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `frame-shape` | `references/shapes-tools-bindings.md` | shapes_ext |
| `geo-shape` | `references/shapes-tools-bindings.md` | shapes_ext |
| `geometry` | `references/shapes-tools-bindings.md` | shapes_ext |
| `groups` | `references/shapes-tools-bindings.md` | shapes_ext |
| `handles` | `references/shapes-tools-bindings.md` | shapes_ext |
| `highlighting` | `references/editor-store-state-driver.md` | core_editor |
| `history` | `references/editor-store-state-driver.md` | core_editor |
| `image-export` | `references/data-files-assets-export-mermaid.md` | content_io |
| `indicators` | `references/editor-store-state-driver.md` | core_editor |
| `input-handling` | `references/editor-store-state-driver.md` | core_editor |
| `instance-state` | `references/editor-store-state-driver.md` | core_editor |
| `internationalization` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `license-key` | `references/performance-security-licensing-deployment.md` | production |
| `locked-shapes` | `references/shapes-tools-bindings.md` | shapes_ext |
| `note-shape` | `references/shapes-tools-bindings.md` | shapes_ext |
| `options` | `references/editor-store-state-driver.md` | core_editor |
| `overlay-utils` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `pages` | `references/editor-store-state-driver.md` | core_editor |
| `parenting` | `references/shapes-tools-bindings.md` | shapes_ext |
| `performance` | `references/performance-security-licensing-deployment.md` | production |
| `persistence` | `references/data-files-assets-export-mermaid.md` | content_io |
| `readonly` | `references/editor-store-state-driver.md` | core_editor |
| `rich-text` | `references/shapes-tools-bindings.md` | shapes_ext |
| `scribble` | `references/editor-store-state-driver.md` | core_editor |
| `selection` | `references/editor-store-state-driver.md` | core_editor |
| `shape-clipping` | `references/shapes-tools-bindings.md` | shapes_ext |
| `shape-indexing` | `references/shapes-tools-bindings.md` | shapes_ext |
| `shape-transforms` | `references/editor-store-state-driver.md` | core_editor |
| `shapes` | `references/shapes-tools-bindings.md` | shapes_ext |
| `side-effects` | `references/editor-store-state-driver.md` | store_data |
| `signals` | `references/editor-store-state-driver.md` | store_data |
| `snapping` | `references/editor-store-state-driver.md` | core_editor |
| `store` | `references/editor-store-state-driver.md` | store_data |
| `styles` | `references/shapes-tools-bindings.md` | shapes_ext |
| `text-measurement` | `references/shapes-tools-bindings.md` | shapes_ext |
| `text-shape` | `references/shapes-tools-bindings.md` | shapes_ext |
| `themes` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `ticks` | `references/editor-store-state-driver.md` | core_editor |
| `tools` | `references/shapes-tools-bindings.md` | shapes_ext |
| `ui-components` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `ui-primitives` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `user-following` | `references/sync-collaboration.md` | collab |
| `user-preferences` | `references/ui-accessibility-internationalization.md` | ui_a11y |
| `validation` | `references/editor-store-state-driver.md` | store_data |
| `visibility` | `references/editor-store-state-driver.md` | core_editor |

## Docs (`/docs/*`)

| Slug | Reference |
|---|---|
| `ai` | `references/ai-and-starter-kits.md` |
| `assets` | `references/data-files-assets-export-mermaid.md` |
| `collaboration` | `references/sync-collaboration.md` |
| `driver` | `references/editor-store-state-driver.md` |
| `editor` | `references/editor-store-state-driver.md` |
| `handles` | `references/shapes-tools-bindings.md` |
| `indicators` | `references/editor-store-state-driver.md` |
| `llm-docs` | `references/source-and-version-policy.md` |
| `mermaid` | `references/data-files-assets-export-mermaid.md` |
| `persistence` | `references/data-files-assets-export-mermaid.md` |
| `shapes` | `references/shapes-tools-bindings.md` |
| `sync` | `references/sync-collaboration.md` |
| `tools` | `references/shapes-tools-bindings.md` |
| `user-interface` | `references/ui-accessibility-internationalization.md` |

## Starter kits

| Slug | Reference |
|---|---|
| `agent` | `references/ai-and-starter-kits.md` |
| `branching-chat` | `references/ai-and-starter-kits.md` |
| `chat` | `references/ai-and-starter-kits.md` |
| `image-pipeline` | `references/ai-and-starter-kits.md` |
| `multiplayer` | `references/sync-collaboration.md` |
| `overview` | `references/ai-and-starter-kits.md` |
| `shader` | `references/ai-and-starter-kits.md` |
| `workflow` | `references/ai-and-starter-kits.md` |

## Public packages

| Package | Reference |
|---|---|
| `tldraw` | `references/project-routing-and-starters.md` |
| `@tldraw/editor` | `references/editor-store-state-driver.md` |
| `@tldraw/store` | `references/editor-store-state-driver.md` |
| `@tldraw/tlschema` | `references/shapes-tools-bindings.md` |
| `@tldraw/state` | `references/editor-store-state-driver.md` |
| `@tldraw/state-react` | `references/editor-store-state-driver.md` |
| `@tldraw/sync` | `references/sync-collaboration.md` |
| `@tldraw/sync-core` | `references/sync-collaboration.md` |
| `@tldraw/driver` | `references/editor-store-state-driver.md` |
| `@tldraw/mermaid` | `references/data-files-assets-export-mermaid.md` |
| `@tldraw/utils` | `references/editor-store-state-driver.md` |
| `@tldraw/validate` | `references/editor-store-state-driver.md` |
| `@tldraw/assets` | `references/data-files-assets-export-mermaid.md` |
| `create-tldraw` | `references/project-routing-and-starters.md` |

## Reference API families

- `reference/editor/*` → `references/editor-store-state-driver.md`
- `reference/store/*` → `references/editor-store-state-driver.md`
- `reference/state/*` → `references/editor-store-state-driver.md`
- `reference/state-react/*` → `references/editor-store-state-driver.md`
- `reference/tlschema/*` → `references/shapes-tools-bindings.md`
- `reference/tldraw/*` → `references/project-routing-and-starters.md`
- `reference/sync/*` → `references/sync-collaboration.md`
- `reference/sync-core/*` → `references/sync-collaboration.md`
- `reference/driver/*` → `references/editor-store-state-driver.md`
- `reference/mermaid/*` → `references/data-files-assets-export-mermaid.md`
- `reference/validate/*` → `references/editor-store-state-driver.md`

## Explicit exclusions

- `packages/dotcom-shared` — Internal shared code for tldraw.com apps, not a public application SDK surface
- `packages/worker-shared` — Internal worker helpers for tldraw.com, not a public application package
- `packages/namespaced-tldraw` — Build/namespacing infrastructure package; not a primary app-facing install target (use tldraw)

## IIV

- **Inspect:** project versions + schema
- **Implement:** routed public APIs only
- **Verify:** build/runtime evidence or label unverified
