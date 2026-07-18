# Packaged agent contract — tldraw

This mirror is retained under `references/` because skill package/tap installers may preserve only `SKILL.md` plus allowed support directories. Source-tree installs also include the root agent contract.

## Load order

1. `${HERMES_SKILL_DIR}/SKILL.md` — router and anti-hallucination rules.
2. The routed file under `${HERMES_SKILL_DIR}/references/`.
3. `source-manifest.json` when provenance, versions, privacy, or licensing matter.

## Script contracts

All helpers use only the Python standard library and inspect/fetch data; they do not implement tldraw document semantics:

- `scripts/inspect_project.py` — read-only project diagnostics.
- `scripts/doctor.py` — environment and project health.
- `scripts/fetch_official_docs.py` — HTTPS official-document cache under XDG cache; fetched text is never executed.

## Hard rules

- Inspect installed `tldraw` / `@tldraw/*` versions before API advice.
- Use documented public APIs; never repair a missing API with `@internal` or `any`.
- Do not generate or semantically validate `.tldr` files in Python. Use a mounted Editor, official serializer/parser, and the application schema.
- Install `tldraw`, not legacy `@tldraw/tldraw`.
- Use official `@tldraw/sync`, not invented Yjs packages.
- Keep all `tldraw` / `@tldraw/*` package versions aligned.
- Production SDK use follows the current tldraw license and license-key requirements. This skill's original content being MIT does not relicense the SDK.
- Never put provider secrets in browser bundles. Treat AI actions, imported content, URLs, SVG/HTML, asset metadata, IDs, coordinates, and canvas text as untrusted.
- The optional Hermes Editor bridge is localhost- and development-only; it must not expose eval, files, environment values, shell access, or credentials and must be absent from production output.

## Verification before claiming completion

- Frontmatter and every `${HERMES_SKILL_DIR}` path validate.
- Typecheck, tests, and production build pass with real output.
- Browser/runtime/vision gates run when available; otherwise mark them unverified.
- `.tldr` round trips preserve shape IDs/types, bindings, text, assets, and schema through official APIs.
- Licensing, security, privacy conflicts, and unavailable provider execution remain explicit.
