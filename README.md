# tldraw Hermes skill

Version-aware [Hermes Agent](https://hermes-agent.nousresearch.com/) skill for building, inspecting, automating, testing, migrating, and shipping applications with the **public [tldraw](https://tldraw.dev/) SDK**.

## What it covers

- React SDK integration and official starter kits (`npm create tldraw@latest`)
- Editor, store/signals, shapes/tools/bindings, UI/a11y
- Assets, persistence (`persistenceKey` → IndexedDB), `.tldr`, export, Mermaid
- `@tldraw/driver` automation and AI/agent kits
- `@tldraw/sync` multiplayer and self-hosted production guidance
- Migrations, licensing, security, upstream monorepo workflows

## Install with Hermes

Add the public repository as a custom skill tap, then install the `tldraw` skill:

```bash
hermes skills tap add r0b0tlab/tldraw-skill
hermes skills install r0b0tlab/tldraw-skill/tldraw
```

Or install the skill directly without subscribing to the tap:

```bash
hermes skills install r0b0tlab/tldraw-skill/skills/tldraw
```

Inspect community-source security findings before confirming installation. Custom taps use Hermes's `community` trust level and standard security scanner.

## Install for development

Canonical tree:

```text
skills/tldraw/
```

Symlink into Hermes (after checking for name collisions):

```bash
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}" # use ~/.hermes/profiles/<name> for a named profile
mkdir -p "$HERMES_HOME/skills/software-development"
ln -sfn "$(pwd)/skills/tldraw" \
  "$HERMES_HOME/skills/software-development/tldraw"
```

Hermes may install the published skill at a different internal path. Runtime instructions therefore use `${HERMES_SKILL_DIR}` rather than assuming this development symlink location.

Start a **new** Hermes session, then:

```bash
# discovery
hermes skills list   # or skills_list in-agent
# load
# skill_view name=tldraw
```

## Usage

Invoke with `/tldraw` or natural language that clearly targets tldraw/`.tldr`/Editor/Driver/sync/starters.

The skill **routes** to focused references; it does not vendor `llms-full.txt`. Helpers:

```bash
SKILL_DIR="${HERMES_HOME:-$HOME/.hermes}/skills/software-development/tldraw"
python3 "$SKILL_DIR/scripts/inspect_project.py" .
python3 "$SKILL_DIR/scripts/doctor.py" --project .
python3 "$SKILL_DIR/scripts/fetch_official_docs.py" --corpus index
```

## License

- **Original skill content** in this repository (SKILL.md, references authored here, tests metadata, scripts authored here): **MIT** — see `LICENSE`.
- **tldraw SDK**, examples, and many templates: **tldraw license** (source-available). Production use requires a current license key. See https://tldraw.dev/community/license.
- **Official agent/workflow starter material** retained under `integration/agent-eval/`: upstream MIT notice © tldraw Inc. is preserved in `integration/agent-eval/LICENSE.md`; this does not relicense the SDK dependency.
- Do not assume starter-kit application MIT terms relicense the SDK dependency.

## Provenance

Observed package baseline: **tldraw@5.2.5** (2026-07-17). Evidence and hashes: `skills/tldraw/references/source-manifest.json`. Capability coverage: `tests/capability-map.json`.

## Tests

The complete local gate uses real browser, sync, migration, and starter harnesses. Provider-backed AI execution is explicitly recorded as unverified when credentials are unavailable; it is never simulated.

```bash
export PYTHONDONTWRITEBYTECODE=1
python3 tests/validate_skill.py skills/tldraw
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tests/verify_source_manifest.py
python3 tests/verify_source_manifest.py --network
python3 tests/verify_upstream_dry_run.py
python3 tests/verify_upstream_dry_run.py --network
python3 tests/check_capability_coverage.py \
  --index https://tldraw.dev/llms.txt \
  --map tests/capability-map.json \
  --skill skills/tldraw

npm ci --prefix eval-app
npm exec --prefix eval-app -- playwright install chromium
npm test --prefix eval-app
npm run verify --prefix eval-app
npm run benchmark --prefix eval-app
npm run visual:scenarios --prefix eval-app

npm ci --prefix integration/sync-eval
npm run typecheck --prefix integration/sync-eval
npm run build --prefix integration/sync-eval
npm run test:unit --prefix integration/sync-eval
npm run test:integration --prefix integration/sync-eval

npm ci --prefix integration/agent-eval
npm run eval --prefix integration/agent-eval

python3 tests/run_workflow_eval.py
```

Generated evidence is written below `tests/results/` and `eval-app/artifacts/`; these machine-specific outputs are intentionally ignored by Git. Stable review summaries live in `tests/reviews/`. CI reruns the harnesses and uploads fresh evidence.

## Repository agents

See root `AGENTS.md` and `skills/tldraw/AGENTS.md`.
