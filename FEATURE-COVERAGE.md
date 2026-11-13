# Forma capability coverage

The supplied Figma tools guide describes a full product platform. Forma now implements a focused desktop design editor foundation and tracks the remaining platform work explicitly.

## Working editor capabilities

- Canvas, frames, sections, rectangles, ellipses, lines, text, images, polygons, stars, arrows, and freehand-style SVG strokes
- Grouped canvas tool dock with persistent Move/Hand/Scale, Frame/Section/Slice, shape/place, Pen/Pencil, and Text/Text-on-path tool choices; drag-created shapes, frames, sections, slices, arrows, and freehand paths use canvas coordinates and support square constraint with Shift
- Desktop, tablet, and phone frame presets; image/video placement from a chosen canvas point (still images insert as image fills); a File/Agents/Assets/Tools/Variables navigation rail connected to local project, asset, creation, and variable panels; Draw, Design, Motion, and Dev Mode controls; multi-track opacity/position/rotation/scale keyframes with duration, easing, and preview; searchable Actions palette with local selection, history, rulers, grid snap, nudge, zoom, and tool commands
- Blend mode, text case and letter spacing controls, plus a browser eyedropper when supported
- Hierarchical layers with rename, hide, lock, search, duplicate, delete, and drag reordering inside the same parent
- Position, size, rotation, opacity, corner radius, fills, typography, borders, shadows, clipping, and alignment
- Auto layout controls based on flex layout, wrapping, gap, padding, and alignment
- Column layout grids
- Multiple pages and canvas zoom/pan
- Continuous 1–25,600% canvas zoom with pointer-anchored wheel zoom, pinch zoom, geometric 1.5× zoom controls, typed percentages, fit-page/fit-selection shortcuts, and screen-space panning
- Linked reusable components with main/instance editing, overrides, exposed properties, variants, swapping, reset, and detach
- Variable collections with multiple modes, typed aliases, cycle checks, per-layer mode overrides, and bindings to layout, sizing, typography, fill, and border fields
- Auto layout with horizontal/vertical flow, wrapping, independent row and column gaps, alignment, independent padding, flexible/fixed sizing, and child constraints
- Prototype interactions support multiple triggers per layer and ordered action chains, including click, mouse enter/leave, double-click, mouse down/up, key press, drag start/drop, links, page navigation/back, overlays, transitions, delayed and conditional actions, messages, visibility toggles, scrolling, set-variable, and variable-driven conditional visibility in Preview
- Canvas-anchored comment pins stored with their comment thread and surfaced in Workbench Comments
- Named version snapshots with restoration
- Dev Mode measurements, HTML/CSS inspection, attributes, and clipboard export
- Local folder-backed projects, import/export, preview, and AI reconstruction bundles
- Native Windows C++20 host using Win32 and WebView2
- Local multi-account workspaces with owner/editor/commenter/viewer permissions, invite links, live update streams, collaborator presence, threaded comments, shared version snapshots, branches, merge conflict reports, and published component libraries
- PNG, SVG, and multipage PDF design export; PNG/PDF use the installed Edge or Chrome renderer and multipage exports download as ZIP files
- Independent image files in duplicated projects, embedded-image JSON backups, and portable multipage HTML with the bundled font
- One chronological Undo/Redo history covering canvas CSS and project metadata together
- Disk-first recovery, preserved conflicting browser copies, revision checks, and authenticated same-origin local writes

## Still outside the local implementation

- Cloud-hosted accounts and collaboration across different machines, audio, spotlight, public link controls, SSO, SCIM, and enterprise administration
- Community marketplace, plugin/widgets sandbox and external integrations
- Dedicated FigJam, Slides, Sites/CMS, Make, and Buzz products
- Generative AI, image editing, web retrieval, voice input, and MCP service connections
- Cloud publishing, analytics, and billing

The workspace service runs on the same machine as Forma and stores accounts, collaboration data, and documents in the local workspace directory. It does not connect users across machines; hosting and remote identity are a later deployment step.

## Limits found in the functionality review

- Fill editing now reads the selected layer's computed CSS color, supports 0–100% fill transparency, includes a **None** option, and exposes **Canvas background** as a selectable layer. The previous inspector showed a white opaque color for CSS-based or transparent fills.
- The Workbench button remains available on narrow screens. Preview frames allow prototype links to open from the preview.
- Prototype authoring now supports keyboard and drag/drop triggers, overlay open/close and backdrop dismissal, page back history, per-action delays and conditions, and dissolve/move/push page transitions. Smart Animate, interactive component variants, touch-specific triggers, persistent overlay routing, and Figma's full overflow/fixed/sticky semantics remain incomplete.
- Stroke style, SVG dash/cap/join, and per-side CSS border widths are now editable. Figma's stroke alignment, variable-width vector strokes, full vector-network semantics, Boolean operations, and full responsive constraints remain incomplete.
- Pen creates paths with successive canvas clicks, closes by clicking the first anchor, and finishes with Enter or double-click; click-drag anchors create editable Bézier handles. Double-clicking existing anchors adds smooth handles, midpoint anchors can be inserted, and right-click removes anchors while preserving at least two points. The Actions menu supports pixel-grid snap. Pencil pressure sensitivity and editable Text-on-path curves remain incomplete. Scale mode still resizes one selected layer by pointer drag and does not preserve multi-selection transforms or provide Figma's full scale workflow.
- Frames, Sections, and Slices now carry distinct region metadata; exporting a selected Slice crops the current page to that slice's bounds. Full section organization, per-slice export settings/batch behavior, and Figma-compatible region metadata remain incomplete. Frame presets and image/video placement provide the core workflows but do not reproduce Figma's full platform/device catalog, media crop interface, or drag-and-drop placement preview.
- The Actions palette routes local editor commands and resource panels, including selection, rulers, grid snapping, UI visibility, nudge distance, and keyboard shortcuts. Plugins/widgets remain discovery-only because Forma does not have an isolated extension runtime or marketplace connection. The navigation rail's Agents entry opens local creation tools; it does not provide Figma's hosted AI agent service. Draw/Design/Motion/Dev modes select tool behavior and open existing panels, but their complete Figma-specific workspaces are not equivalent.
- The eyedropper uses the browser EyeDropper API where available. Gradient stops now support add/remove, color, position, and CSS direction editing. Image layers and image fills now expose fit/crop position controls. Blend modes and text case/letter spacing are CSS-backed controls, not a native Figma style/fill model. On-canvas gradient handles, a complete editable fill stack, true shape-to-image fills/masks, and Figma's full image replacement/crop workflow remain incomplete.
- SVG export wraps browser-rendered HTML in an SVG foreignObject. It preserves appearance in compatible viewers but is not a fully native vector document.
- PNG and PDF export require Microsoft Edge or Chrome installed on the machine.
- The C++ desktop host is a native Windows window around WebView2; GrapesJS renders the design inside the web view.
- Workbench comments and canvas pins are included in the project document; named version snapshots are stored in the project folder. Browser storage provides recovery copies. Dev Mode reports component-level source information and is not equivalent to Figma's full inspect/code integrations.
