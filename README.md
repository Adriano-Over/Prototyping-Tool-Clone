# Forma — desktop design editor

A working visual design editor powered by **GrapesJS 0.23.6**, with locally bundled editor assets and a native Windows C++ host. The interface includes a canvas, a layer tree, multiple pages, an inspector, a tool palette, and an advanced design workbench.

## Run

From this directory, install the project dependencies once, then start Forma:

```powershell
npm install
npm start
```

Open http://127.0.0.1:5173. A recent Node.js version is sufficient. The editor, canvas, and fonts load from this project; no cloud account or internet connection is required for normal local editing. A prototype can still open a URL when the author explicitly configures that action.

Run the complete automated suite with `npm test`; `npm run lint` checks JavaScript syntax across the project and tests.

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
- Import Figma Design `.fig` files from the File menu. The importer preserves page/layer geometry, text, images, vectors, auto-layout, variables and aliases, components, variants, instance overrides, and prototype source actions where the format provides them. Imported paint stacks, standard CSS blend modes, per-corner radii, and linear/radial vector gradients are retained in CSS/SVG rendering and source metadata. Unsupported or unresolved source data is reported through import diagnostics. See [`FEATURE-COVERAGE.md`](FEATURE-COVERAGE.md) for current limits; this importer is not yet a guarantee of pixel-perfect Figma parity.
- Zoom continuously from 1% to 25,600%; use cursor-anchored Ctrl/⌘+wheel, trackpad pinch, 1.5× zoom buttons, direct percentage entry, and screen-speed wheel/hand-tool panning. Shift+1 fits the page and Shift+2 fits the current selection.
- Designs autosave in this browser. Use Export → Download project for a portable JSON backup, or Open project to import one.
- Designs also autosave as readable JSON files in [`GrapesJS/projects`](GrapesJS/projects). Use **Projects** in the top bar to browse, search, create, open, and duplicate them.
- Preview designs and export all pages as portable HTML with CSS, local images, the bundled fonts used by the design, and prototype navigation included.
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

`dist/` contains the checked-in frontend application source served directly by `server.mjs`; it is not generated by a frontend build step. The server also manages the local project library. `GrapesJS/projects/` contains user designs, `GrapesJS/exports/` contains generated AI recreation bundles, `dist/vendor/` contains GrapesJS and bundled fonts, and `docs/screenshots/` holds repository screenshots. User projects, workspace data, native build outputs, and generated exports are excluded from Git.

## Verification

Local project API writes require the session token returned by `GET /api/session` in `X-Forma-Token`; JSON routes require `application/json`. The service validates the loopback Host and rejects foreign browser origins. Workspace accounts use local password hashes and role-checked document access.

Latest automated verification (2026-11-19): `npm run check` passed all 146 tests, and `npm run lint` passed syntax checks for 98 project and test files. These checks validate implemented behavior and syntax; they do not certify every feature against Figma or prove pixel-perfect import parity. The specific import limits are listed in [`FEATURE-COVERAGE.md`](FEATURE-COVERAGE.md).

GrapesJS documentation: https://grapesjs.com/docs/
