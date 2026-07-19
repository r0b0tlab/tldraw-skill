# Agent evaluation security notes

This directory contains a local evaluation harness for tldraw's agent and workflow starters. It is not a hosted service or a production deployment template.

## Current dependency advisory

Observed on 2026-07-18 with:

```bash
npm audit --omit=dev --prefix integration/agent-eval
```

`npm audit` reports six low-severity affected package entries. They all trace to one advisory:

- [GHSA-866g-f22w-33x8](https://github.com/advisories/GHSA-866g-f22w-33x8): uncontrolled resource consumption in `@ai-sdk/provider-utils` versions up to and including 3.0.97.

| Affected package entry | Relationship | Reported vulnerable range |
| --- | --- | --- |
| `@ai-sdk/provider-utils` | Transitive root of the advisory | `<=3.0.97` |
| `@ai-sdk/gateway` | Transitive | `<=2.0.115` |
| `@ai-sdk/anthropic` | Direct harness dependency | `<=2.0.87` |
| `@ai-sdk/google` | Direct harness dependency | `<=2.0.82` |
| `@ai-sdk/openai` | Direct harness dependency | `<=2.0.114` |
| `ai` | Direct harness dependency | `<=0.0.0-fd764a60-20260114143805 || 3.0.22 - 6.0.0` |

The count is six affected package entries, not six independent advisories. At the observed lockfile state, npm reports no moderate, high, or critical production dependency advisories for this harness. Its proposed fixes require semver-major AI SDK upgrades, so they need compatibility review against the retained starter architecture rather than an automatic lockfile rewrite.

CI fails on high or critical production dependency findings for every Node project. Maintainers should rerun the audit before releases and update this inventory when the advisory tree or compatible fix changes.

## Trust boundaries

- Keep provider credentials in server or worker environments. Never place them in browser code, committed files, logs, screenshots, or generated evidence.
- Treat prompts, model output, URLs, uploads, metadata, IDs, and imported canvas records as untrusted.
- Validate model output against schemas and restrict execution to explicit allowlisted actions.
- Keep the local harness behind loopback-only development controls unless production authentication, authorization, origin policy, rate limits, upload limits, and persistence controls are designed and reviewed separately.
- Do not claim provider-backed behavior passed unless a real provider path was exercised and its result was retained without exposing secrets.

Report repository vulnerabilities through the private GitHub Security Advisory flow described in the root [`SECURITY.md`](../../SECURITY.md).
