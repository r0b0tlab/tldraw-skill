# Agent evaluation harness (tldraw 5.2.5)

Repository-owned evaluation of the **official agent starter** plus a **workflow** starter family, with sanitization/allowlist tests and legacy `.tldr` migration evidence.

## Origin

```bash
npm create tldraw@latest -- --template agent --no-telemetry
npm create tldraw@latest -- --template workflow --no-telemetry
```

Pinned `tldraw@5.2.5` / `@tldraw/tlschema@5.2.5`.

## Customizations (faithful to starter patterns)

| Kind | Name | Location |
|------|------|----------|
| Prompt part | `evalSession` | `client/parts/EvalSessionPartUtil.ts`, `shared/schema/PromptPartDefinitions.ts`, harness mirror |
| Action | `highlight-eval` | `client/actions/HighlightEvalActionUtil.ts`, `shared/schema/AgentActionSchemas.ts`, harness mirror |
| Server allowlist | least-privilege gate | `harness/allowlist.ts` → `worker/allowlist.ts` + `AgentService` stream filter |
| Sanitization extract | IDs, bounds, offsets, ops, text | `harness/sanitize.ts` |

## Dependency repair (reproduced)

`npm install` failed with ERESOLVE: `wrangler@4.112` peerOptional `@cloudflare/workers-types@^5.20260714.1` vs starter `^4`. Fixed by aligning types to `^5.20260714.1` (no `--force`).

## Commands

```bash
cd integration/agent-eval
npm install
npm test                 # harness unit tests
npm run typecheck
npm run build            # agent production build
npm run scan:bundle      # no provider secrets in browser bundle
npm run migrate:legacy   # official v2.tldr → 5.2.5 parser
npm run eval             # full evidence → tests/results/agent/
```

## Provider execution

**Unverified** without credentials. This harness does **not** synthesize provider responses.

## Evidence

Machine-readable output under `tests/results/agent/`:

- `agent-eval-evidence.json`
- `legacy-v2-migration.json`
- `bundle-secret-scan.json`
- step logs
