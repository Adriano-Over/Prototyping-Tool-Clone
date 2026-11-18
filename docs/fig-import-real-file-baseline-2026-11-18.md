# Figma Import Baseline — Real File

Date: 2026-11-18  
File: `Figma UI3 Toolbar (Community).fig`  
Source path: `C:\Users\Adriano\Downloads\Figma UI3 Toolbar (Community).fig`  
File size: 671,513 bytes

## Import route and result

Forma accepted the file through its authenticated local `POST /api/import/fig` route and returned HTTP 200. The actual file is a ZIP container with `canvas.fig`, `meta.json`, `thumbnail.png`, and six entries under `images/`. The parser returned Figma format version 101 and produced a schema-version-3 Forma project.

The returned project was saved to a uniquely named temporary project, reopened from the project API, and then deleted. Import, save, and reopen each returned HTTP 200. The reopened project preserved the 1 page, 1,691 scene records, 28 linked component definitions, 24 variable definitions, and 182 prototype bindings. The temporary project is no longer present (GET returns 404). No existing project was overwritten.

The normal editor File-menu path was also exercised in the browser with this exact file. Forma opened the imported `Toolbar Demo` page and exposed the imported 1,055-item layer tree; the saved project is `figma-ui3-toolbar-community-5`. The existing `Finance Dashboard` project remained present. The editor retained a 7% zoom from its previous project, so the imported design appeared very small until zoom is adjusted. This is a viewport presentation issue to investigate separately from parser correctness; the UI check confirms the actual file chooser → import → open flow, not visual parity.

## Figma feature status and evidence

| Figma feature | Status | Evidence from this file |
|---|---|---|
| ZIP container with `canvas.fig`, metadata, thumbnail, and image directory | Imported | Local ZIP entry listing; authenticated Forma import returned HTTP 200. |
| Figma version/header | Imported | Parser returned version 101; output is `forma-project`, schema version 3. |
| Pages and layer hierarchy | Imported | 1 page named `Toolbar Demo`; import summary reports 1,054 rendered occurrences from 628 source records. |
| Frames, shapes, vectors, and text | Imported with limits | Output contains frames, vectors, Boolean-operation layers, lines, rounded rectangles, ellipses, and 38 text layers. Vectors become SVG-backed image layers in Forma. |
| Image fills and embedded image files | Imported | Six image hashes resolved; no missing-image diagnostic. Initial project response contains six image assets plus the preserved source-record archive. |
| Auto-layout | Mapped by importer; this file’s visual result not compared pixel-for-pixel | `fig-import-layout.mjs` maps stack settings; synthetic cases pass `tests/fig-import-layout.test.cjs`. Real import produced no layout diagnostic for this file. |
| Components, component sets, variants, linked instances | Imported | 28 native definitions and 169 rendered linked instances; save/reopen retained the definitions. |
| Variables, collections, modes, and aliases | Imported with one incomplete override | 24 definitions across 4 collections; one `VARIABLE_MODE_OVERRIDE_INCOMPLETE` warning leaves that collection’s default mode active. |
| Prototype interactions | Preserved and partially mapped; not fully active | 182 layer bindings. One unsupported `DRAG` trigger, one action with no connection, and four variable actions missing resolvable targets are diagnosed and disabled. Imported Figma prototype interactions are disabled pending compatible runtime behavior. |
| Section node | Preserved as a basic editable layer | One `NODE_TYPE_UNSUPPORTED` warning for source node `1:15`; Forma reports that `SECTION` has no dedicated renderer. |
| Component override properties | Preserved in source metadata, not fully rendered | Six `OVERRIDE_PROPERTY_UNSUPPORTED` warnings for `prototypeInteractions` override records. |
| Save, reopen, project JSON compatibility | Passed for this file | Temporary project saved and reopened at revision 1; scene records and resource counts remained intact; scratch project was deleted. |
| Pixel-level parity against Figma thumbnail | Not tested | This run verified import and persistence, not a rendered screenshot comparison. |

## Diagnostics

The import returned 14 warnings:

| Diagnostic | Count | Effect |
|---|---:|---|
| `NODE_TYPE_UNSUPPORTED` | 1 | Section uses a basic editable layer. |
| `VARIABLE_MODE_OVERRIDE_INCOMPLETE` | 1 | Missing mode ID; collection default remains active. |
| `OVERRIDE_PROPERTY_UNSUPPORTED` | 6 | Source prototype-interaction override records are retained but not fully applied. |
| `PROTOTYPE_VARIABLE_TARGET_MISSING` | 4 | Original action is retained disabled; no variable changes. |
| `PROTOTYPE_TRIGGER_UNSUPPORTED` | 1 | `DRAG` interaction is retained disabled. |
| `PROTOTYPE_ACTION_NO_CONNECTION` | 1 | Disconnected action is retained disabled. |

No import errors, missing image references, unresolved component masters, or unresolved variable aliases were reported for this file.

## Import path map

| Module | Input → output | Responsibility |
|---|---|---|
| `fig-import.mjs` | `.fig` bytes → schema-version-3 Forma project | Calls `openfig-core`, maps editable pages/layers, source scene, components, variables, prototype records, and diagnostics. |
| `fig-import-source.mjs` | Decoded records/original bytes → source archive and content-addressed image assets | Preserves source data and creates stable document/occurrence IDs. |
| `fig-import-resource-index.mjs` | Decoded records → indexed resources and diagnostics | Resolves nodes, sibling order, symbols, variables, images, blobs, and references. |
| `fig-import-layout.mjs` | Figma stack fields → Forma flex styles | Maps direction, gaps, padding, alignment, wrap, sizing, and child positioning. |
| `fig-import-variables.mjs` | Resource index → native collections, modes, typed values, aliases | Converts variables and reports unsupported or unresolved values. |
| `fig-import-prototype.mjs` | Interactions plus resource references → Forma prototype records | Maps a limited set of triggers/actions and preserves unsupported items as disabled source data. |
| `dist/app.js` | User-selected file → local API request → saved/opened project | Reads the selected file, posts bytes, migrates the response, saves it, and opens the imported project after successful parsing. |
| `server.mjs` | Authenticated loopback request → imported JSON response | Enforces local request checks, applies the 200 MB body limit, and calls `importFigProject`. |

## Baseline tests

`npm run check` passed: 127 tests, 0 failures. Import coverage is in `tests/fig-import.test.cjs`, `tests/fig-import-source.test.cjs`, `tests/fig-import-layout.test.cjs`, `tests/fig-import-prototype.test.cjs`, and `tests/fig-import-resource-index.test.cjs`. Those tests exercise constructed decoded records; they do not replace the real-file run above. The existing server integration tests did not submit a `.fig` file; the real file was manually exercised through the authenticated import route and project save/reopen APIs.

## Not established by this phase

- Bare `fig-kiwi` files and other ZIP/compression variants were not tested with a real sample.
- Unsupported/corrupt file limits, ZIP path traversal, decompressed-size limits, and cancellation/progress behavior were not tested here.
- The imported page was not opened in a visual UI comparison against the included Figma thumbnail.
- No importer source changes were made in this phase.
