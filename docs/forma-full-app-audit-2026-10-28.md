# Forma full app audit — 2026-10-28

## Scope and approach

Read-only audit of the Forma source, project folders, saved project metadata, existing audit notes, and live UI. The prior tutorial replay supplied the manual UI evidence for text insertion, drawing, radial gradients, masks, the email field, and preview. `npm run check` was run because this request asks for bugs to be found. No Forma source, project, or executable was changed as part of this audit.

Online marketplace and cloud-only features are excluded from the required build-feature scope.

## Confirmed or reproducible issues

### P1 — Text tool can send typed text to the wrong control — fixed

**Evidence:** In the fresh tutorial replay, a new text layer was created, but the attempted navigation text went into the font-size input. The first wordmark was editable; subsequent text insertions were not reliable. `dist/app.js` creates a 1×1 text component for a click, then relies on a deferred synthetic double-click and only applies a selection if GrapesJS reports that component as the active editor. If the view is not mounted or editing has not started, it silently leaves the text unfocused.

**Fix:** Make text creation wait for the component view to mount, explicitly enter GrapesJS text-edit mode, place the caret at the clicked point, and focus the canvas editor before returning control. Support point text and dragged text boxes separately, with a visible editing state and a reliable Escape exit. Add UI-level checks for immediate typing, repeated text creation, existing text editing, and keyboard focus not moving to Inspector inputs.

### P1 — Mask leaves the mask shape visible over the clipped artwork — fixed

**Evidence:** Applying an ellipse mask displayed “Mask applied,” but the gradient artwork beneath it disappeared from view and only the solid ellipse remained. In `dist/app.js`, `createMask` records a relationship and applies a CSS `clip-path` to the lower sibling; the mask shape itself remains an ordinary filled layer above that artwork. The visible fill therefore covers the clipped content.

**Fix:** Represent the mask and its content as a real editable mask relationship/group. Keep the mask geometry as the clip source while suppressing its ordinary fill in the rendered result. Recompute coordinates relative to the masked layer, and preserve edit-content, reorder, move/resize, release, save/reopen, preview, and export behavior. Add rectangle and ellipse tests with differing positions and sizes; verify the clipped artwork is visible and the outside is transparent.

### P2 — Two automated checks fail; one expectation is stale and the other needs a defined contract

`npm run check` completed with **68 passing and 2 failing tests**.

1. `tests/canvas-placement.test.cjs` expects pointer coordinates to be divided by zoom (250,200 at 125% becomes 200,160). `dist/canvas-placement.js` intentionally returns iframe-local CSS-pixel coordinates unchanged. During the tutorial replay, a rectangle drag at 13% appeared at the matching canvas position. **Fix:** update the obsolete test to assert the no-second-division behavior and add a regression case for a real canvas drag at low zoom. Do not reintroduce the old scaling unless runtime evidence proves it necessary.
2. `tests/preview-service.test.cjs` expects `preparePreviewDocument` to force `transform:none!important` on `.forma-preview-stage`. The current preview runtime deliberately scales that stage to fit its width, while the outer preview iframe handles modal fitting. Long-page scrolling worked in the manual preview. **Fix:** align the test with the intended current preview contract, and add an integration check for a long page plus page switching so scrolling and scaling cannot regress independently.

These failures indicate test/implementation drift; neither test alone proves a corresponding live failure.

### P2 — No automated UI coverage for the two confirmed failures

The existing suite exercises geometry helpers, project/history, previews, and model services, but does not exercise the mounted canvas text-edit handoff or the rendered mask stack that failed in the tutorial.

**Fix:** add browser-level tests that create text by click and drag and type immediately; verify focus/selection; create a gradient/image, apply an ellipse mask, and verify the rendered clipping in canvas, preview, save/reopen, and export.

## Known building-functionality gaps

These are documented capability limits, not all newly reproduced bugs. They are included because they affect whether Forma can complete a Figma website-building tutorial 1:1.

| Area | Current limit | Fix needed |
|---|---|---|
| Vector editing | Boolean operations and full vector-network editing are absent; pen editing is partial; Pencil pressure and editable text-on-path curves are incomplete. | Add editable vector-network semantics, Boolean operations, pressure/curve controls, and preserve editability after transforms and export. |
| Transform/scale | Scale mode does not provide the full multi-selection scale workflow or preserve all transform semantics. | Add group/multi-selection scaling with constraints and consistent geometry/style scaling. |
| Fills, strokes, effects | Gradient controls are basic; editable gradient handles, fill stacks, advanced stroke settings, and complete effect semantics are incomplete. | Use a layered fill/stroke/effect model with on-canvas gradient handles and persistence/undo support. |
| Image/media placement | Core image placement exists, but crop/position preview and complete video/media treatment are not equivalent. | Add image fill/crop editing, focal-point control, replacement, and video playback/render rules. |
| Layout | Auto layout exists, but Figma’s complete responsive sizing and child constraints are missing. | Implement hug/fill/fixed sizing, min/max, nested constraints, resizing behavior, and responsive previews. |
| Frames, sections, slices | The basic regions and selected-slice export exist, but section organization, per-slice batch export, and Figma metadata semantics are incomplete. | Complete region hierarchy, export settings, and consistent persistence and export behavior. |
| Prototype building | Basic triggers/actions exist; overlays, back/history, conditional branches, drag/keyboard/delay triggers, transitions, overflow, fixed/sticky layers, and interactive component variants remain incomplete. | Complete trigger/action authoring and preview runtime semantics, with separate authoring and preview state. |
| Local collaboration | Collaboration is local to this machine, not cross-machine/cloud. | Excluded from this requested building-only scope unless requested later. |

The detailed current coverage list remains in [`FEATURE-COVERAGE.md`](../FEATURE-COVERAGE.md).

## Project clutter and duplicate check

- **Only one `Forma.exe` exists in the Forma tree:** `desktop/bin/x64/Release/Forma.exe` (58,368 bytes; last written 2026-10-28). `wv2winrt.exe`, `node.exe`, `nuget.exe`, and `vs_BuildTools.exe` are WebView2/runtime/build dependencies, not duplicate Forma apps.
- **`GrapesJS/` is active data storage, not a duplicate app.** `dist/app.js` and `dist/project-store.js` use it for saved project JSON and generated exports. The actual vendored editor code is under `dist/vendor/`. Renaming or deleting the data folder without changing the store path risks losing projects.
- **The three saved project folders are distinct.** `untitled-project`, `untitled-project-2` (Tutorial replay), and `untitled-project-3` (Tutorial replay from zero) have different project IDs, sizes, and content hashes; the latest two are the preserved replay and the fresh audit replay. They are not byte-for-byte duplicates.
- **Two other top-level folders are separate handoff/research projects:** `_handoff_review/` and `pesquisas-feco-handoff-app/`. Fourteen same-relative-path assets are byte-identical between them. No reference from the Forma app source to those folders was found. They are candidates for separate archival, not Forma runtime dependencies; do not delete them as part of fixing Forma.
- **Several docs overlap:** `figma-live-visual-parity-audit.md`, `forma-figma-building-feature-gap-analysis-2026-10-26.md`, `figma-tutorial-forma-differences.md`, and `figma-prototype-parity-implementation.md` repeat some gap/implementation context. They are not identical; consolidate into one current gap register and retain dated evidence/history if the project owner wants fewer documents.
- **Build and generated folders:** `desktop/packages/`, `desktop/obj/`, `desktop/tools/`, and `desktop/runtime/` contain the WebView2 SDK, build outputs/tools, and bundled Node runtime. They are not duplicate app sources; build scripts depend on some of them. Separate them from user-facing project files or clean generated cache only after confirming the build can restore it.
- **Source control:** `figma-studio/` has no `.git` directory. This makes a safe change history/rollback harder. Initialize or connect the source to version control before larger cleanup or refactoring.

## Maintainability and startup warnings

- `dist/app.js` is about 144 KB and holds much of the UI, drawing, mask, preview, and event wiring; `style.css` is about 27 KB in 32 long lines. The code is difficult to review and localize defects even though smaller modules exist. **Fix:** split feature owners into focused source modules, format them, and keep one clear build/release source of truth.
- The original check emitted repeated `MODULE_TYPELESS_PACKAGE_JSON` warnings because `package.json` had no module type. **Fixed:** the project now declares ES modules; the style resolver was converted to a normal module while keeping Forma's browser global.
- Release integrity tests pass and the source tree contains one Forma executable. The release/build flow should continue validating that the shipped `dist/` exactly matches the tested files.

## Recommended fix order

1. **Complete:** repair text creation/edit focus and mask rendering; add regression coverage for both.
2. **Complete:** correct the stale coordinate test and make the preview scaling/scrolling contract explicit.
3. Continue the separate parity roadmap: image crop, complete gradient/fill editing, responsive layout, and vector/transform behavior.
4. Consolidate overlapping audit docs and move unrelated handoff projects outside the Forma app folder only after the user approves a cleanup plan.
5. Establish source control and split/format the large editor composition module before broad feature additions.

## Implementation follow-up — 2026-10-28

- **Fixed:** text insertion now waits for the GrapesJS text view, enters the editor's text mode, focuses the actual editable canvas node, and places the caret. If edit mode cannot start, Forma shows a clear fallback instead of letting typing land in Inspector fields.
- **Fixed:** a mask shape is hidden while it clips its lower sibling; the mask's original opacity is stored and restored when the mask is released. Existing saved masks are normalized during relationship sync.
- **Fixed:** the pointer-coordinate regression assertion now matches the observed iframe-local, no-double-zoom behavior. The preview test now verifies the current split: long-page scrolling in the document, width fitting in the preview runtime.
- **Added coverage:** text-edit focus/mount failure, mask path geometry and opacity preservation. The full `npm run check` suite passes **75/75** tests.
- **Live verification:** after reloading the running desktop app, the saved gradient artwork displayed through its ellipse mask in canvas and preview. A text layer typed in the canvas appeared in preview as `FOCUS CHECK`; its font-size control remained at 28 px instead of receiving the typed characters.
- **Resolved warning:** Node now treats project `.js` files as ES modules, and the style resolver exports its module API while retaining the browser global expected by Forma. The previous repeated module-type warnings are gone.
- **Not changed:** unrelated handoff folders, saved projects, build caches, Figma parity gaps, and the large app composition file. Those are data organization or follow-up feature work, not defects required for this bug-fix pass.
