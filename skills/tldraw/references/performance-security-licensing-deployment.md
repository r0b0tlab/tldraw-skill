# Performance, security, licensing, and deployment

## Performance

- Large documents: measure shape count, load time, interaction; use culling/visibility and performance hooks/examples.
- The documented default `maxShapesPerPage` is **4,000**; raise it only deliberately and re-run interaction/export/sync baselines.
- Batch mutations with `editor.run`.
- Prefer asset resolve tiers (screenScale/DPR) over full-res always.
- Avoid unnecessary React re-renders outside `track`/`useValue` patterns.
- Record baselines; never claim “production ready” without numbers.

## Security

| Area | Practice |
|---|---|
| SVG/HTML | Use SDK sanitization (`sanitizeSvg`); consider DOMPurify with tldraw-preserving config |
| CSP | Restrict script/img/connect; allow data/blob for assets carefully |
| Uploads | MIME allowlists, size limits, auth, virus scanning as appropriate |
| Assets origin | Separate asset domain from app origin |
| Embeds | Permissions sandbox; allowlist providers |
| Sync | WebSocket auth, origin checks, room isolation, rate limits |
| AI | Server-side keys; sanitize model actions; treat canvas text as untrusted |
| Dev bridge | Localhost + dev-only; no eval; strip from production builds |
| Secrets | No provider keys in client; license keys are domain-bound **public** client config—not API secrets |

## Licensing (re-read live pages each time)

- SDK: **source-available** under the [tldraw license](https://tldraw.dev/community/license) — not MIT/Apache.
- Development: typically no key. Production (HTTPS non-localhost + production build): **requires license key**.
- Types: trial (100-day), commercial, hobby (watermark).
- Pass `licenseKey` prop or documented env vars (`TLDRAW_LICENSE_KEY`, `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`, `VITE_TLDRAW_LICENSE_KEY`, …).
- Watermark follows license type—no `hideWatermark` prop.
- Do **not** invent pricing, revenue thresholds, or telemetry env flags.

### Hobby / data-collection conflict (record, don't resolve)

Public wording **disagrees** as of the observed date (2026-07-17). Agents must surface the conflict:

1. **Community license page** (`/community/license`): “When using the tldraw SDK under a commercial or **hobby** license, **no information is sent** to tldraw.” Trial pings a license-key hash.
2. **License-key feature page** (`/sdk-features/license-key`): table says **Hobby** sends “License ID, SDK version, and page URL”; Commercial “None”; Trial similar ping; Unlicensed may send version+URL in production.
3. **Anti-hallucination article** (June 2026): commercial has no analytics SDK; anonymous usage via **static asset requests** and **hobby watermark** image; self-host static assets on commercial for no external requests.

Until tldraw unifies the docs, quote the pages, prefer the stricter privacy assumption for hobby if the user needs guarantees, and re-fetch before shipping compliance language.

Attribution: follow current attribution/watermark rules for the license type.

## Deployment checklist

- [ ] Production license key valid for deploy hostnames
- [ ] CSS + assets available (self-hosted if required)
- [ ] Client-only editor boundary correct for framework
- [ ] Dev bridge disabled in prod bundle
- [ ] Sync/auth/assets configured for prod (not demo server)
- [ ] CSP and upload limits
- [ ] Error reporting without leaking documents/secrets
- [ ] Build + preview smoke test

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | license env, asset hosts, CSP headers, bundle secrets scan |
| Implement | licenseKey, hardened asset store, remove dev bridge |
| Verify | prod build preview; console license warnings; large-doc baseline; security tests |

## Feature map

performance, license-key, attribution, errors, environment, assets (security sections).

## Sources

- https://tldraw.dev/community/license
- https://tldraw.dev/sdk-features/license-key
- https://tldraw.dev/sdk-features/performance
- https://tldraw.dev/sdk-features/attribution
- https://tldraw.dev/blog/20-things-i-wish-ai-chatbots-knew-about-tldraw
