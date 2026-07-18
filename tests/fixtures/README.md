# `.tldr` fixture provenance

All fixtures are JSON text, but they must be read and written through tldraw's official runtime APIs rather than treated as a hand-authored stable schema.

| File | Provenance | Expected result |
|---|---|---|
| `valid-current.tldr` | Generated at runtime by `serializeTldrawJson(editor)` in `eval-app` using `tldraw@5.2.5` | `parseTldrawJsonFile` accepts it and preserves the diagram's semantic invariants |
| `malformed-envelope.tldr` | One mutation of `valid-current.tldr`: `tldrawFileFormatVersion` changed from a number to the string `not-a-number` | `parseTldrawJsonFile` rejects it |
| `legacy-upstream-v2.tldr` | Official tldraw repository fixture at tag `v5.2.5`: `apps/vscode/extension/examples/v2.tldr` | Current `parseTldrawJsonFile` accepts and migrates it; runtime verification observed 7 records |

Legacy source:

- URL: https://github.com/tldraw/tldraw/blob/v5.2.5/apps/vscode/extension/examples/v2.tldr
- Raw SHA-256: `dbe86d7a991493f29bb32189d7b1704494b5b4a70fcaaf8f01ba20b12872c385`
- Retrieved: 2026-07-17

Regenerate current and malformed fixtures with:

```bash
cd eval-app
npm ci
npm run verify
```

The verification run also parses every fixture with the live `tldraw@5.2.5` runtime and checks that the production bundle does not expose the dev bridge.
