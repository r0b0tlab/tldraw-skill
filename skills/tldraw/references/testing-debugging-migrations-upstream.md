# Testing, debugging, migrations, and upstream

## Testing strategies

| Layer | Approach |
|---|---|
| Unit | Pure geometry/validators; Driver + Editor in jsdom/happy-dom where supported |
| Component | React Testing Library around registered utils |
| Integration | Playwright/Cypress: create shapes, bindings, persistence, export |
| Sync | Two clients + room; restart persistence; auth failure |
| Migrations | Load legacy fixture; assert post-migrate records |
| Visual | Screenshots + vision; golden SVG when stable |

Prefer `@tldraw/driver` for pointer/keyboard sequences over brittle DOM click coordinates when testing tools.

Hermes: run project scripts via terminal; use browser tools for interactive proof; never claim pass without output.

## Debugging

1. Reproduce with minimal Editor mount.
2. Log store records / selected shapes via public getters.
3. Check schema validation errors on load/parse.
4. Console license warnings in production mode.
5. Side-effect order and history (`run` options).
6. Coordinate space bugs (page vs screen) when using Driver.
7. Version skew across `@tldraw/*` packages.

## Migrations (applications)

1. Detect installed vs target versions (`inspect_project.py`).
2. Prefer the official experimental **`tldraw-migrate`** skill and release-note blocks. Its canonical source is `https://github.com/tldraw/tldraw/tree/main/skills/tldraw-migrate`; it is not assumed to be installed from the Hermes Hub, so inspect/install the upstream folder explicitly and review its diff rather than running it unattended.
3. Bump **all** tldraw packages together.
4. Typecheck after each migration category (shapes, UI, sync, export).
5. Update custom shape/binding **migration sequences**.
6. Re-run `.tldr` fixtures through `parseTldrawJsonFile`.
7. Reject `any` / `@ts-ignore` / `@internal` as migration “fixes”.

V1 files: detect only through `!parsed.ok && parsed.error.type === 'v1File'` from `parseTldrawJsonFile`; do not import unexported legacy-detection helpers. The 5.2.5 UI converter is internal, so do not teach `buildFromV1Document`; use an official compatible client to open/resave or re-check a newer installed release for a public converter.

## Upstream monorepo (`tldraw/tldraw`)

Load current repo `AGENTS.md` first. Observed norms (re-check):

- `yarn@4.12.0` workspaces as currently pinned; **not** npm for repo scripts.
- Node `>=22.12.0`; Corepack enabled.
- Never bare `tsc` — use `yarn typecheck`.
- Prefer targeted `yarn test <target-test-file> --run` before repo-wide vitest/e2e.
- Public API changes: `yarn api-check` + API reports.
- Sentence case in docs/UI copy.
- Upstream is currently **not accepting contributions** and has pull requests turned off. Create an issue; when code helps, link a branch from a fork. Re-check [CONTRIBUTING.md](https://github.com/tldraw/tldraw/blob/main/CONTRIBUTING.md) and [issue 7695](https://github.com/tldraw/tldraw/issues/7695) before acting.

Executable dry-run contract: `tests/fixtures/upstream-dry-run.json`, verified locally and optionally against current upstream by `python3 tests/verify_upstream_dry_run.py [--network]`. It records discovery/check commands; it does not clone, modify, or submit to upstream.

Core packages: `editor`, `tldraw`, `store`, `tlschema`, `state`, `sync`, `sync-core`, `driver`, `mermaid`, `utils`, `validate`, `assets`, …

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | test runner, existing fixtures, installed versions, whether path is app vs monorepo |
| Implement | smallest failing test; migrate with official notes; keep packages aligned |
| Verify | tests green; typecheck/build; fixture round-trip; no stale APIs |

## Sources

- https://tldraw.dev/releases/migration-skill
- https://tldraw.dev/llms-releases.txt
- https://github.com/tldraw/tldraw/blob/main/AGENTS.md
- https://tldraw.dev/docs/driver
