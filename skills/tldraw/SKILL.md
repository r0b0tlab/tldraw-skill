---
name: tldraw
description: "Use when working with tldraw: build or debug SDK apps, automate Editor/Driver, create .tldr artifacts, add sync/Mermaid/custom shapes, migrate versions, or customize official AI and starter-kit projects."
version: 1.0.0
author: am423
license: MIT
metadata:
  hermes:
    category: software-development
    tags: [tldraw, react, infinite-canvas, whiteboard, diagrams, collaboration, ai]
    related_skills: [visual-artifact-authoring, systematic-debugging, test-driven-development, computer-use]
---

# tldraw

## Overview

Version-aware router for the **public tldraw SDK** (React infinite canvas): Editor/store, shapes/tools/bindings, UI and accessibility, asset handling, persistence, `.tldr` files, export, Mermaid, `@tldraw/driver`, `@tldraw/sync`, official starter kits, AI agent kits, migrations, licensing, and upstream contribution.

**Scope:** documented public APIs, published packages, and official starters. **Not** private tldraw.com internals, `@internal` symbols, or raw Python `.tldr` generation.

**Observed baseline (re-check each session):** npm `tldraw@5.2.5` as of 2026-07-17. Prefer the project's installed version over this skill's baseline. See `${HERMES_SKILL_DIR}/references/source-manifest.json`.

## When to Use

**Positive triggers**

- Explicit tldraw / `.tldr` / `@tldraw/*` work
- Editor, Driver, sync, Mermaid, custom shapes/tools/bindings
- Official starter kits (agent, chat, workflow, multiplayer, …)
- Migrate or repair stale tldraw code
- Contribute inside the `tldraw/tldraw` monorepo

**Do not auto-select for**

- Generic “draw a flowchart” with no tldraw preference → `visual-artifact-authoring` / user choice
- Excalidraw-only requests
- HTML Canvas/WebGL games unrelated to tldraw
- Unrelated React debugging with no canvas SDK
- Generic collab text editors (not canvas sync)

## Mandatory first step: inspect

Before API advice or code edits:

```bash
python3 ${HERMES_SKILL_DIR}/scripts/inspect_project.py [project-dir] [--json]
python3 ${HERMES_SKILL_DIR}/scripts/doctor.py [--project DIR] [--json]
```

Capture: package manager, lockfile, framework, exact `tldraw` / `@tldraw/*` versions, React peers, custom schema files, sync/agent/license signals, version skew.

If offline docs help:

```bash
python3 ${HERMES_SKILL_DIR}/scripts/fetch_official_docs.py [--corpus index|docs|examples|releases] [--offline] [--json]
```

Cache lives under `${XDG_CACHE_HOME:-~/.cache}/hermes/tldraw/` (not inside the skill).

**Done when:** you know installed versions and project class (existing app / greenfield / artifact / upstream monorepo) before proposing APIs.

## Source and version precedence

1. Installed package types, `DOCS.md` / `RELEASE_NOTES.md` when present
2. Release notes between installed and target versions
3. Current official docs + `llms.txt` corpora for greenfield concepts
4. Official examples / starter kits for complex patterns
5. Repository `main` only for upstream contribution or when docs point there

Never “fix” a missing public API with `@internal` or `any`. Full policy: `${HERMES_SKILL_DIR}/references/source-and-version-policy.md`.

### Anti-hallucination (always)

| Wrong / stale | Correct (verify on installed version) |
|---|---|
| `@tldraw/tldraw` | `npm install tldraw` |
| Canvas2D scene graph | React-rendered **DOM** (HTML/CSS) |
| `type: 'rectangle'` / `'circle'` | `type: 'geo'` + `props.geo` |
| `props.text` | `richText: toRichText(...)` |
| Improvised IDs | `createShapeId()`, binding/record ID helpers |
| Visual arrow overlap | Public **bindings** |
| `editor.store.getSnapshot()` | Standalone `getSnapshot` / `loadSnapshot` on **store** |
| `exportToBlob` / `exportAs` as Editor methods | `toImage` / `toImageDataUrl` / `getSvgString` / `getSvgElement` |
| `editor.batch()` / `setSelectedShapeIds()` | `editor.run()` / `setSelectedShapes()` |
| Invented `@tldraw/yjs` | Official `@tldraw/sync` (+ optional third-party bridges) |
| `persistenceKey` → localStorage | **IndexedDB** + cross-tab sync |
| `darkMode` / `theme` / `forceDarkMode` props | `colorScheme` (`light` \| `dark` \| `system`) |
| “MIT open source SDK” | **Source-available tldraw license**; production needs license key |

## Task router

| Task | Open |
|---|---|
| Project class, scaffolding, starters, CSS/container | `${HERMES_SKILL_DIR}/references/project-routing-and-starters.md` |
| Source precedence, anti-hallucination, version skew | `${HERMES_SKILL_DIR}/references/source-and-version-policy.md` |
| Diagram / flowchart quality + Editor authoring | `${HERMES_SKILL_DIR}/references/diagram-authoring.md` |
| Mermaid conversion/import (package/runtime + visual layout) | Load both `${HERMES_SKILL_DIR}/references/data-files-assets-export-mermaid.md` and `${HERMES_SKILL_DIR}/references/diagram-authoring.md` |
| Editor, store, signals, history, side effects, events, camera, input, Driver | `${HERMES_SKILL_DIR}/references/editor-store-state-driver.md` |
| Shapes, tools, bindings, geometry, styles, rich text | `${HERMES_SKILL_DIR}/references/shapes-tools-bindings.md` |
| UI components, overrides, a11y, i18n, themes, prefs | `${HERMES_SKILL_DIR}/references/ui-accessibility-internationalization.md` |
| Assets, persistence, `.tldr`, snapshots, export, Mermaid, clipboard | `${HERMES_SKILL_DIR}/references/data-files-assets-export-mermaid.md` |
| Multiplayer, presence, `TLSocketRoom`, deployment order | `${HERMES_SKILL_DIR}/references/sync-collaboration.md` |
| AI patterns + official starter kits | `${HERMES_SKILL_DIR}/references/ai-and-starter-kits.md` |
| Performance, security, license, attribution, deploy | `${HERMES_SKILL_DIR}/references/performance-security-licensing-deployment.md` |
| Testing, debugging, migrations, upstream monorepo | `${HERMES_SKILL_DIR}/references/testing-debugging-migrations-upstream.md` |
| Capability → reference map | `${HERMES_SKILL_DIR}/references/capability-map.md` |
| Provenance / observed URLs | `${HERMES_SKILL_DIR}/references/source-manifest.json` |

Dev-only Editor bridge template (localhost only): `${HERMES_SKILL_DIR}/templates/hermes-dev-bridge.ts`.

## Core workflow: inspect → source → implement → verify

1. **Inspect** project + versions (`inspect_project.py` / `doctor.py`).
2. **Source** the matching reference + installed types/docs; fetch corpora if needed.
3. **Implement** with public APIs only; align all `@tldraw/*` package versions.
4. **Verify** with the highest available rung:
   - typecheck / unit tests / production build
   - browser: mount app, exercise Editor/Driver, check console
   - vision: screenshots for layout/contrast/clipping
   - without browser: state clearly that runtime/visual verification is **unproven**

**Done when:** every claim is backed by real command/runtime output, or explicitly labeled unverified.

## Artifact workflow (`.tldr` / export)

**Never** invent production `.tldr` records in Python or hand-write schema versions.

1. Scaffold or reuse a real tldraw app with the target schema (built-ins + any custom shapes/bindings).
2. Mount an `Editor` (optionally expose via **dev-only** bridge).
3. Create/update content with Editor methods and/or `@tldraw/driver`.
4. Serialize asynchronously with `await serializeTldrawJson(editor)` (or `await serializeTldrawJsonBlob(editor)`).
5. Parse the `Result` from `parseTldrawJsonFile({ json, schema })` using the **same** app schema; handle `!parsed.ok` explicitly.
6. Load `getSnapshot(parsed.value)` into a `createTLStore({ schema })`, then instantiate a fresh `Editor` with the same custom `shapeUtils` / `bindingUtils`; assert pages, shape IDs/types, binding endpoints, text, assets, and bounds.
7. Export SVG/raster via current `getSvgString` / `toImage` family APIs; inspect visually when tools allow.
8. Return **absolute paths** and real logs. Use `[[as_document]]` only for high-res media on gateway surfaces—not for CLI path reporting.

Envelope fields (current format): `tldrawFileFormatVersion`, `schema`, `records` — not a top-level `pages` field. V1 files need the dedicated conversion path, not a claim that `parseTldrawJsonFile` “migrated” them as modern files.

Custom shapes are **not** portable to tldraw.com unless that host registers the same utils/schema.

## Project routing (summary)

| Class | Start with |
|---|---|
| Existing React app | Add `tldraw` + CSS; full-size container; match React peer range |
| Greenfield | `npm create tldraw@latest` or official kit matching the use case |
| Artifact only | Minimal app + Editor pipeline above |
| Upstream monorepo | Repo `AGENTS.md`; Yarn 4; Node ≥ 22.12; never bare `tsc` |

Details: `${HERMES_SKILL_DIR}/references/project-routing-and-starters.md`.

## Tool-aware branches

| Tools available | Expect |
|---|---|
| Terminal/files | Install, patch, typecheck, test, build |
| Browser | Mount, Driver/bridge, console, interaction |
| Vision | Layout, contrast, labels, arrow routing |
| Web | Current docs, releases, license, kits |
| No browser | Static/type/build only; mark runtime unproven |

## Safety and license

- SDK is **source-available** under the tldraw license (not MIT). This skill's original text is MIT; generated apps still depend on the SDK license.
- Production requires a valid **license key** (trial / commercial / hobby). Development on localhost typically does not.
- License keys are **domain-bound client config**, not API secrets—still do not invent pricing or revenue thresholds.
- **Hobby license data collection:** public docs currently **conflict** (community license page vs license-key feature page vs anti-hallucination article). Do not silently pick one; re-read current license pages and record both wordings. See performance/security reference + source-manifest.
- Never put model/provider API secrets in client bundles. Dev bridge: localhost + explicit opt-in only; no eval, no credentials.
- Sanitize untrusted SVG/HTML; enforce upload limits, CSP, auth for sync/assets.
- Demo sync servers are for prototyping; production sync is self-hosted.

## Common pitfalls

1. Installing `@tldraw/tldraw` or inventing `@tldraw/yjs` / `@tldraw/ui`.
2. Treating the canvas as Canvas2D/WebGL.
3. Creating rectangles as non-`geo` types; using `props.text` instead of `toRichText`.
4. Generating `.tldr` without a live Editor + official serializer/parser.
5. Mixing package versions across `tldraw` and `@tldraw/*`.
6. Applying main-branch APIs to an older installed version without release notes.
7. Claiming PDF export, headless/server image rendering, or non-React first-class support without current docs.
8. Treating `hideUi` as a security/permission boundary or assuming shortcut behavior without testing the installed version (5.2.5 still runs built-in shortcuts while chrome is hidden).
9. Shipping production without license key / attribution / asset security review.
10. Structural Python checks treated as semantic `.tldr` validation.

## Verification checklist

- [ ] Project inspected; exact tldraw versions recorded
- [ ] Routed to the correct reference(s); no invented APIs
- [ ] Anti-hallucination table checked against patches
- [ ] Typecheck/build (and tests when present) ran with real output
- [ ] Runtime/browser/vision path executed **or** labeled unverified
- [ ] `.tldr` path used Editor serialize/parse with app schema
- [ ] License, secrets, and untrusted-data risks addressed for the branch
- [ ] Absolute artifact paths and command evidence reported

## Runtime support files

All runtime paths use `${HERMES_SKILL_DIR}`:

- `${HERMES_SKILL_DIR}/scripts/inspect_project.py`
- `${HERMES_SKILL_DIR}/scripts/doctor.py`
- `${HERMES_SKILL_DIR}/scripts/fetch_official_docs.py`
- `${HERMES_SKILL_DIR}/templates/hermes-dev-bridge.ts`
- `${HERMES_SKILL_DIR}/references/AGENTS.md` (packaged cross-agent contract; source installs also include root `AGENTS.md`)
- `${HERMES_SKILL_DIR}/references/source-manifest.json`
- `${HERMES_SKILL_DIR}/references/source-and-version-policy.md`
- `${HERMES_SKILL_DIR}/references/project-routing-and-starters.md`
- `${HERMES_SKILL_DIR}/references/diagram-authoring.md`
- `${HERMES_SKILL_DIR}/references/editor-store-state-driver.md`
- `${HERMES_SKILL_DIR}/references/shapes-tools-bindings.md`
- `${HERMES_SKILL_DIR}/references/ui-accessibility-internationalization.md`
- `${HERMES_SKILL_DIR}/references/data-files-assets-export-mermaid.md`
- `${HERMES_SKILL_DIR}/references/sync-collaboration.md`
- `${HERMES_SKILL_DIR}/references/ai-and-starter-kits.md`
- `${HERMES_SKILL_DIR}/references/performance-security-licensing-deployment.md`
- `${HERMES_SKILL_DIR}/references/testing-debugging-migrations-upstream.md`
- `${HERMES_SKILL_DIR}/references/capability-map.md`
