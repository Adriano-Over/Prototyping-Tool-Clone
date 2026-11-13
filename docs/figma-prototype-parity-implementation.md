# Figma prototype parity: findings and implementation handoff

This document is an implementation brief for an AI coding agent working in the Forma repository. It separates confirmed Forma source behavior, Figma's documented prototype behavior, and live behavior that REA could not verify in this session.

## Evidence and scope

- Forma source reviewed: `dist/app.js`, `dist/workbench.js`, `dist/project-model.js`, `dist/project-state.js`, `dist/preview-runtime.js`, and `tests/preview-runtime.test.cjs`.
- The installed Figma desktop package is version `126.10.11` at `C:\ProgramData\Adriano\Figma\app-126.10.11`. REA identified `resources/app.asar` (SHA-256 `2de9b97e7d92ebf99f451e895c9644b79ea94b6fb5b9f718afd83eadc3ced4c3`), but its archive inventory failed with `Malformed ASAR`.
- REA could not attach to the claimed live session. No Figma native process/window was exposed to the current tools, and Electron target discovery returned `endpoint_unreachable` on loopback ports 9222, 9223, and 9333. Therefore this is not a live observation of the user's Figma file. Do not describe documented behaviors below as REA-observed behaviors.
- Figma behavior below is grounded in Figma's official help pages linked in [References](#references). Re-run REA against the live Figma target when it is exposed, especially before implementing visual transitions or state behavior.

## Confirmed Forma behavior

Forma stores one interaction object per layer in `forma.prototype[nodeId]`. The Workbench Save handler replaces that layer's object, so the model cannot represent two interactions on one hotspot or multiple actions for one trigger.

The Workbench currently offers three triggers (`click`, `mouseenter`, `dblclick`) and four actions (`open-url`, `toggle`, `message`, `scroll`). Other code paths also save `navigate-page` and `set-variable`; conditional visibility is stored separately in `layoutMetadata.prototypeVisibility`.

Preview now dispatches click, mouse-enter, and double-click for saved interactions. It supports page navigation, variable changes, visibility conditions, HTTP(S) links, visibility toggles, messages, and scrolling. The recent preview fix also gives the Crypto tutorial 33 explicit interactions and a locally validated newsletter input; wallet and store calls remain clearly simulated.

Relevant implementation points:

- `dist/workbench.js`: `prototypeView()` and its Save/Clear handlers.
- `dist/project-model.js`: project metadata normalization and migration.
- `dist/project-state.js`: project-scoped prototype persistence.
- `dist/app.js`: page navigation, variable and visibility authoring, and preview document construction.
- `dist/preview-runtime.js`: trigger dispatch and preview actions.
- `tests/preview-runtime.test.cjs`: runtime behavior tests.

## Difference matrix

| Area | Forma confirmed today | Figma documented capability | Implementation gap |
|---|---|---|---|
| Interaction data | One trigger/action object per layer | Multiple interactions per object; multiple actions can be chained for a trigger | Versioned, backward-compatible interaction list and ordered action list |
| Triggers | Click, mouse enter, double-click | Click/tap, drag, hover/press, keyboard/gamepad, mouse enter/leave/down/up, delay, video hit/end | Trigger editor, event binding, cleanup, and touch/keyboard behavior |
| Navigation | Navigate between Forma pages; no history stack | Navigate and Back | Prototype history, back behavior, and scroll reset/preserve option |
| Overlays | None in the preview action model | Open, close, and swap overlay | Overlay stack, position/animation settings, close behavior, and history rules |
| Logic | Visibility expression on a layer; set-variable | Conditional if/else actions; set-variable and set-variable-mode | Typed conditions/action branches and page mode state |
| Scrolling | Long document scroll plus scroll-to target | Frame overflow in horizontal, vertical, both, or none; scroll-to; fixed and sticky layers; scroll state options | Per-frame overflow and per-layer scroll positioning; nested scroll containers |
| Motion | Scroll uses smooth browser scrolling; page switch is immediate | Transition type, direction, easing/spring, duration, and Smart Animate | Transition configuration and matching-layer animation engine |
| Components | Linked components and variants exist in the editor | Interactive component Change to action | Prototype runtime must transition a component instance between variants and restore state correctly |
| Media | No video prototype actions | Play/pause, mute, seek, jump, time-hit, and video-ended interactions | Video node support and media event/action lifecycle |
| External links | HTTP(S) link action opens a new tab | Open link with an external-link interstitial option | Link warning preference and UX parity; keep protocol allowlist |

Figma requires an interaction to be connected to a hotspot; a static visual button alone does not perform an action. This means the tutorial's original zero-interaction state was expected to be static in either product. Forma's defect was narrower: its editor exposed triggers the runtime ignored, and its data structure could not represent Figma's richer interaction model.

## Copy/paste implementation prompt for an AI agent

```text
Implement the next prototype-parity milestone in the Forma repository at C:\Projetos\Figma\figma-studio. Read this handoff and the repository's AGENTS.md / README instructions first.

Goal
Bring Forma's authoring model and Preview closer to Figma's prototype interactions while preserving existing projects and current behavior. Do not claim full Figma equivalence. Work in small compatible phases, run the relevant tests after each phase, and update FEATURE-COVERAGE.md with the result.

Evidence rules
1. Treat the "Confirmed Forma behavior" section as source-verified.
2. Treat the Figma rows as official documented requirements, not live REA observations.
3. First check whether REA can see an actual running Figma target in this environment. Use passive inspection only. Do not navigate, click, execute page code, change prototype files, or inspect another user's file without a clear target. If the target is not exposed, report that and proceed from the official references linked in this handoff.
4. Before designing transitions/overlays, re-check the official Figma docs because these details are easy to approximate incorrectly.

Phase 1 — interaction model and backward compatibility
- Replace the single `prototype[nodeId]` interaction assumption with a schema that can store multiple interactions per layer, each with a trigger and an ordered action list.
- Add an explicit schema version or deterministic migration. Existing legacy `{trigger, action, target, ...}` entries must load as one interaction with one action, remain editable, and keep working in Preview.
- Preserve undo/redo, save/reopen, portable HTML export, and project migration behavior. Do not discard unknown fields during migration.
- Update the Workbench so users can add/remove/reorder interactions and actions, and edit action-specific parameters with validation and accessible labels.

Phase 2 — triggers and runtime lifecycle
- Add the documented non-media triggers incrementally: click/tap, mouse enter/leave, while hovering/pressing, mouse down/up, drag, keyboard/gamepad, and after-delay.
- Define precise trigger semantics (including restoring state on hover/press exit), pointer/touch parity, event propagation, keyboard focus, and timer/listener disposal when page/overlay/project state changes.
- Do not use `eval` for condition strings. Reuse or strengthen the current typed condition parser.
- Ensure keyboard and drag listeners are scoped to the active preview and cleanly removed; avoid global listeners leaking across repeated Preview opens.

Phase 3 — core actions and navigation state
- Implement ordered action execution for navigate, back, open link, scroll to, set variable, set variable mode, conditional branches, and visibility changes.
- Add a navigation history stack with explicit overlay history semantics and a user setting for preserve/reset scroll position.
- Implement overlays as a stack with open/close/swap, dismissal, focus handling, and keyboard Escape behavior. Keep overlay content inside the preview document and constrain it to the active prototype viewport.
- Keep external navigation restricted to http/https and make preview-only integrations visibly distinct from real network/backend operations.

Phase 4 — scrolling, transitions, and components
- Add per-frame overflow settings (none/horizontal/vertical/both), nested scroll containers, and per-layer scroll-with-parent/fixed/sticky behavior where the canvas data model supports it.
- Add transition metadata with validated duration, easing, direction, and type; implement transitions in Preview without transforming the whole page or breaking long-page scrolling.
- Implement Smart Animate only for layers that have a stable, deterministic match across source and destination. Otherwise use the selected fallback transition and expose the limitation clearly.
- Implement Change to for component variants while preserving instance overrides and resetting/restoring state according to the configured prototype behavior.

Phase 5 — media, only if the editor supports a real video node
- Add video-specific triggers/actions only after confirming the node supports playback, pause, mute, seek, and lifecycle events. Do not show unusable video options for image-only nodes.

Verification and delivery
- Add migration tests covering legacy project saves and all interaction entries surviving save/reopen/export.
- Add runtime tests for each implemented trigger/action, action ordering, back/overlay history, invalid targets, unsafe URLs, repeated Preview open/close, timers, and event cleanup.
- Add one end-to-end tutorial smoke test: navigation scrolls to sections, collection bookmarks toggle, newsletter validation works locally, wallet/store controls remain labeled simulations, and no action sends data.
- Run `npm run check`. Report exact tests, remaining unsupported Figma behaviors, and any live-REA evidence versus documentation-based assumptions.
- Do not delete projects, change unrelated workspace organization, publish, or install packages without a separate need and authorization.
```

## References

- [Figma prototype actions](https://help.figma.com/hc/en-us/articles/360040035874-Prototype-actions)
- [Figma prototype triggers](https://help.figma.com/hc/en-us/articles/360040035834-Prototype-triggers)
- [Connect your prototype](https://help.figma.com/hc/en-us/articles/360040315773-Connect-your-prototype)
- [Prototype scroll and overflow behavior](https://help.figma.com/hc/en-us/articles/360039818734-Prototype-scroll-and-overflow-behavior)
