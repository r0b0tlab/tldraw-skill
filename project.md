---
project: tldraw World-Class Skill
status: verify
created: 2026-07-16
updated: 2026-07-18
owner: am423
agent: Hermes
tags:
- tldraw
- skill
- canvas
- typescript
---

## What This Is

Create and publish a version-aware Hermes skill for tldraw 5.2.5+ with complete public-capability routing, official runtime `.tldr` handling, secure development harnesses, deterministic evaluations, and reproducible tap distribution.

## Core Value

A research-grounded, peer-matched skill that makes tldraw workflows predictable and fast for Hermes users.

## Context

Hermes users and coding agents need correct, version-aware guidance across tldraw applications, artifacts, custom extensions, Driver automation, sync, Mermaid, migrations, and AI/starter-kit workflows. The implementation is complete locally and is in final independent-review and publication verification.

## Constraints

- **Tech Stack**: Hermes `SKILL.md`; Python 3 stdlib helpers; TypeScript/React evaluation apps; tldraw 5.2.5; Playwright; Fastify/SQLite sync harness.
- **Performance**: Skill runtime has no npm production dependency. Machine-specific browser evidence covers 3,999 shapes against the 4,000/page default; no universal latency claim.
- **Compatibility**: Inspect installed versions first. The skill targets tldraw 5.2.5 while routing older/newer projects through installed declarations, release notes, and current official sources.
- **Security**: Development bridges and harnesses are loopback/dev-only; imported files, URLs, IDs, operations, media, sync requests, and model output are untrusted.
- **Evidence**: Generated browser/runtime artifacts stay ignored. Durable conclusions and redacted reproducibility fixtures are committed under `tests/reviews/` and `tests/fixtures/`.

## Requirements

### Validated

- ✓ Correct progressive-disclosure routing for all public tldraw capability families — v1.0.0
- ✓ Official async `.tldr` serialization, parser `Result` handling, clean-store load, and fresh-Editor semantic verification — v1.0.0
- ✓ Custom shapes/tools/bindings/migrations/accessibility, Driver, Mermaid, exports, persistence, and error boundaries — v1.0.0
- ✓ Hardened local sync and AI/starter evaluation with explicit provider-unverified status when credentials are unavailable — v1.0.0
- ✓ Capability, activation, workflow, source-drift, upstream-drift, distribution, visual, performance, and security evidence — v1.0.0

### Active

- [ ] Complete post-remediation independent review with no unresolved critical/high finding.
- [ ] Commit/push, obtain green GitHub Actions, and reproduce release gates from a clean remote clone/profile.

### Out of Scope

- Private tldraw.com APIs and undocumented `@internal` symbols — outside the public SDK contract.
- Hand-authored production `.tldr` records in Python — schema/runtime semantics belong to tldraw.
- Production multiplayer or AI backend claims — repository harnesses are secure local evaluation systems, not deployed services.
- Provider-backed AI behavior without credentials — remains explicitly unverified rather than simulated.
- Generic diagrams, Excalidraw, HTML Canvas games, and unrelated React work — should not activate this skill.

## Current State

**Phase:** verify
**Last completed:** GitHub Actions passed on `main`, and a clean remote clone passed the full Python, eval-app, sync, agent, workflow, source, upstream, visual, benchmark, and audit gates without dirtying tracked files.
**In progress:** Complete clean-profile Hermes installation after fixing an ambiguous support-path phrase that the Hermes bundle parser interpreted as a missing file.
**Next action:** Push the bundle-reference regression fix, re-run CI, then install and inspect the remote skill in the no-bundled-skills profile.
**Blockers:** No code blocker. Provider-backed AI execution remains explicitly unverified because no supported provider credentials are available.
**Notes:** Publication is not complete until the remote clean-profile path and CI are verified.
## Architecture

- `skills/tldraw/` is the only distributable skill root; `SKILL.md` routes to concise references and stdlib inspection/fetch helpers.
- `tests/` owns deterministic structural, source, capability, activation, workflow, and release contracts.
- `eval-app/` exercises the public browser/runtime surface and proves the Hermes bridge is absent from production bundles.
- `integration/sync-eval/` proves room isolation, persistence, auth/CORS, bounded and magic-checked uploads, and two-client convergence.
- `integration/agent-eval/` evaluates official agent/workflow starters, action sanitization, secret scanning, CORS, migrations, and honest provider limits.
- Generated evidence is ignored; durable reviews summarize exact verified outcomes and limitations.

## Key Decisions

| Decision                                                                                                                     | Rationale                                                                                                                                                              | Outcome     |
|------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------|
| Use one progressive-disclosure software-development/tldraw skill with official runtime generation, not a Python .tldr clone  | tldraw is a React SDK, schema/runtime, sync stack, and agent platform; public APIs and serializers are the only reliable version-aware path                            | Accepted    |
| Treat installed package docs/types as primary for existing projects and current official docs as primary for greenfield work | tldraw minor releases may include breaking API changes and main-branch guidance can drift from installed versions                                                      | Accepted    |
| Use a repository source tree plus local symlink, stdlib Python inspectors, and a real TypeScript evaluation app              | This keeps runtime helpers portable while validating tldraw semantics with tldraw itself                                                                               | Accepted    |
| Publish the canonical skill under skills/tldraw, not singular skill/tldraw                                                   | Hermes custom taps discover SKILL.md only under the default skills/ root; using the standard path enables direct and tap installation without per-user taps.json edits | Accepted    |
## Tasks

### Phase: DEFINE

- [x] Identify target users and use cases
- [x] Define requirements
- [x] Identify constraints


- [x] Task 2: Review tldraw API, shape types, and examples


- [x] Task 3: Review Nous skill guidelines and peer skills
- [x] Task 1: Research tldraw .tldr schema and sample file
### Phase: DESIGN

- [x] Choose technology stack
- [x] Design architecture
- [x] Define data models


- [x] Task 9: [0.2] Freeze official source evidence and complete capability map


- [x] Task 10: [0.3] Produce authoritative current, malformed, and legacy .tldr fixtures
- [x] Task 8: [0.1] Reconcile ProjectsMD tracker and register implementation tasks


- [x] Task 12: [1.2] Write source, project, and starter routing references
- [x] Task 11: [1.1] Author concise routing-focused SKILL.md

- [x] Task 13: [1.3] Write complete capability references
### Phase: BUILD

- [x] Project setup
- [x] Core implementation
- [x] Error handling


- [x] Task 14: [2.1] Implement inspect_project.py with tests


- [x] Task 15: [2.2] Implement doctor.py with tests
- [x] Task 4: Write SKILL.md and helper scripts


- [x] Task 17: [3.1] Create and compile safe dev-only Hermes bridge
- [x] Task 16: [2.3] Implement fetch_official_docs.py with tests


- [x] Task 19: [3.3] Implement and visually verify diagram-authoring workflow
- [x] Task 18: [3.2] Implement and verify official .tldr round-trip workflow


- [x] Task 21: [4.2] Verify data, persistence, assets, import/export, and Mermaid branch
- [x] Task 20: [4.1] Verify shapes, tools, bindings, UI, and accessibility branch


- [x] Task 23: [4.4] Verify AI and starter-kit branch
- [x] Task 22: [4.3] Verify two-client sync and collaboration branch


- [x] Task 25: [4.6] Verify production readiness, performance, and security
- [x] Task 24: [4.5] Verify migration and upstream workflows
### Phase: VERIFY

- [x] Unit tests pass
- [x] Integration tests pass
- [x] Manual testing


- [x] Task 6: Test skill in a fresh Hermes session


- [x] Task 26: [5.1] Run structural and security validation
- [x] Task 5: Validate SKILL.md and generated .tldr files


- [x] Task 28: [5.3] Run activation precision and routing evaluation
- [x] Task 27: [5.2] Run machine capability coverage validation


- [x] Task 30: [5.5] Complete independent spec, API, security, and quality review
- [x] Task 29: [5.4] Run end-to-end workflow evaluation
### Phase: SHIP

- [x] Documentation
- [ ] Release packaging
- [ ] Tag release


- [x] Task 31: [6.1] Install skill live and verify in fresh Hermes session
- [ ] Task 7: Ship skill and update project state


- [ ] Task 33: [6.3] Verify clean-profile distribution and publication path
- [ ] Task 32: [6.2] Complete repository, release, and remote GitHub hygiene
## Discoveries

<!-- New information discovered during development -->

- On 2026-07-16 npm tldraw latest is 5.2.5; llms.txt contains 71 SDK feature links, 198 examples, and 31 release links. Starter kits are indexed separately.
- The tldraw 5.2.5 npm tarball includes DOCS.md, RELEASE_NOTES.md, README.md, and LICENSE.md.
- Current tldraw public license pages conflict on hobby-license data collection; the skill must flag the discrepancy and require checking installed/current terms before making privacy claims.
- Current starter-kit overview and README distinguish MIT-licensed starter application code from the SDK dependency, but the overview footer also says kits use the SDK license. Skill guidance must separate code provenance from the SDK license and avoid blanket licensing claims.
- tldraw currently does not accept external code contributions; upstream workflow should produce a fork/branch plus issue or reproducible report, not claim a PR will be accepted.
- No supported AI provider API key is present in this execution environment. AI branches can be compiled and structurally exercised, but no provider-backed canvas action may be claimed as runtime-verified.
- Upstream tldraw includes a real apps/vscode/extension/examples/v2.tldr fixture; use it for legacy migration validation instead of fabricating a legacy envelope.
- Hermes tap installs bundle SKILL.md plus references/templates/scripts/assets; root-level AGENTS.md is not guaranteed to be bundled, so cross-agent instructions also need a linked allowed-directory copy.
- The 2026-07-17 agent starter scaffold installs @cloudflare/workers-types ^4 with wrangler ^4.75, while current wrangler 4.112 requires workers-types ^5.20260714.1; npm install fails ERESOLVE until the dev dependency is aligned. After that narrow update, the agent starter production build passes.
- Local two-client sync runtime test passed with the official multiplayer starter: two same-room editors connected through @tldraw/sync/Cloudflare local worker; create propagated client A→B and position update propagated B→A, with one matching shape in both stores and zero browser JavaScript errors.
- The official 2026-07-17 agent starter UI and local worker load and production-build after the workers-types fix, but an actual prompt is blocked by missing provider credentials. The worker also emits the AI SDK system-message prompt-injection warning; skill guidance must require the dedicated system option, validation, least-privilege tools, and must not claim provider execution in this environment.
- Official tldraw 5.2.5 performance smoke: default maxShapesPerPage is 4,000 (confirmed by SDK docs and runtime). Creating 3,999 additional geo shapes in 100-shape batches reached the limit in about 295 ms total; a 100-shape update took 26 ms and two animation frames completed in 103 ms in the managed browser. Guidance must tune options deliberately rather than promise unlimited shapes.
## References

<!-- Links to documentation, examples, related projects -->

## Session Log

<!-- Date-stamped development entries -->
<!-- Format: - **YYYY-MM-DD** — Description. (duration) -->
- **2026-07-18** — Reconciled project state with the implemented tldraw 5.2.5 skill; remediated final API, security, activation-evidence, CI, CORS, upload, room-isolation, and production-bridge findings; full local regression is green. Publication and clean-clone verification remain pending.
- **2026-07-18** — Independent review gate closed: API/spec PASS, evidence/release PASS, and focused post-fix security PASS with no critical/high/medium findings. Local stable gates: 80 Python tests, agent 27/27, workflow 12/12.
- **2026-07-18** — Created and pushed public r0b0tlab/tldraw-skill. First CI run exposed a Vite dev server localhost/IPv6 bind mismatch. Added a failing regression contract, bound the server to 127.0.0.1, and made normal verify runs leave tracked runtime fixtures unchanged; local 82-test and browser gates pass.
- **2026-07-18** — Remote CI passed and a clean remote clone passed every documented runtime/source/audit gate with a clean worktree. Clean-profile Hermes installation then exposed one packaging incompatibility: slash-delimited overview prose was parsed as a support-file reference. Added a release regression contract and corrected the wording and install path.
