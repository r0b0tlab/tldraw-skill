# AI integrations and starter kits

## When to use this branch

Only when the user wants AI canvas behavior or an official kit. Do **not** bolt agent infrastructure onto a plain whiteboard task.

## Integration patterns

1. **Canvas as output** — place generated images/embeds/previews as shapes.
2. **Visual workflows** — nodes + bindings execute pipelines (workflow / image-pipeline kits).
3. **Agents** — model reads screenshot + structured shapes; emits sanitized actions (agent kit).

## Starter kit routing

| Kit | Route here when… |
|---|---|
| **agent** | Promptable agent that creates/edits canvas content |
| **chat** | Sketch/annotate as chat context |
| **branching-chat** | Tree of conversation nodes |
| **workflow** | Executable node graph / automation |
| **image-pipeline** | Prompt→model→image node chains |
| **multiplayer** | Realtime collab foundation (often combined with AI later) |
| **shader** | GPU backgrounds; not AI-specific |

Scaffold: `npm create tldraw@latest` or clone the kit repo/template. Keep SDK versions aligned.

## Agent kit discipline

- Prefer kit APIs: `prompt` / `request` / `cancel` / `reset` where exposed.
- **Prompt parts** — control what the model sees (viewport screenshot, shape summaries, selection, history).
- **Action utils** — typed actions applied through validation/sanitization.
- **Modes / managers / streaming** — follow kit architecture; do not invent parallel agent runtimes.
- **Sanitization** — existing IDs only when referencing; unique new IDs; numeric/vector bounds; strip coordinate offsets; cancel in-flight work; treat canvas text as untrusted (prompt injection).
- **Authorization boundary** — enforce a strict server-side action/tool allowlist, resource authorization, and argument validation independently of prompts. Canvas-derived text remains untrusted even if inserted into a system/developer message.
- **Providers** — API keys **server-side only**; never embed provider secrets in client bundles.
- Custom shapes: extend both read (prompt context) and write (action util) paths.

Without credentials: schema/stream/unit tests may pass; label provider execution **unverified**.

## Driving without a full agent

- Programmatic Editor APIs + `@tldraw/driver` for deterministic automation.
- Export context: `toImage` / `getSvgString` + structured `getCurrentPageShapes`; for meaningful text use `editor.getShapeUtil(shape).getText?.(shape)` (not an `Editor.getText` API).

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | Which kit/template; provider surface; secret handling |
| Implement | Start from official kit; minimal custom actions/parts |
| Verify | Build; mock action sanitization tests; one live provider call **or** explicit unverified |

## Sources

- https://tldraw.dev/docs/ai
- https://tldraw.dev/starter-kits/overview
- Kit pages under https://tldraw.dev/starter-kits/*
- https://tldraw.dev/docs/driver
