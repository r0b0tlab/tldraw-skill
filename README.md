# tldraw Hermes skill

[![CI](https://github.com/r0b0tlab/tldraw-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/r0b0tlab/tldraw-skill/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/r0b0tlab/tldraw-skill)](https://github.com/r0b0tlab/tldraw-skill/releases/latest)
[![Original content: MIT](https://img.shields.io/badge/original_content-MIT-blue.svg)](LICENSE)

A version-aware [Hermes Agent](https://hermes-agent.nousresearch.com/) skill for building, inspecting, automating, testing, migrating, and shipping applications with the public [tldraw SDK](https://tldraw.dev/).

The skill targets tldraw 5.2.5+ while treating the version installed in your project as authoritative. It routes Hermes to focused, source-backed guidance instead of loading one large documentation dump or guessing APIs from memory.

## Contents

- [Why this skill](#why-this-skill)
- [What it covers](#what-it-covers)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Example prompts](#example-prompts)
- [How it works](#how-it-works)
- [Helper scripts](#helper-scripts)
- [Repository layout](#repository-layout)
- [Security model](#security-model)
- [Known limitations](#known-limitations)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Release and provenance](#release-and-provenance)
- [License](#license)

## Why this skill

Public tldraw work spans much more than mounting a canvas. A production change may touch Editor state, custom schemas, bindings, accessibility, `.tldr` serialization, assets, multiplayer, automation, migrations, licensing, and deployment security at the same time.

This skill gives Hermes a repeatable workflow:

1. Inspect the project and exact installed package versions.
2. Select the relevant public SDK guidance and official sources.
3. Implement with version-matched APIs and schemas.
4. Exercise the result with type, browser, visual, sync, or agent harnesses.
5. Label anything that was not actually run as unverified.

It is designed to prevent common failures such as invented package names, hand-authored `.tldr` records, mixed `@tldraw/*` versions, private API usage, unsafe browser credentials, and demo sync infrastructure presented as production-ready.

## What it covers

| Area | Coverage |
| --- | --- |
| Application setup | Existing React apps, official starter kits, CSS and full-size container requirements |
| Editor and state | Editor, store, signals, history, events, camera, input, side effects, and `@tldraw/driver` |
| Extensibility | Custom shapes, tools, bindings, migrations, geometry, styles, rich text, and error boundaries |
| UI and accessibility | Components, overrides, themes, preferences, keyboard behavior, i18n, reduced motion, contrast, and ARIA |
| Files and data | Assets, IndexedDB persistence, snapshots, official `.tldr` parsing/serialization, clipboard, SVG/raster export, and Mermaid |
| Collaboration | `@tldraw/sync`, presence, room isolation, auth, persistence, CORS, uploads, and self-hosting order |
| AI and starters | Official agent/chat/workflow starters, prompt parts, allowlisted actions, sanitization, and credential boundaries |
| Production work | Performance, security, licensing, deployment, testing, debugging, version migration, and upstream repository workflows |

The detailed capability-to-reference index lives in [`skills/tldraw/references/capability-map.md`](skills/tldraw/references/capability-map.md).

## Requirements

### To use the installed skill

- A working Hermes Agent installation.
- Python 3.10+ for the three optional standard-library helper scripts. CI exercises them on Python 3.12.
- An existing tldraw project or a request to create one. The skill inspects the project's package manager and installed versions before giving API-specific advice.

### To run this repository's complete evaluation suite

- Node.js 22.x and npm. GitHub Actions currently uses Node 22.
- Python 3.12 recommended.
- Playwright Chromium for browser, visual, and two-client sync verification.
- Network access for the optional current-source and upstream-drift checks.

The installed skill itself has no npm runtime dependency. Node and browser dependencies belong to the repository-owned evaluation harnesses.

## Install

### Direct install

Install the exact repository-relative skill path:

```bash
hermes skills install r0b0tlab/tldraw-skill/skills/tldraw
```

Hermes treats public community skills as untrusted until scanned. Review the scanner result before confirming installation. The v1.0.0 publication path was verified in a clean profile with a `SAFE` verdict and all 19 distributable files hash-matching the source package.

### Custom tap

Subscribe to the repository first if you want it listed as a custom tap:

```bash
hermes skills tap add r0b0tlab/tldraw-skill
hermes skills install r0b0tlab/tldraw-skill/skills/tldraw
```

Verify the installed skill:

```bash
hermes skills list --source hub
```

Start a new Hermes session after installation so skill discovery runs against the updated skill set.

### Development checkout

```bash
git clone https://github.com/r0b0tlab/tldraw-skill.git
cd tldraw-skill

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_HOME/skills/software-development"
ln -sfn "$(pwd)/skills/tldraw" \
  "$HERMES_HOME/skills/software-development/tldraw"
```

For a named profile, set `HERMES_HOME` to `~/.hermes/profiles/<profile>` before creating the symlink. The canonical distributable root remains [`skills/tldraw/`](skills/tldraw/).

Hermes may place a hub-installed copy at a different internal location. Instructions inside the skill therefore use `${HERMES_SKILL_DIR}` instead of assuming the development symlink path.

## Quick start

After installing the skill, open a new Hermes session in your project and ask:

```text
/tldraw Inspect this project, report the installed tldraw package versions and
version skew, then tell me which public APIs and checks apply before changing code.
```

A normal tldraw task follows this sequence:

1. `inspect_project.py` identifies the package manager, lockfile, framework, tldraw packages, custom schema files, and feature signals.
2. `doctor.py` checks Node, package managers, CSS/container signals, version mismatch, and browser indicators without printing secret values.
3. Hermes reads the smallest relevant reference and verifies it against installed package declarations or current official sources.
4. Hermes changes the project and runs the strongest available real checks.
5. Browser, visual, sync, or provider behavior that was not exercised is reported as unverified.

You can also invoke the skill through natural language. Explicit references to tldraw, `.tldr`, `@tldraw/driver`, `@tldraw/sync`, the Editor, custom shape utilities, or official tldraw starters are positive activation signals.

## Example prompts

### Diagnose an existing app

```text
Inspect this tldraw app before editing it. Find package-version skew, missing CSS
or container sizing, stale APIs, and custom schema files. Fix the issues and run
the project's real typecheck, tests, production build, and browser verification.
```

### Build a custom shape safely

```text
Add a custom tldraw shape with typed props, geometry, rich text, accessibility
descriptions, and a migration from the previous prop schema. Register it in the
app schema and prove a serialize/parse/reload round trip in a fresh Editor.
```

### Create a `.tldr` workflow

```text
Build a real tldraw artifact using the Editor and official serializer. Parse it
with the same schema, load it into a clean store and fresh Editor, verify shape
and binding semantics, export SVG, and return the actual artifact paths.
```

### Add collaboration

```text
Add self-hosted tldraw sync for this app. Use explicit authentication and allowed
origins, isolate rooms, persist state, constrain uploads, and verify convergence,
room isolation, rejection paths, and restart recovery with two clients.
```

### Customize an AI starter

```text
Inspect this official tldraw agent starter. Add one prompt part and one allowlisted
action with schema validation and sanitization. Keep provider credentials out of
the browser bundle, scan the build, and clearly separate credential-free harness
results from provider-backed behavior.
```

### Convert Mermaid into editable tldraw content

```text
Convert this Mermaid diagram through the installed @tldraw/mermaid API, preserve
editable semantic shapes and bindings, improve spacing and labels in the Editor,
and verify the result visually without overlapping nodes or unbound arrows.
```

## How it works

[`skills/tldraw/SKILL.md`](skills/tldraw/SKILL.md) is a progressive-disclosure router. It does not vendor `llms-full.txt` or treat a repository snapshot as universally correct.

Source precedence is:

1. Installed package types and package-local documentation.
2. Release notes between the installed and target versions.
3. Current official tldraw documentation and LLM corpora.
4. Official examples and starter kits for complex patterns.
5. The upstream repository's main branch only for contribution work or when official docs explicitly point there.

The observed source baseline is `tldraw@5.2.5` from 2026-07-17. Before applying API guidance, the skill inspects the current project and prefers its installed version. Provenance URLs, versions, retrieval dates, and hashes are recorded in [`source-manifest.json`](skills/tldraw/references/source-manifest.json).

### Task routing

| Task | Primary reference |
| --- | --- |
| Setup and official starters | [`project-routing-and-starters.md`](skills/tldraw/references/project-routing-and-starters.md) |
| Version policy and stale APIs | [`source-and-version-policy.md`](skills/tldraw/references/source-and-version-policy.md) |
| Editor, store, history, Driver | [`editor-store-state-driver.md`](skills/tldraw/references/editor-store-state-driver.md) |
| Shapes, tools, and bindings | [`shapes-tools-bindings.md`](skills/tldraw/references/shapes-tools-bindings.md) |
| UI and accessibility | [`ui-accessibility-internationalization.md`](skills/tldraw/references/ui-accessibility-internationalization.md) |
| Files, assets, export, Mermaid | [`data-files-assets-export-mermaid.md`](skills/tldraw/references/data-files-assets-export-mermaid.md) |
| Diagram quality | [`diagram-authoring.md`](skills/tldraw/references/diagram-authoring.md) |
| Sync and collaboration | [`sync-collaboration.md`](skills/tldraw/references/sync-collaboration.md) |
| AI and starter kits | [`ai-and-starter-kits.md`](skills/tldraw/references/ai-and-starter-kits.md) |
| Performance, security, license, deployment | [`performance-security-licensing-deployment.md`](skills/tldraw/references/performance-security-licensing-deployment.md) |
| Testing, migrations, upstream work | [`testing-debugging-migrations-upstream.md`](skills/tldraw/references/testing-debugging-migrations-upstream.md) |

## Helper scripts

All helpers use only the Python standard library and support machine-readable JSON. The inspector and doctor are read-only. The documentation fetcher never mutates the inspected project; it writes only to its dedicated cache directory.

From a repository checkout:

```bash
SKILL_DIR="$(pwd)/skills/tldraw"
```

Inside an active Hermes skill, the equivalent root is `${HERMES_SKILL_DIR}`.

### Inspect a project

```bash
python3 "$SKILL_DIR/scripts/inspect_project.py" /path/to/project
python3 "$SKILL_DIR/scripts/inspect_project.py" /path/to/project --json
```

The report includes package manager, lockfile, framework, declared and resolved `tldraw` package versions, React and TypeScript versions, likely custom files, sync/Driver/Mermaid/agent signals, version skew, and warnings. It reports license-key presence as a boolean and never prints the value.

### Run diagnostics

```bash
python3 "$SKILL_DIR/scripts/doctor.py" --project /path/to/project
python3 "$SKILL_DIR/scripts/doctor.py" --project /path/to/project --json
```

The doctor adds Node and package-manager availability, CSS import and full-size-container signals, browser-runtime indicators, and version mismatch checks. It performs no network access and writes nothing.

### Cache official documentation

```bash
python3 "$SKILL_DIR/scripts/fetch_official_docs.py" --corpus index
python3 "$SKILL_DIR/scripts/fetch_official_docs.py" --corpus docs --refresh --json
python3 "$SKILL_DIR/scripts/fetch_official_docs.py" --corpus index --offline --json
```

Available corpora are `index`, `docs`, `examples`, `releases`, and `full`. Cached text and SHA-256 metadata live under `${XDG_CACHE_HOME:-~/.cache}/hermes/tldraw/`. Fetches are size-bounded, validate official/loopback URLs and redirects, write atomically, and retain the last valid cache after a failed refresh. Fetched text is treated as data, never executed.

## Repository layout

```text
.
├── skills/tldraw/                 # distributable Hermes skill
│   ├── SKILL.md                   # activation, workflow, and task router
│   ├── references/                # focused, version-aware public SDK guidance
│   ├── scripts/                   # stdlib inspector, doctor, and docs cache
│   └── templates/                 # localhost-only development bridge template
├── tests/                         # structural, source, activation, and release contracts
├── eval-app/                      # real React/browser/.tldr/Driver/visual harness
├── integration/sync-eval/         # local two-client sync and security harness
├── integration/agent-eval/        # agent/starter, migration, and bundle-safety harness
├── .github/workflows/ci.yml       # complete CI gate and evidence upload
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
└── RELEASING.md
```

Generated screenshots, builds, databases, caches, dependencies, and machine-specific evidence are ignored. Durable, reviewable conclusions live under [`tests/reviews/`](tests/reviews/).

## Security model

| Boundary | Policy |
| --- | --- |
| Community installation | Inspect Hermes's community-skill scan before accepting installation. |
| Project inspection | Helpers are read-only, standard-library-only, and secret-value safe. |
| Development bridge | Development builds only, explicit opt-in, loopback hosts only, no arbitrary evaluation, shell, filesystem, or environment access. |
| Production bundle | CI builds the app and verifies that Hermes/Driver bridge code is absent from production output. |
| Imported data | `.tldr`, snapshots, SVG/HTML, assets, URLs, redirects, IDs, and metadata are untrusted and must be parsed, bounded, and sanitized. |
| Sync | Use authentication, explicit origins, room isolation, upload limits, MIME signature checks, safe persistence, and non-loopback bind controls. |
| AI | Provider credentials stay in server/worker environments. Model output is schema-validated, sanitized, and restricted to allowlisted actions. |
| Licensing | The skill's original content is MIT; the tldraw SDK remains source-available under its own license. |

The local sync and agent systems in this repository are evaluation harnesses, not hosted production services. Review [`SECURITY.md`](SECURITY.md), [`integration/sync-eval/SECURITY.md`](integration/sync-eval/SECURITY.md), and the deployment guidance before adapting them.

Report a vulnerability privately through a [GitHub Security Advisory](https://github.com/r0b0tlab/tldraw-skill/security/advisories/new). Do not put API keys, license keys, private canvas contents, or user documents in a public issue.

## Known limitations

- Scope is documented public SDK APIs, published packages, and official starters. It does not cover private tldraw.com internals, undocumented `@internal` symbols, or unrelated generic Canvas/WebGL work.
- Provider-backed AI behavior is explicitly unverified because the release gate did not use provider credentials. Credential-free starter architecture, typecheck, build, sanitization, action, and secret-scan paths are verified; live model quality is not.
- Six low-severity transitive advisories in the retained AI starter dependency tree are documented. High-severity production dependency audits pass.
- The sync and agent servers are local evaluation harnesses, not production deployment templates or managed services.
- The observed documentation/package baseline is tldraw 5.2.5. Newer projects must be inspected and checked against their installed declarations and release notes.
- A machine-specific Chromium baseline exercises 3,999 shapes against tldraw's default 4,000-shape page limit. It is evidence from that environment, not a universal latency guarantee.
- Custom shapes and bindings are portable only to hosts that register the same utilities and schema. A custom `.tldr` file is not automatically portable to tldraw.com.
- `hideUi` hides default chrome but is not a permission or security boundary. In the tested 5.2.5 runtime, built-in keyboard shortcuts remain mounted.
- The tldraw SDK is not MIT. Production use requires compliance with the current tldraw license and a valid license key where applicable.

## Testing

### Fast structural gate

Run the validator before unit tests so invalid package content fails before Python can create bytecode caches:

```bash
export PYTHONDONTWRITEBYTECODE=1
python3 tests/validate_skill.py skills/tldraw
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tests/verify_source_manifest.py
python3 tests/run_workflow_eval.py
```

### Complete local gate

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

Machine-specific outputs go below `tests/results/` and `eval-app/artifacts/` and remain ignored. Stable independent-review summaries live in [`tests/reviews/`](tests/reviews/). CI recreates the harness evidence and uploads it for each run.

Harness details:

- [`eval-app/README.md`](eval-app/README.md)
- [`integration/sync-eval/README.md`](integration/sync-eval/README.md)
- [`integration/agent-eval/README-EVAL.md`](integration/agent-eval/README-EVAL.md)

## Troubleshooting

### Hermes cannot fetch the skill

Use the complete repository-relative identifier, including `skills/tldraw`:

```bash
hermes skills install r0b0tlab/tldraw-skill/skills/tldraw
```

The shorter `r0b0tlab/tldraw-skill/tldraw` form is not the supported path. Confirm that the public repository is reachable, list configured taps, and inspect the command's text output rather than relying only on its process exit code.

### The skill is installed but does not activate

Start a new Hermes session, confirm `tldraw` is enabled with `hermes skills list --source hub`, and use `/tldraw` or mention tldraw explicitly. Generic requests such as “draw a diagram” intentionally do not force this skill when no tldraw preference is present.

### Guidance does not match the project

Run `inspect_project.py` and check declared versus resolved versions. Prefer installed types and package-local documentation over this repository's 5.2.5 baseline. Keep `tldraw` and all `@tldraw/*` packages aligned unless the installed package declarations prove otherwise.

### The canvas is blank or incorrectly sized

Ensure the app imports tldraw's CSS and that the canvas container has an explicit full-size layout. Run `doctor.py`; its `css_container` report checks both signals.

### A `.tldr` file fails to parse or loses custom records

Use `parseTldrawJsonFile` with the same schema used by the app. Register matching custom shape and binding utilities, handle parser errors explicitly, load into a clean store, and verify semantics in a fresh Editor. Do not patch raw records or schema versions by hand.

### Browser verification cannot start

Install the repository dependencies and Playwright Chromium:

```bash
npm ci --prefix eval-app
npm exec --prefix eval-app -- playwright install chromium
```

The verification harness binds explicitly to `127.0.0.1` to avoid localhost IPv4/IPv6 mismatch in CI.

### Sync clients are rejected

Check the room token and browser origin. The local harness accepts loopback origins by default, rejects arbitrary origins, enforces bounded image uploads, and refuses a non-loopback bind while using its demo token. See [`integration/sync-eval/README.md`](integration/sync-eval/README.md).

### AI evaluation is marked unverified

That status is intentional when no supported provider credential was used. Do not replace it with simulated success. Configure credentials only in the starter's server/worker environment, run the provider path, and preserve browser bundle and secret-scan checks.

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and follow these rules:

1. Verify claims against installed tldraw packages, then current official documentation.
2. Keep `SKILL.md` concise and route detail into focused references.
3. Use the official TypeScript runtime for `.tldr` generation, parsing, migration, and semantic verification.
4. Add a regression test for every behavior or documentation-contract change.
5. Run the relevant harnesses and leave generated evidence untracked.
6. Preserve licensing and provenance boundaries.

Repository-specific agent instructions are in [`AGENTS.md`](AGENTS.md) and [`skills/tldraw/AGENTS.md`](skills/tldraw/AGENTS.md).

For bugs and feature requests, use [GitHub Issues](https://github.com/r0b0tlab/tldraw-skill/issues). For security reports, use a private GitHub Security Advisory instead.

## Release and provenance

- Current release: [v1.0.0](https://github.com/r0b0tlab/tldraw-skill/releases/tag/v1.0.0)
- Changes: [`CHANGELOG.md`](CHANGELOG.md)
- Release procedure: [`RELEASING.md`](RELEASING.md)
- Source URLs, dates, versions, and hashes: [`source-manifest.json`](skills/tldraw/references/source-manifest.json)
- Machine capability map: [`tests/capability-map.json`](tests/capability-map.json)
- CI workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

A release is not considered verified solely because it was committed. The release process requires an exact-commit green CI run, a clean public HTTPS clone, the documented gates, a clean worktree afterward, a clean-profile Hermes installation, and installed-file hash parity.

## License

- Original skill content in this repository, including `SKILL.md`, authored references, tests metadata, and authored scripts: MIT. See [`LICENSE`](LICENSE).
- The tldraw SDK, packages, examples, and many templates: source-available under the [tldraw license](https://tldraw.dev/community/license). Production use requires compliance with the current license and a valid key where applicable.
- Official agent/workflow starter material retained under `integration/agent-eval/` preserves its upstream MIT notice in [`integration/agent-eval/LICENSE.md`](integration/agent-eval/LICENSE.md). That notice does not relicense the tldraw SDK dependency.
- Starter application terms do not override the licenses of their dependencies.
