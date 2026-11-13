# Forma — desktop design editor

A working visual design editor powered by **GrapesJS 0.23.6**, with locally bundled editor assets and a native Windows C++ host. The interface includes a canvas, a layer tree, multiple pages, an inspector, a tool palette, and an advanced design workbench.

## Run

From this directory, run:

```powershell
node server.mjs
```

Open http://127.0.0.1:5173. No dependency installation or build is required. A recent Node.js version is sufficient.

For the native Windows application, install the Visual Studio 2022 C++ build tools and run:

```powershell
npm run desktop:build
```

The C++20 source and build instructions are in [`desktop`](desktop/README.md).

## Features

- Click canvas elements or layer rows to select them; drag to move and use handles to resize.
- Double-click text on the canvas to edit it.
- Add frames, sections, slices, rectangles, ellipses, polygons, stars, lines, arrows, text, and buttons from grouped toolbar tools or the Assets panel. Pen paths support click-to-place anchors, Bézier handles, close/finish, and editing; selected slices export the page content within their bounds.
- Edit dimensions, position, rotation, corner radius, fill, opacity, typography, borders, and shadows. Gradient stops can be added, removed, recolored, repositioned, and given a CSS direction; image layers and image fills expose fit and crop-position controls.
- Align, duplicate, hide, lock, and delete layers. Expand and collapse groups; search layers.
- Create and switch pages; double-click a page or layer name to rename it.
- Zoom continuously from 1% to 25,600%; use cursor-anchored Ctrl/⌘+wheel, trackpad pinch, 1.5× zoom buttons, direct percentage entry, and screen-speed wheel/hand-tool panning. Shift+1 fits the page and Shift+2 fits the current selection.
- Designs autosave in this browser. Use Export → Download project for a portable JSON backup, or Open project to import one.
- Designs also autosave as readable JSON files in [`GrapesJS/projects`](GrapesJS/projects). Use **Projects** in the top bar to browse, search, create, open, and duplicate them.
- Preview designs and export all pages as portable HTML with CSS, local images, the bundled font, and prototype navigation included.
- Download portable JSON backups with embedded project images; duplicated projects own their image files independently.
- Recover saved projects from disk if browser recovery is missing. Conflicting browser copies remain downloadable in Projects, and stale sessions cannot overwrite a newer disk revision.
- Open **Workbench** for vector shapes, image placement, flexible auto layout with independent row/column gaps, layout grids, linked components with variants and overrides, variable collections and modes, prototype interactions (including overlays, back navigation, transitions, conditional/delayed actions, keyboard and drag/drop triggers), comments, named versions, and developer inspection.
- Export selected frames as PNG, appearance-preserving SVG, or multipage PDF. PNG and PDF rendering use the locally installed Edge or Chrome; SVG preserves browser appearance through `foreignObject`.
- Create local workspace accounts, invite collaborators with roles, edit together with live updates and presence, add threaded comments, save shared versions, publish component libraries, and branch/merge with conflict reporting. Data stays on this machine until you choose a hosting setup.
- Export an **AI recreation bundle** containing a canonical preview, GrapesJS source, flattened component tree, design tokens, HTML/CSS, local assets and fonts, plus framework-neutral instructions for rebuilding the design in any requested language.

## Shortcuts

V: select; H: pan; F: frame; R: rectangle; O: ellipse; T: text. Shift+1 fits the page; Shift+2 fits the selection. Ctrl/Cmd+D duplicates; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes. Arrow keys move selected layers by 1 px (Shift: 10 px); with no layer selected, arrows pan the canvas. Delete removes a selected layer. Ctrl/Cmd+wheel zooms at the pointer; plain wheel pans.

## Scope

Forma is being developed toward tool and workflow parity with the supplied Figma blueprint. The current implementation is a local design editor; the remaining editing and platform capabilities are tracked in [`FEATURE-COVERAGE.md`](FEATURE-COVERAGE.md). Designs and financial figures in the sample canvas are illustrative.

## Project layout

`dist/` contains the complete static application. `server.mjs` serves it locally and manages the project library. `GrapesJS/projects/` contains the saved design files. `GrapesJS/exports/` contains generated AI reconstruction folders and ZIP files. `dist/vendor/` contains GrapesJS and the bundled Inter font. `.openai/hosting.json` declares the static directory for future Sites publication; no Site was created because Sites is not enabled in this workspace.

## Verification

The reliability update adds automated checks for image duplication after source removal, portable backup restoration, bundle image paths, revision conflicts, failed startup recovery, storage exhaustion, mixed canvas/Workbench Undo/Redo, and local API origin/session boundaries. Live verification also covers editing an imported CSS gradient, Undo, Redo, reload, retaining a second page, and downloading multipage HTML with its font embedded.

Local project API writes require the session token returned by `GET /api/session` in `X-Forma-Token`; JSON routes require `application/json`. The service validates the loopback Host and rejects foreign browser origins. Workspace accounts use local password hashes and role-checked document access.

JavaScript syntax checks passed. Browser checks verified shape insertion, property persistence across selection changes, duplication, canvas dragging, direct text editing, undo/redo, page creation/switching, saved-design restoration after reload, the folder-backed project library, project search/open, design preview, the small-screen inspector, and AI-bundle ZIP download. The generated bundle was inspected for its manifest, 110-component tree, 57 colors, bundled font, extracted assets, canonical preview, and ZIP contents.

GrapesJS documentation: https://grapesjs.com/docs/
