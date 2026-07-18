# UI, accessibility, and internationalization

## Composition layers

| Layer | Role |
|---|---|
| `<Tldraw>` | Batteries-included editor + default UI |
| `<TldrawEditor>` | Core canvas without default chrome |
| `<TldrawUi>` | Optional default UI package surface when exploded |
| **Component slots** | Replace pieces via `components` prop (`TLComponents` / `TLUiComponents`) |
| **Overrides** | `overrides` for actions, tools, translations, shortcuts |
| **Overlay utils** | Canvas overlays (brush, indicators, custom HUD) |

`hideUi` hides the default UI chrome. Runtime verification on installed 5.2.5 shows the built-in shortcut hook still mounts (`d` still selects draw), so hidden controls are not the same as disabled actions. Verify the installed version, provide discoverable replacement controls, and explicitly override/remove shortcuts when that is the requirement.

## Actions, menus, toolbars

- Actions: register/override via UI action system; keep labels + shortcuts consistent.
- Toolbars: add/remove tools; vertical/contextual toolbar examples.
- Menus: compose with primitives; do not hard-code inaccessible custom div menus when primitives exist.
- Events: UI event bus for analytics-safe hooks (no secrets).

## Themes and preferences

- Theme: `colorScheme` (`light` \| `dark` \| `system`) on component or `editor.user.updateUserPreferences({ colorScheme })`.
- Reject invented `darkMode` / `theme` / `forceDarkMode` props.
- User preferences: animation speed, locale, edge scroll, snap, reduced motion, etc.
- Custom themes: documented theme tokens / examples only.

## Accessibility

- Screen reader: selection announcer, enhanced a11y mode toggles, descriptive shape text (`getText` / labels).
- Keyboard: full shortcut map; do not ship pointer-only critical paths without keyboard equivalents when using default UI.
- Focus: editor focus trap examples; escape-from-shape-focus patterns.
- Reduced motion: honor `getAnimationSpeed()` / prefers-reduced-motion examples.
- Error boundaries: shape and app-level fallbacks.
- Environment: `tlenv` / mobile breakpoints; force-mobile layout only when intentional.

## Internationalization

- Translation provider + override maps.
- RTL language list awareness.
- Custom language packs via documented translation keys—do not invent key namespaces.

## Inspect / implement / verify

| Step | Actions |
|---|---|
| Inspect | `components`, `overrides`, `hideUi`, locale, theme wiring |
| Implement | Prefer slots/overrides over forking whole UI |
| Verify | Keyboard-only path; screen reader smoke; dark/light; mobile width; measure `hideUi` chrome and shortcut behavior on the installed version |

## Feature map

ui-components, ui-primitives, actions, overlay-utils, themes, user-preferences, internationalization, accessibility, environment, errors, focus, options.

## Sources

- https://tldraw.dev/docs/user-interface
- https://tldraw.dev/sdk-features/ui-components
- https://tldraw.dev/sdk-features/accessibility
- https://tldraw.dev/sdk-features/internationalization
- https://tldraw.dev/sdk-features/themes
- Examples: custom-ui, hide-ui, keyboard-shortcuts, screen-reader-accessibility, dark-mode, custom-language-translations, reduced-motion
