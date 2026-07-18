# AGENTS.md — tldraw Hermes skill (repository)

## Purpose

This repository develops a Hermes skill that routes agents through the **public tldraw SDK** surface: React canvas apps, Editor/store, shapes/tools/bindings, UI/a11y, assets/`.tldr`/export/Mermaid, Driver, sync, AI/starter kits, migrations, licensing, and upstream monorepo work.

Canonical skill tree: `skills/tldraw/`.

## Non-negotiables

1. **No raw Python `.tldr` generation** and no claiming semantic validity from structural JSON checks alone. Use a live `Editor` + `serializeTldrawJson` / `parseTldrawJsonFile` with the app schema.
2. **Version inspection first** — prefer installed package types/docs over main-branch lore.
3. **Public APIs only** — no `@internal`, no invented packages (`@tldraw/yjs`, etc.).
4. **License honesty** — SDK is source-available (tldraw license), not MIT. This repo’s **original skill prose/scripts** are MIT; the tldraw dependency is not.
5. **Record doc conflicts** (e.g. hobby data collection) instead of silently picking one wording — see `skills/tldraw/references/source-manifest.json`.

## Layout

| Path | Role |
|---|---|
| `skills/tldraw/SKILL.md` | Concise task router (load first) |
| `skills/tldraw/references/` | Progressive references + source manifest + capability map |
| `skills/tldraw/scripts/` | stdlib helpers: `inspect_project.py`, `doctor.py`, `fetch_official_docs.py` |
| `skills/tldraw/templates/` | Dev-only bridge template |
| `tests/` | Skill validation, coverage, activation/workflow cases (not installed as skill runtime) |
| `project.md` | ProjectsMD tracker |

## Agent workflow in this repo

1. Read `project.md` and the plan under `.hermes/plans/` when implementing.
2. For skill content changes, keep `tests/capability-map.json` and `references/capability-map.md` aligned with current `https://tldraw.dev/llms.txt`.
3. Do not commit secrets, `node_modules`, caches, or `tests/results/` binaries.
4. Do not mark capabilities “supported” without real build/runtime evidence.

## Local install (after scripts exist)

```bash
# After collision checks:
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}" # or ~/.hermes/profiles/<name>
mkdir -p "$HERMES_HOME/skills/software-development"
ln -sfn "$(pwd)/skills/tldraw" \
  "$HERMES_HOME/skills/software-development/tldraw"
```

Verify in a **fresh** Hermes session (`skills_list` / `skill_view`).

## Related docs

- Skill-local agent notes: `skills/tldraw/AGENTS.md`
- Hermes skills: https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills
- tldraw for agents: https://tldraw.dev/llms.txt
