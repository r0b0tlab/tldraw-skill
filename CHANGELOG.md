# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning for this repository's skill content and tooling. tldraw dependency versions are tracked separately.

## [1.0.0] - 2026-07-18

### Added

- Routing-focused Hermes skill for tldraw SDK, Editor/store, custom shapes/tools/bindings/UI, persistence/assets/files/export/Mermaid, Driver, sync, AI starters, migrations, security, licensing, and upstream workflows.
- Standard-library project inspector, doctor, and official-doc cache helpers.
- Source manifest and capability map pinned and validated against tldraw 5.2.5.
- Browser evaluation app with official `.tldr` round trips, custom schema migrations, diagram generation, real Driver operations, IndexedDB reload/cross-tab checks, export, Mermaid, accessibility, production bridge exclusion, and a reproducible 3,999-shape baseline.
- Repository-owned two-client sync harness with token rejection, presence, room isolation, SQLite persistence, and restart recovery.
- Credential-free agent/starter and legacy migration harness with input sanitization, server action allowlisting, custom prompt/action examples, build/typecheck checks, and bundle secret scanning.
- Fresh-profile activation evaluation, copied-distribution checks, and machine-readable workflow aggregation.
- GitHub Actions validation and Dependabot configuration.

### Security

- Development bridge is gated to localhost and development builds and is checked absent from production output.
- Provider credentials are never embedded in browser bundles; unavailable live provider execution is labeled unverified rather than simulated.

[1.0.0]: https://github.com/r0b0tlab/tldraw-skill/releases/tag/v1.0.0
