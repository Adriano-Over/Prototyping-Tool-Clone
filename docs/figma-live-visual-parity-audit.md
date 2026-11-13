# Forma vs. live Figma: visual and workflow parity audit

Updated: 2026-10-26  
Reference observed: Figma desktop 126.10.11, running on this computer. The active design file was **Sem título** (blank Page 1); a separate tab was a prototype named **Wireframing (cópia) - 1. Start**.

## Evidence and limits

This audit records visible Figma controls and menu contents directly observed in the running app, then compares them with Forma's checked-in source. No document content was created or edited during inspection. The separate wireframing prototype was only inspected for its visible pages; it is not the Flux Academy tutorial starter and must not be used as proof that it is.

The Figma UI is proprietary. The material available here exposes its interface, not Figma's original source code or private event handlers. Therefore, the Figma side below describes observed behavior and visible affordances; the Forma side cites the implementation that exists in this repository. The editor comparison now includes passive REA inspection of the supplied live design URL, alongside earlier visual/menu evidence. None of these sources exposes a runtime trace of Figma internals.

## 2026-10-26 live-session follow-up

REA attached successfully to the signed-in Figma web session in Edge and opened the user's supplied design URL. Passive page inspection captured the live **Untitled – Figma** editor and its rendered canvas. Evidence IDs: accessibility snapshot `ev_b7aac28ae494453db1d7ce6e95dc5440d9830705b8a74d54b3f4bd78eae31f5c`, screenshot `ev_c3005c37f4bdd5d21308ed8e7f8422ff959733c4ce94d968c3bef9b8791038`, and repeated toolbar tree `ev_cca7b119570f75ca17c52e6092ba08366eaa883544104442a214dd1ea1227584`. The current editor showed File, Agents, Assets, Tools, and Variables in the left rail; Move, Frame, Rectangle, Pen, Text, Comment, and Actions controls in the bottom dock; Draw, Design, Motion, and Dev Mode with Design selected; and Create/Prototype tabs plus page fill, Styles, and Export in the right panel. The canvas contained five existing design frames at 9% zoom. No document content was changed. Toolbar dropdowns were closed in the capture; attempts to expand them did not complete, so their menu contents are not claimed as newly observed. The in-app browser used for Forma could not be inspected through its local REA bridge in this session; Forma's source and automated tests were used for the implementation-side check.

This means the findings below combine direct observation of the live editor's closed-toolbar state with the earlier visual/menu evidence. It is not proof that every Figma behavior was exhaustively observed. In particular, the current menu contents and a side-by-side browser interaction pass remain unverified.

## Confirmed parity gaps to debug

The current coverage inventory and implementation still identify these material differences:

- **Vector editing:** Forma's Pen/Pencil paths have movable anchors; double-clicking an anchor creates smooth Bézier handles, midpoint anchors can be inserted, and right-click removes anchors while preserving at least two points. Click-to-place Pen behavior, pressure-sensitive Pencil strokes, vector-network editing, Boolean operations, and editable text-on-path curves/content remain incomplete.
- **Tool modes and inspector:** The supplied toolbar screenshot shows Draw, Design, Motion, and Dev Mode. Forma now has those four labels and a Motion timeline with independent opacity, X/Y position, rotation, and scale tracks, duration, easing, and preview. Figma's full animation-property catalog, curve editor, timeline interactions, and motion-aware inspector are still missing. Page/object inspector sections and organization also differ.
- **Frames, sections, slices, and media:** Forma creates these regions, but Section organization and Slice export behavior are incomplete; the frame/device preset catalog is smaller, and image/video placement lacks Figma's crop and placement-preview workflow. Still images now enter as rectangle-like image fills, but Forma has no crop UI or multi-file placement.
- **Fill and stroke model:** Appearance is mostly CSS-backed. Full fill stacks, native gradient handles, masks, advanced stroke editing, and reusable shared-style semantics remain incomplete; image fill insertion exists, but fill editing/cropping does not.
- **Prototype behavior:** Forma supports many triggers/actions, but overlays, back/history, conditional branches and transitions, drag/keyboard/delay triggers, frame overflow, fixed/sticky layers, and interactive component variants are not at full parity.
- **Commands and extensions:** Forma now has a File/Agents/Assets/Tools/Variables rail connected to its local project, asset, creation, and variable features. Its Actions menu supports local selection, undo/redo, rulers, pixel snapping, UI visibility, nudge distance, zoom, and tool commands. The Agents entry opens local creation tools rather than Figma's hosted AI service. Plugins & widgets remain discovery-only because there is no isolated extension runtime or marketplace integration.
- **Collaboration and product scope:** Workspace accounts and collaboration are local to this computer. Cross-machine cloud collaboration, public links, presence, marketplace integrations, and Figma's separate products (FigJam, Slides, Make, Sites, Buzz) are outside this local editor implementation.

## Fix completed in the latest pass

Forma's R/F/O/T keys previously inserted preset objects immediately, unlike Figma's active-tool workflow. They now activate tools and wait for the next canvas gesture. The standard V/H/K, L/Shift+L, P/Shift+P, S/Shift+S, F/R/O/T mappings are covered by a unit test, and the Keyboard shortcuts dialog lists them. This was verified against the documented Figma behavior and Forma's own tests. The live editor inspection confirmed the tool groups and mode names visually/accessibly, but the mode shortcuts were not exercised in Figma during this capture.

The remaining items above are feature-level gaps rather than confirmed regressions in the currently tested code. Forma's full automated check passed **70/70 tests** after these changes. That verifies Forma's own contracts, not complete Figma parity.

## Implementation status

This audit has been used as an implementation checklist. Forma now has grouped persistent tool menus; pointer-based drawing for shapes, frames, sections, slices, lines, arrows, and freehand SVG strokes; image/video placement at the clicked point; frame presets; Scale resize interaction; Draw, Design, Motion, and Dev mode controls; a File/Agents/Assets/Tools/Variables navigation rail; Comment and Actions controls; and CSS-backed blend mode, letter-spacing, text-case, and browser eyedropper controls. The navigation rail routes to existing local project, asset, creation, and variables views. The Actions palette includes selection, history, rulers, pixel snap, UI visibility, nudge, zoom, and tool commands. Vector editing supports Bézier handles, midpoint insertion, and anchor removal. Motion stores independent opacity, X/Y, rotation, and scale tracks with duration and easing. The live inspection showed no separate Resources dock button, so resource access remains in the Assets view and Actions palette. Simple text clicks create horizontally growing text, while drag-created text stays fixed-size; still images are inserted as background fills. Implementation is in `dist/app.js`, `dist/index.html`, `dist/style.css`, `dist/tool-state.js`, `dist/vector-tools.js`, `dist/motion-model.js`, and `dist/canvas-placement.js`.

These changes close several primary toolbar and placement gaps, without claiming full Figma parity. Comment pins now attach saved threads at a canvas point, and Text on path renders SVG text along a generated curve. Pen/Pencil paths retain project-backed anchors and draggable smooth Bézier handles. Forma is still not fully equivalent to Figma: Pen click placement, pressure-sensitive Pencil input, editable text-on-path curves, image crop and fill editing, full mask/fill-stack behavior, advanced Motion tracks and curve editing, complete mode-specific panels, exact frame/device catalogs, plugin execution, and richer prototype transitions remain open. See `FEATURE-COVERAGE.md` for current limits.

## What was visible in Figma

In the blank design file, the workspace had a narrow vertical navigation rail, a Pages/Layers panel on the left, the canvas in the middle, and Create/Prototype inspector on the right. A floating dock sat along the bottom of the canvas. The upper-right area exposed the current user/collaboration controls, Present, Share, and zoom. The right panel showed page background color and opacity, Styles, and Export when the page itself was selected.

### Tool dock and observed menus

| Dock group | Visible choices observed | User-facing behavior implied by the tool design |
|---|---|---|
| Move | Move (V), Hand (H), Scale (K) | Select/edit objects, pan the canvas, or scale a selection as distinct active tools. |
| Frame / Region | Frame (F), Section (Shift+S), Slice (S) | Choose a region tool, then work on the canvas; the dropdown is not a list of pre-inserted objects. |
| Shapes | Rectangle (R), Line (L), Arrow (Shift+L), Ellipse (O), Polygon, Star, Image/video… (Ctrl+Shift+K) | Switch to a shape/place tool and create or place it on the canvas. |
| Creation | Pen (P), Pencil (Shift+P) | Create vector paths with a dedicated path tool or freehand strokes. |
| Text | Text (T), Text on path | Place editable text or attach text to a path. |
| Comment | Comment | Add feedback pins or open comment tools; deeper menu behavior was not expanded in this live capture. |
| Actions | Actions | Access action/quick-command tools; the current menu was not expanded in this live capture. |
| Mode switcher | Draw, Design, Motion (diamond), Dev Mode (`</>`) | Switch workspaces. Motion exposes a timeline for keyframed animation; Draw changes illustration tools and sidebars; Dev Mode changes the handoff/inspection workspace. Prototype editing remains a Prototype tab in the right sidebar, not the diamond mode. |

The current official Figma Actions menu combines AI tools, asset search, plugins/widgets, and productivity commands; the earlier live observation also showed **All**, **Resources**, and **Plugins & widgets** tabs, with suggestions such as Locate and replace, Select all, Undo, Show rulers, Pixel grid snap, Minimize UI, Show/hide UI, Collaborative cursors, Nudge amount, and Keyboard shortcuts. The toolbar screenshot's `{}` icon is Actions, the speech bubble is Comment, and the shapes-plus icon is Resources. The screenshot's diamond in the mode switcher is Motion (not Move or Prototype); Motion adds a timeline and animatable property/keyframe controls. Prototype authoring remains available from the Prototype tab in the right sidebar.

The live editor's left navigation rail showed File, Agents, Assets, Tools, and Variables, alongside the Pages/Layers panel. The earlier screenshot showed the localized labels Arquivo, Agentes, Recursos, Ferramentas, and Variáveis. The right inspector had Create/Prototype tabs and, for page selection, page fill, opacity/visibility, Styles, and Export. Comments were represented as an on-canvas region/tool, separate from the right inspector.

### Separate prototype tab

The other open Figma tab was the **Wireframing** prototype at step **3 / 10**, showing three hero layouts: centered, centered with image, and right-side image. Earlier steps observed in that prototype showed buttons/cards and four navigation variants. This is useful evidence for preview navigation and wireframe patterns, but it is a generic 10-step wireframing prototype, not the tutorial's Flux Academy design file. No claim is made about the remaining unseen steps.

## Confirmed Forma differences

The original dock baseline in `dist/index.html` had Select, Frame, Rectangle, Ellipse, Text, and Pan. The current app enhances it at runtime with grouped persistent tool menus and modes. Its Assets panel still offers separate quick-insert Frame, Rectangle, Ellipse, Text, Button, and Line controls; those remain quick inserts rather than the active canvas tools.

Forma retains its quick-insert path: `addElement(kind)` chooses preset dimensions and calls `centeredElementPosition`. The primary dock now selects a persistent tool and `bindDrawingTools()` creates pointer-sized geometry in canvas coordinates; the two workflows are intentionally separate. The new path still lacks full anchor editing, exact native Figma modifiers, rich path semantics, and a visual browser run-through in this session.

Forma already has a substantial capability base: its coverage inventory lists frames, sections, rectangles, ellipses, lines, text, images, polygons, stars, arrows, and freehand-style SVG strokes; editable layer styling; components; variables; auto layout; prototype interactions; comments; versions; export; and a Dev Mode. The gaps are frequently **where/how the capability is exposed and whether it behaves as an editor tool**, not simply whether a shape or concept exists anywhere in the app. In particular, Workbench vector presets are SVG image assets, not the same as editable path creation on the canvas.

| Figma observation | Forma implementation checked in | Remaining parity gap |
|---|---|---|
| Grouped tool families in a persistent floating dock | Forma now groups Move/Hand/Scale, Frame/Section/Slice, Shapes/Place, Creation, and Text tools, with active state and shortcut labels. | Keyboard focus and menu interaction are implemented; full modifier and vector-editing semantics remain incomplete. |
| Move, Hand, Scale are separate choices | All three are exposed; Scale currently resizes one selected layer by drag. | Multi-selection transforms, proportional scaling details, and Figma's complete scale workflow remain incomplete. |
| Frame, Section, Slice region menu | All three are active canvas tools and create pointer-sized regions. | Sections are visual regions and slices do not yet drive a dedicated export workflow. |
| Shape tool supports rectangle, line, arrow, ellipse, polygon, star, and image/video placement | These tools are in the primary dock and create at the pointer; still images insert as rectangle-like background fills and videos as media layers. | Image crop/editing, multi-file placement, and placement preview are missing. |
| Pen/Pencil and Text/Text-on-path subtools | Pen/Pencil create SVG paths with editable anchors, draggable smooth Bézier handles, midpoint insertion, and right-click anchor removal; Text on path creates SVG text linked to a generated curve. Simple text clicks make horizontally growing text; dragging creates fixed-size text. | Click-to-place Pen, pressure-sensitive Pencil, vector networks, and text-on-path curve/content editing remain incomplete. |
| Draw / Design / Motion / Dev Mode mode switcher | Forma exposes all four labels. Motion offers multiple opacity/position/rotation/scale tracks, persistent keyframes, editable duration/easing, and a Web Animations preview. | Full property catalog, curve editor, direct timeline gestures, and complete Draw/Dev mode workspaces remain incomplete. |
| Comment and Actions controls; Assets is in the left navigation rail | Forma has the same rail labels and routes File to local projects, Assets to the asset view, Tools/Agents to local creation tools, and Variables to the existing Variables workbench. Actions includes local selection, history, rulers, pixel snap, nudge, zoom, and tool commands. | Hosted agents, cloud collaboration, full Figma Actions, and plugin/widget execution are absent. The rail reproduces the labels and local navigation pattern, not Figma's hosted services. Forma comments place a pin and open Workbench; deeper live Figma menu behavior was not confirmed in this capture. |
| Page inspector exposes fill, opacity/visibility, Styles, Export | Forma has detailed object properties and export controls, with page fill and visibility support. | Panel layout and section organization differ from Figma. |
| On-canvas comments and collaboration controls | The Comment tool now places a saved pin at the click point and opens its thread in Workbench Comments; local workspace collaboration remains machine-local. | Cloud sharing, presence, and cross-machine comments require a hosted service. |
| Prototype preview has visible stepper and restart in the opened prototype | Forma has local prototype preview, page navigation, and additional supported triggers/actions in its coverage inventory. | Compare preview frame navigation/controls and polish only after confirming equivalent trigger and transition behavior. |

## Tutorial-relevant priority order

1. **Finish vector editing.** Add click-to-place Pen anchors, pressure-sensitive Pencil input, anchor insertion/deletion, vector-network operations, and editable Text-on-path content and curve geometry after placement.
2. **Complete Motion and mode-specific workspaces.** The timeline now supports multiple property tracks and duration/easing; add curve editing, direct timeline gestures, export, and complete Draw/Dev panels.
3. **Give regions their full workflow.** Add export behavior for Slice, richer Section organization, and the complete Figma frame/device preset catalog. Refine media crop and placement preview.
4. **Complete the design model.** Add image crop/editing, editable fill stacks, shape masks, richer strokes, and shared reusable styles rather than relying only on CSS appearance.
5. **Expand the command and extension surface.** Finish Actions/resource search and implement a permissioned, isolated plugin runtime before enabling external extensions; the local Agents entry is a creation-tool shortcut, not hosted AI.
6. **Validate prototype and cloud collaboration parity separately.** Compare triggers, transitions, overlays/back behavior, preview navigation, presence, and cross-machine comments. The current collaboration service is local to one machine.

## Source pointers for implementation work

- Toolbar, Assets quick insert, and inspector markup: `dist/index.html` (`.tool-dock`, `#assets-tab`, `#design-panel`, `#prototype-panel`).
- Creation, zoom, tool state, and keyboard handling: `dist/app.js` (`addElement`, `panMode`, `syncToolState`, pointer listeners, `keydown`).
- Persistent/temporary tool state: `dist/tool-state.js`.
- Canvas placement math: `dist/canvas-placement.js`; behavior tests: `tests/canvas-placement.test.cjs` and `tests/tool-state.test.cjs`.
- Workbench tool panels and SVG presets: `dist/workbench.js`.
- Existing feature inventory and known limitations: `FEATURE-COVERAGE.md`.
- Earlier tutorial-focused assessment: `docs/figma-tutorial-forma-differences.md`.

## Recommended acceptance criteria

- Selecting any drawing tool leaves that tool active until another is chosen; drawing starts at the pointer and follows the pointer in canvas coordinates at every zoom/pan level.
- Shift/Alt behavior, click-without-drag behavior, snapping, and frame preset selection are explicitly defined and tested.
- Escape cancels an in-progress shape/path without leaving partial geometry; pointer cancellation and focus loss do not leave a stuck drag state.
- Each created object has stable layer identity, correct parent, correct coordinates, undo/redo support, and survives save/reopen.
- Keyboard shortcuts work from the canvas without stealing keystrokes from text/property fields.
- Mode changes update actual command availability and corresponding panels; accessibility labels expose active modes/tools.
- Image placement, path editing, mask behavior, style reuse, and prototype transitions each get focused end-to-end validation before being marked as Figma-parity complete.
