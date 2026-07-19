# Release process

1. Re-read current tldraw licensing and conflicting hobby/privacy sources recorded in `skills/tldraw/references/source-manifest.json`.
2. Run the complete gate in `README.md`, including live source/upstream drift checks, browser, ErrorBoundary, five-scenario visual pack, sync, agent/starter, benchmark, and workflow evidence.
3. Run `git diff --check`, the repository secret scan, and `npm audit --omit=dev --audit-level=high` for each Node project. If the AI starter audit tree changes, update `integration/agent-eval/SECURITY.md` with the observed advisory, affected packages, ranges, and remediation status.
4. Install a copied (not symlinked) `skills/tldraw/` directory into a fresh Hermes profile and verify discovery, `skill_view`, and all three stdlib helpers.
5. Push `main`; require CI to pass.
6. Clone the public repository into a clean temporary directory and repeat documented install and validation commands.
7. Only after those gates, create a signed or annotated `vX.Y.Z` tag and GitHub release from the matching changelog entry.

Never include `.env` files, Hermes profile state, credentials, generated browser artifacts, SQLite databases, caches, or `node_modules` in a release.
