# Forma vs Figma: Building Feature Gap Analysis

**Inspection date:** 2026-10-26 (America/Sao_Paulo)  
**Scope:** Figma Design editor and local design-building workflows. This report excludes marketplace/community discovery, cloud accounts, billing, hosted AI/Agents, third-party integrations, and cross-machine collaboration.  
**Goal:** Identify where Forma's implemented authoring tools and behavior differ from the observed Figma web editor, and state the behavior Forma should target.

## Executive summary

Forma already has a broad local editor foundation: pages/layers, selection, geometry, text, style controls, auto layout, components/variants, variables, prototypes, comments, history, preview, and export. It is not a 1:1 substitute for the inspected Figma editor. Forma's launch code already builds grouped tools, Comment and Actions buttons, and Draw/Design/Motion/Dev Mode controls; these controls exist in source but could not be exercised through Forma's unavailable live debugging bridge. The clearer remaining gaps are vector editing fidelity, region/slice behavior, gradients and masks, responsive constraints, Scale behavior, and prototype authoring.

This comparison uses a live Figma web-page capture for the currently open file and a static REA analysis of Forma's shipped `dist` application, cross-checked against Forma's source markup and capability notes. The Forma live browser/debug bridge was unavailable during this pass, so Forma behavior is classified from shipped code and documentation rather than a live interaction replay. A feature's presence in source does not by itself prove its interaction works correctly.

## Evidence and limits

### REA evidence used

| Target | Evidence | What it establishes | Limits |
|---|---|---|---|
| Figma web editor | `ev_76c59e01e79b710bb6931218b778802427f68d41ad087aa1dccf6bd10729aa11` (`inspect_web_page`); current target `1E12DBDCEA491F027A8B5C80C293116A` | Current Figma page, accessibility tree, named toolbar controls, editor regions, selected modes, layers/pages, and right inspector labels | Passive snapshot of one file and one editor state. Menus/tool dropdowns were closed, so their full contents and action semantics were not directly exercised. |
| Figma browser target | `ev_76469ad1b1a9aebd3d38c54b22102aeb35d52847d3fd3f3203a576ce5791658a` (`list_browser_targets`) | Confirms the inspected target is `Untitled – Figma` in Edge at the expected Figma design URL | Does not prove a button's behavior. |
| Forma shipped application | `ev_e2cd97324ecbf931ad86d008d092b4ddb32d0c8f6bedfd8f1f4afc7e8cc9cc16` (`analyze_javascript_application`); artifact digest `0d8c8b2fdf45ea5f818c5a8b396028e896a0e4e0863f03f41295108feefdf804` | Static analysis of Forma's `dist` directory: 32 relevant files, 31 parsed JavaScript files, 10 modules, 1,052 findings | Static analysis only; no application execution. Semantic graph is partial/truncated and has 33,150 retained unknowns. It must not be used to claim absent behavior. |
| Forma shipped UI / documented limitations | `figma-studio/dist/index.html`, `figma-studio/FEATURE-COVERAGE.md`, `figma-studio/README.md` | Toolbar markup and the project's own feature inventory/known limits | Product documentation is an implementation claim, not independent runtime verification. |

REA inspected Figma UI evidence; it did not recover Figma's proprietary implementation code. Behaviors described below as “expected” are based on the visible controls and standard design-editor interaction patterns, and are labeled accordingly. This is a practical editor parity review, not a claim that every Figma feature was exhaustively inspected.

## Current tool inventory

### Directly observed in the open Figma editor

The live accessibility tree names these editor controls:

- **Move** and **Move tools** group.
- **Frame** and **Region tools** group.
- **Rectangle** and **Shape tools** group.
- **Pen** and **Creation tools** group.
- **Text** and **Type tools** group.
- **Comment**.
- **Actions**.
- **Toolbelt Mode:** Draw, Design, Motion, Dev Mode.
- Workspace navigation: File, Agents, Assets, Tools, Variables.
- Left sidebar: Pages, Find, Add new page, Layers.
- Right sidebar: Design, Prototype; the observed no-selection state exposes Page color, Styles, and Export.
- Top controls: Present, Prototype view, Share, zoom/view options.

The page was at 17% zoom with five named frame-like canvas items (Landing page, Shop, Article, About, Product detail page). An Agents introduction overlay was present; this online AI feature is outside the requested scope and is not counted as a parity requirement.

### Found in Forma's shipped UI/code and capability inventory

- Main dock: Select, Frame, Rectangle, Ellipse, Text, Hand.
- Separate panels/workbench: vector tools, layout, components/variants, variables, prototypes, comments, versions, and Dev Mode inspection.
- Document editing: pages/layers, geometry and typography inspector, fills/borders/effects, auto layout, grid, history, preview, and export.
- Local projects, assets, import/backup, and local workspace service.

## Gap matrix

Status meanings: **Gap** = no equivalent is exposed or listed in the shipped scope; **Partial** = a related feature exists but is documented as simplified, incomplete, or separated from the observed workflow; **Unverified** = code/docs suggest support, but this pass did not exercise it live; **Out of scope** = intentionally excluded by the request.

| Area | Figma reference | Forma status | Difference / expected behavior |
|---|---|---|---|
| Tool dock and tool groups | Move, Frame/Region, Shape, Pen/Creation, Text/Type grouped controls; Comment and Actions buttons | **Partial, grouped dock implemented.** Forma creates these groups, Comments, Actions, and Draw/Design/Motion/Dev mode controls in `app.js`; main HTML markup is a simpler pre-enhancement shell | Keep the grouped controls in the actual launch path and verify them live. Clicking the main tool activates it; chevrons reveal siblings, show shortcuts, and retain last-used tool. Verify menus stay usable at narrow sizes and mode changes preserve selection/history. |
| Move-tool family | Move tools group observed; exact menu contents not opened | **Partial.** Select, Hand, and Scale are present; Scale remains single-layer and simplified | Provide Select/Move, Hand/Pan, and Scale as distinct modes, each with shortcut, cursor, and selection semantics. Scale should proportionally transform all selected layers and their styles/children as a group, not just resize one layer. The precise Figma menu contents need a menu-level comparison. |
| Frame and region tools | Frame plus Region tools group | **Partial.** Frames, sections, and slices are drawable. New region metadata distinguishes them and selected slices export the page cropped to their bounds | Continue with section organization, per-slice export settings/batch behavior, nested frame clipping, and device presets. Verify slice crops exclude editor overlays and preserve every intersecting canvas object. |
| Shape tools | Rectangle and Shape tools group | **Partial.** Rectangles, ellipses, lines, polygons, stars, and arrows are documented; some are not in the primary dock | Provide a Shape dropdown including standard shapes and clearly expose custom geometry. Create by drag from the pointer-down canvas point to pointer-up point, with Shift constraints, Alt/Option center drawing where supported, and correct canvas coordinate conversion at every zoom/pan. Add click-to-place presets if Figma offers them in the selected shape menu. |
| Pen and creation tools | Pen and Creation tools groups observed | **Partial.** Pen now supports sequential clicks, closing at the first anchor, Enter/double-click finish, and click-drag Bézier handles; existing node editing remains available. Pencil pressure and editable text-on-path remain incomplete | Continue with anchor conversion, path continuation, tangents/handles faithful to Figma, and pressure/velocity-sensitive Pencil strokes with a stable fallback. Exact Figma menu contents were not opened. |
| Text and type tools | Text and Type tools groups observed | **Partial.** Text editing, typography, case/spacing, and text-on-path are documented, with editable curve behavior incomplete | Add the Type tools group and match insertion semantics: click for point text, drag for a text box, immediate typing, focus/selection rules, font loading and fallback, resizing/wrapping, and clear exit back to selection. Text-on-path should remain linked to an editable path and update when the path changes. |
| Comment tool | Dedicated Comment button; canvas comment region and Create new comment control observed | **Partial.** Canvas pins and threaded comments are documented in Workbench | Make comment placement an editor mode: click an exact canvas point to pin, open a thread composer, retain document-space anchoring through pan/zoom, support replies/resolution, and show pins and threads consistently in both canvas and comments panel. Do not require a separate Workbench visit for basic placement. |
| Actions menu | Dedicated Actions button observed | **Partial.** Forma has a searchable local Actions palette | Present the palette from the primary dock and support search, keyboard navigation, categories, shortcut display, and actions that operate on the current selection/context. Keep local editor actions; do not require plugin or marketplace discovery. |
| Toolbelt modes | Draw, Design, Motion, Dev Mode radio group observed | **Partial.** Forma lists modes, but says complete Figma-specific workspaces are not equivalent | Implement each as a coherent workspace state. Draw should expose drawing tools; Design should expose visual styling/layout; Motion should provide timeline/keyframe editing and playback; Dev Mode should expose inspectable measurements, styles, assets, and code handoff. Mode changes should preserve the document, selection, and undo history. |
| Assets / insert resources | Assets navigation and asset panel visible | **Partial.** Local assets and quick insert exist; media crop and drag-preview behavior are documented gaps | Add searchable local assets/components/resources and drag previews onto the canvas. Image insertion should support crop/fill/fit, focal point, replace-image, and independent image bounds. Keep marketplace/community assets out of scope. |
| Variables | Variables navigation and apply-variable-mode control observed | **Partial / unverified.** Local variable collections, modes, aliases, and bindings are claimed in Forma | Expose collection and mode management where the Variables navigation leads; support typed variables, aliases, mode switching, local overrides, and bindings across fill, stroke, text, and layout. Show unresolved/cyclic aliases and provide deterministic rename/delete behavior. Needs live Forma verification. |
| Canvas placement and coordinate behavior | Live canvas and page at 17%; the screenshot shows a populated design canvas | **Unverified.** Forma documents continuous pointer-anchored zoom, pan, placement, and prior reported edge-placement issues | Require a single document-to-screen transform for pointer hit tests, drag creation, placement, selection bounds, handles, snapping, and export bounds. At any zoom/pan, insertion must center at the intended canvas pointer or canvas viewport center—not the canvas origin/top-left. Zoom must preserve the document point under the cursor. Add regression scenarios for zoomed and panned insertion. |
| Pages and layers | Pages, Find, Add new page, Layers, and five frame rows observed | **Partial / unverified.** Pages and hierarchical layers are claimed | Match selection synchronization both ways; keep layer order identical to z-order; support search, rename, visibility, lock, multi-select, grouping, reordering across parents where legal, and page switching without lost edits. The present screenshot establishes the reference controls, not their full behavior. |
| Design inspector | Design tab; no-selection Page color, Styles, Export sections observed | **Partial.** Geometry, style, fill, typography and effects are extensive, but several style semantics are browser/CSS-backed | Inspect selected object type contextually. Support multiple fills/strokes/effects with ordering and independent opacity, gradients with draggable on-canvas handles and stops, blend modes, variables, reset/override state, and reusable styles. Avoid representing a CSS approximation as a native vector/style model. |
| Boolean geometry and masks | Not visible in the current no-selection screenshot; expected design-editor baseline, not directly observed this session | **Gap / Partial** per Forma capability notes | Add Union, Subtract, Intersect, Exclude and editable Boolean operands. Add clipping and shape-to-image masks with reordering, edit-content, and reversible mask membership. Validate geometry remains editable after transforms and export. |
| Auto layout and responsive constraints | Not visible in the current no-selection screenshot | **Partial.** Forma lists flex-based auto layout; full responsive constraints remain incomplete | Support Hug/Fill/Fixed sizing, min/max constraints, independent padding, gap, wrap, alignment, absolute positioning, and child constraints that recalculate when parent size changes. Preserve visual output and constraints on resize; do not reduce all layout to one-way CSS flex. |
| Prototype authoring and preview | Prototype tab and Present/Prototype view controls observed | **Partial.** Forma has triggers/actions and preview; several interaction/transition workflows are documented missing | Match interaction editor, node connections, multiple flows, starting points, overlays, back/close overlay, smart animate/transitions, scroll/overflow, fixed and sticky items, drag/keyboard/delay triggers, branches, variable modes, and interactive component variants. Preview must execute the same graph, respect frame clipping and scroll, and return to the editor without changing authored state. |
| Motion / animation | Motion mode observed | **Partial / unverified.** Forma has multi-track keyframes and preview, but this pass did not compare live behavior | Align timeline, keyframe editing, easing/curve control, duration, property tracks, playback, and transition behavior with prototype playback. Clearly distinguish authored motion from static design values. |
| Dev Mode | Dev Mode mode observed | **Partial.** Forma provides measurements, HTML/CSS and attributes; project notes explicitly say it is not equivalent to full inspect/code integrations | Provide selection-aware specs, computed layout, spacing measurements, typography, color/style tokens, assets, platform-ready code snippets, and copy actions. Keep values synchronized with the actual rendered document and selected breakpoint/state. |
| Export and slices | Export section and Add export settings observed in Page inspector | **Partial.** PNG/PDF and appearance-preserving SVG are documented; slice/export behavior incomplete | Put per-layer and slice export settings on the selected item; support scale, format, background/transparency, naming, batch export, and stable region bounds. SVG should use native vector primitives where possible; `foreignObject` appearance preservation is not fully portable SVG parity. |
| Undo/redo | Not named in the current Figma accessibility tree; standard editor behavior is expected but not directly inspected | **Claimed; unverified.** Forma documents chronological history across canvas and metadata | Verify one chronological history for tool drawing, text edits, properties, page/layer operations, prototype links, variables, and comments. Undo/redo must not split a single drag/typing session into noisy steps and must restore exact selection/viewport where expected. |
| Shortcuts and discoverability | Toolbar groups are named; shortcut menus not opened in this snapshot | **Partial.** Core shortcuts documented | Match tool shortcuts and provide a searchable shortcut reference. Preserve standard editing shortcuts and avoid activating tools while typing into text/number inputs. Tooltips should give name, shortcut, and group affordance. |
| Local/cloud services | Excluded by request | **Out of scope** | No requirement to copy marketplace, hosted AI, billing, public sharing, SSO, or remote collaboration. Keep core authoring usable offline/local. |

## Priority order for Forma

### P0 — Core canvas correctness and discoverability

1. Preserve the existing Figma-like grouped tool controls and verify them live, including keyboard navigation and narrow-window behavior.
2. Make all canvas operations share one transform/inverse-transform utility. Add focused checks for selection, creation, drag, resize handles, snapping, pan, and zoom at 25%, 100%, and high zoom. Specifically verify newly inserted layers land at pointer/viewport center instead of canvas top-left.
3. Finish Move/Hand/Scale semantics and section organization and per-slice export settings; slice metadata and cropped selection export are now implemented.
4. Keep Comment as a direct canvas tool and the local Actions palette on the dock; verify comment placement and menu keyboard behavior live.

### P1 — Authoring fidelity

5. Finish Pen click-to-place and vector-node editing; make text-on-path editable; add Pencil stroke fidelity.
6. Implement multi-fill/stroke/effect model, editable gradients, masks and Boolean operations.
7. Complete responsive constraints and auto-layout sizing semantics.
8. Complete prototype transitions, overlays, flows, scroll/fixed layers, conditional branches, and interactive variants.

### P2 — Workspace parity

9. Make Draw/Design/Motion/Dev Mode distinct, consistent workspaces backed by the same document model.
10. Finish local Assets, Variables, Dev Mode, and batch export workflows.
11. Verify undo/redo grouping, accessibility names, keyboard-only operation, and responsive panel resizing.

## Acceptance checklist

- Each visible Figma tool group has a corresponding Forma group, and every tool is reachable by mouse and keyboard.
- A new object created after any combination of zoom and pan appears at the pointer or defined viewport center in document coordinates.
- Frame, Section, and Slice have distinct persisted semantics; slices export exactly the bounded content.
- Pen produces editable paths with click-created corners, drag-created curves, close/finish, add/remove anchors, and persistent undoable state.
- A canvas comment pin remains attached to its intended document coordinate after pan, zoom, reload, and page switch.
- Draw, Design, Motion, and Dev Mode expose the corresponding working tools and do not lose selection/history on switching.
- Gradient handles/stops, multiple fills/strokes/effects, masks, and Boolean operations remain editable after save/reopen and export.
- Auto-layout and constraints produce predictable results when parent and child dimensions change.
- Prototype Preview handles links, overlays, back/close, scrolling, transitions, variables/branches, and returns to the authored canvas cleanly.
- Selection, layers list, inspector, and export settings stay synchronized for multi-selection and nested groups.
- Undo/redo restores document state deterministically across canvas, properties, pages, variables, prototypes, and comments.

## Suggested validation method

Use the same small test file in Forma and Figma: one page with a frame, section, slice, rectangle, ellipse, text, vector path, image fill, nested auto-layout group, component instance, variable-bound fill, comment pin, and two prototype screens. Capture each tool group's open menu and perform the acceptance checklist. Record per-step screenshots and exact zoom, selection, and canvas coordinates. Compare output and behavior; do not infer parity from matching icons alone.

## Implemented in Forma after this inspection

- The grouped tool dock, Comment/Actions buttons, and four editor modes were already present in Forma's startup code and are recorded above as implemented but not live-verified.
- Pen now supports multiple click-placed anchors, click-drag Bézier handles, closing on the first anchor, and finishing with Enter or double-click. Switching to another tool commits a pending path; Escape cancels it.
- Frames, Sections, and Slices receive distinct persisted region metadata. Selecting a Slice and exporting the selection now clips the current page to the slice bounds and removes slice boundary overlays from the export.
- These changes address selected high-priority gaps. The remaining P0/P1/P2 items in the matrix and priority list are still outstanding or require live validation.

## Source references

- Forma UI: `figma-studio/dist/index.html`
- Pen interaction: `figma-studio/dist/pen-tool.js`
- Tool dock integration and region metadata: `figma-studio/dist/app.js`
- Slice crop export: `figma-studio/dist/design-export.js`
- Forma capability and known-limit list: `figma-studio/FEATURE-COVERAGE.md`
- Forma user-facing workflow claims: `figma-studio/README.md`
- REA live Figma capture: `ev_76c59e01e79b710bb6931218b778802427f68d41ad087aa1dccf6bd10729aa11`
- REA static Forma analysis: `ev_e2cd97324ecbf931ad86d008d092b4ddb32d0c8f6bedfd8f1f4afc7e8cc9cc16`

