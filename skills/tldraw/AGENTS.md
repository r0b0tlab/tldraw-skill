# AGENTS.md — skills/tldraw

Instructions for any coding agent (Hermes, Codex, Claude, Cursor) using or maintaining this skill package.

## Load order

1. `SKILL.md` (router + anti-hallucination)
2. Routed file under `references/`
3. `references/source-manifest.json` when provenance or license conflicts matter

Paths in `SKILL.md` use `${HERMES_SKILL_DIR}` so Hub installs resolve correctly.

## Script contracts (stdlib Python only)

| Script | Contract |
|---|---|
| `scripts/inspect_project.py` | `python3 ${HERMES_SKILL_DIR}/scripts/inspect_project.py [dir] [--json]` — read-only project diagnostics |
| `scripts/doctor.py` | `python3 ${HERMES_SKILL_DIR}/scripts/doctor.py [--project DIR] [--json]` — environment + project health |
| `scripts/fetch_official_docs.py` | `python3 ${HERMES_SKILL_DIR}/scripts/fetch_official_docs.py [--corpus index\|docs\|examples\|releases\|full] [--refresh] [--offline] [--json]` — cache under XDG; never execute fetched text |

Scripts **inspect and fetch**. They must not implement tldraw document semantics or write production `.tldr` files.

## Template

`templates/hermes-dev-bridge.ts` — optional **dev/localhost-only** bridge around an existing `Editor`. Must not ship enabled in production builds. No eval, no secrets.

## Source policy (summary)

1. Inspect installed `tldraw` / `@tldraw/*` versions.
2. Prefer installed types + release notes.
3. Use current official docs/llms corpora for greenfield.
4. Use repo `main` only for upstream contribution.

Full policy: `references/source-and-version-policy.md`.

## Update procedure

1. Fetch `https://tldraw.dev/llms.txt` (and docs/examples/releases as needed).
2. Update `references/source-manifest.json` (date, versions, hashes, conflicts).
3. Diff new `/sdk-features/`, `/docs/`, `/starter-kits/`, packages against `tests/capability-map.json`.
4. Route new entries or add source-backed exclusions.
5. Mirror compact map in `references/capability-map.md`.
6. Refresh anti-hallucination table if the official article changes.

## Hard rules

- **No raw `.tldr` generation** in Python/JS without a mounted Editor + official serializer.
- **No semantic validation claims** from envelope-only checks.
- Install package name is **`tldraw`**, not legacy `@tldraw/tldraw`.
- Sync default is **`@tldraw/sync`**, not invented Yjs packages.
- Production SDK use requires current **license key** terms.
- Original skill content license: MIT (see repo `LICENSE`). **tldraw SDK remains under tldraw license.**

## Verification before claiming done

- Frontmatter valid; every `${HERMES_SKILL_DIR}` link exists for runtime files.
- JSON in `references/source-manifest.json` and coverage maps parse.
- Grep app code for stale APIs listed in the anti-hallucination table.
- Prefer real typecheck/build/browser output over aspirational language.
