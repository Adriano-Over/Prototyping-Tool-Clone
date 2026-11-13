# Forma tutorial workflow plan and verification

## Target

Use Forma to build the design shown in the Flux Academy Figma tutorial, from a blank project through the final landing-page composition, and verify the saved design in Preview and an export. This plan covers the tutorial’s design-editor work. Its later Webflow lesson, hosted form submission, Figma community marketplace, cloud accounts, and cross-machine collaboration are outside the tutorial workflow.

## How each step should behave

| Stage | Expected Forma behavior | Regression coverage | Status |
|---|---|---|---|
| 1. Start and navigate | Open a blank project with a visible desktop frame; pan and zoom without shifting the canvas point under the pointer; select and inspect layers. | `blank-project`, `zoom-controller`, `canvas-placement`, `tool-state` | Automated core coverage; packaged UI replay still needed. |
| 2. Desktop frame and page | Set the frame to 1440 px wide and a tall page height; set background fill and opacity; add, edit, show, hide, and remove a centered 12-column grid. | `tutorial-workflow`, `layout-service`, `node-behavior` | Grid values and zoom math covered; live inspector workflow still needed. |
| 3. Draw and arrange navigation/hero | Draw rectangles, ellipses, and lines at pointer coordinates; maintain correct bounds in all drag directions; select, duplicate, reorder, group, align, undo, and redo layers. | `canvas-placement`, `stable-ids`, `document-history`, `tutorial-workflow` | Geometry and identity covered; full pointer/UI sequence still needed. |
| 4. Typography and buttons | Edit text directly; set family, weight, size, color, alignment, case, letter spacing, and line height; save a named text style, apply it to another text layer, and undo the change. | `text-editing`, `text-style-service`, `tutorial-workflow` | Named styles added and project-saved; apply/undo requires a packaged UI pass. |
| 5. Background decoration | Set ellipse fill, opacity, layer order, blur, and supported blend mode; keep edits after reopening and export. | `style-resolver`, `node-behavior`, `tutorial-workflow` | CSS values covered; rendered combinations need live visual comparison. |
| 6. Repeated cards and images | Import an image into the project, place it, change fit and horizontal/vertical crop position, duplicate it, and preserve the image reference in a saved project. | `asset-manager`, `image-fit-model`, `tutorial-workflow`, `project-model` | Fit/crop mapping covered; successful local import and live crop still needed. |
| 7. Testimonials and masks | Apply a rectangle/ellipse mask to the immediately lower layer; move and resize artwork independently; release the mask and restore the original opacity and clipping. | `mask-model`, `tutorial-workflow` | Clip math covered; interactive mask lifecycle and independent movement still need live test. |
| 8. Responsive CTA and footer | Use horizontal auto layout, gap, independent padding, hug/fixed/fill sizing, wrapping and child constraints. Longer button text should grow the button without overlapping neighboring controls. | `layout-service`, `tutorial-workflow` | CSS sizing rules covered; browser layout and frame-resize behavior still need live test. |
| 9. Preview, save, reopen, export | Save the complete page, close/reopen the project, then preview the long page and export it with typography, gradients, images, and masks intact. | `project-state`, `project-recovery`, `preview-service`, `render-service`, `tutorial-workflow` | Preview helpers and project metadata round trips covered; full rebuilt page round trip is still an end-to-end UI check. |

## Implemented in this pass

- Added project-scoped reusable text styles. The Text styles section in Workbench saves a named style from a text layer, applies it to another text layer, and deletes it. Applying a style replaces saved typography properties while preserving position, fill, and other non-typography properties.
- Added normalization and save/reopen coverage for the new text-style metadata. Older projects load with an empty style list.
- Moved image fit and focal-position mapping into a small tested model used by the image inspector. It handles both image elements and image-filled layers, including cover, contain, stretch, original size, and bounded focal-point percentages.
- Added tutorial acceptance tests for pointer placement, zoom anchoring, grid set/remove, image crop settings, CTA sizing, testimonial constraints, typography/gradient/effect data, mask geometry, and long-page preview.

## Verification run

Run `npm run check` after changes. The command syntax-checks the shipped modules and runs every `tests/*.test.cjs` test. The tutorial acceptance tests are deterministic model/helper checks; they do not click every control in the packaged Windows app.

The live completion pass should create a clean tutorial project and complete stages 1–9 in order. For each stage, record the input, expected result, observed result, and screenshot or saved/exported evidence. Save, close, reopen, and compare the final layer tree, style values, image assets, mask relationships, and rendered preview/export. Undo and redo should be checked after representative drawing, styling, and layout edits.

### Execution record — 2026-11-10

- `npm run check:tutorial`: 8 passed, 0 failed.
- `npm run check`: 86 passed, 0 failed.
- `npm run release`: succeeded. The packaged app is `desktop/release/Forma-2.0.6/Forma.exe`; its SHA-256 matches `desktop/bin/x64/Release/Forma.exe` (`331A507223B4557487621E915A42DEAC8A9BD6EF08884AECF73B7A9D268D6B7A`). The release folder contains one `Forma.exe` and includes the text-style and image-fit modules.
- Opened the local Forma editor and confirmed that Workbench renders the new **Text styles** section. The current browser project is an unrelated saved design, and the local service reported an `EPERM` while creating its project folder. No layers in that project were changed. Because there was no isolated clean project for this UI pass, the full tutorial replay remains open work.

## Remaining evidence before claiming tutorial-ready

The automated suite cannot establish pixel-perfect parity or prove the actual packaged UI path. A live replay still needs to exercise: toolbar menus and shortcuts, reversed pointer drags at multiple zoom levels, smart alignment/group/reorder, the color eyedropper support path, imported image crop controls, independent movement inside a mask, text-style save/apply/undo, button growth after text edits, frame-resize constraints, and a complete save-close-reopen-preview-export cycle. Record any failure as a reproducible step and add its regression before marking that stage complete.

### Reassessment — 2026-11-10

A fresh isolated live project was successfully created and used to check frame/grid setup, a shape placement at 13% zoom, basic text editing, text-style save/apply/reload, mask apply/release, and opening Preview. These checks passed at the limited scope recorded. The user’s saved projects were untouched. Grouping was not found in the actions search. The tutorial is **partially feasible with manual workarounds**, but full 1:1 completion is not established: exact fonts and line height, Figma starter-file import, group/smart alignment, image workflow, mask fidelity, and a complete page save/reopen/preview/export comparison remain gaps. See [the detailed reassessment](tutorial-feasibility-reassessment-2026-11-10.md).

### Implementation follow-up — 2026-11-11

- Added Outfit and Roboto font choices (loaded from Google Fonts), extended weight choices, and a line-height ratio control; preview and HTML export load the same fonts.
- Added a visible image fit/crop inspector for image layers, and image-tool imports now store project assets by ID so they can be re-resolved after opening a project.
- Added Ctrl/Cmd-click layer-row multi-selection, Group/Ungroup commands, selection alignment and distribution commands in the action search, and Ctrl/Cmd+G / Ctrl/Cmd+Shift+G shortcuts.
- The existing mask implementation still uses CSS clipping; this is an approximation of Figma masks. Live smart guides that snap objects to nearby edges and spacing are still missing. The full tutorial has not yet been replayed in the rebuilt app, and pixel parity remains unverified.
- Importing native Figma `.fig` documents is still unsupported. This requires a dedicated format/import path or an official Figma interchange route; this pass does not claim that gap is closed.
- `npm run check:tutorial`: 8 passed. `npm run check`: 86 passed. `npm run release` completed, including the Windows desktop build and release packaging.

### Implementation follow-up — 2026-11-13

- Added multi-select tidy-up and center/top constraint actions, plus a quick layer-panel action and action-search entries. Existing align, distribute, group, and ungroup operations remain available.
- Added keyboard-accessible Shift-click layer selection, smart edge/center snapping while dragging, and Alt-drag duplicate placement with smart guides.
- Added text box sizing (fixed, auto width, auto height), line-height modes (ratio, percent, pixels, auto), and vertical text alignment controls. Blend modes now include the tutorial's Luminosity and Screen modes plus the remaining standard CSS compositing modes.
- Added a canvas color-sampling fallback for browsers without the EyeDropper API. Added a project image gallery/import flow so tutorial images can be brought in as local image files and reused in the project.
- Added selection-tool unit coverage. `npm run check`: 89 passed. `npm run check:tutorial`: 8 passed.
- `npm run release` completed after the normal build was blocked by Windows access to the MSBuild `.tlog` file; the same release then succeeded with write access. Packaged distribution assets were hash-verified against `dist` by the release script.
- The refreshed package is `desktop/release/Forma-Desktop-2.0.6.zip`, with the app at `desktop/release/Forma-2.0.6/Forma.exe`. The source and packaged executable hashes match (`25D1643CEBBE08F87A748869ED52CC1077EE3B8143E310433F4076855994CB15`); the native host did not need relinking because no native host source changed, while the packaged editor files were refreshed.
- This is a source implementation and model-test result, not a full in-app replay. Smart guides, Alt-drag duplicate behavior, multi-selection constraints, image gallery import, the sampling fallback, and text mode controls still need a packaged UI pass. CSS masks remain an approximation; native `.fig` import and exact Figma interchange remain unsupported.

### Headless packaged-editor replay — 2026-11-13

- Replayed the interface in a provider-owned headless Chromium process against a temporary copy of the packaged editor and an isolated project folder; the user desktop was not controlled and saved user projects were not used.
- UI actions completed: create a blank project, rename it, set the Desktop frame to 1440 × 4000, set and apply the 12-column grid, add a text layer, set 34 px line height, auto-width, vertical middle, and Luminosity, open/close Preview, then save and reopen the project. The reopened project reported **Project opened**.
- No browser console errors or page errors were captured in the successful text/preview runs. A first text-insert locator was ambiguous because a hidden toolbar button shared the same selector; scoping it to the Assets panel fixed the test locator.
- This replay did not exercise drag gestures (including smart guides and Alt-drag), file chooser uploads/image placement, or verify the selected text's style values after reopening. Those remain unverified in the UI; the existing automated model/service checks cover parts of those paths.

### Verification follow-up — 2026-11-13

- Re-ran `npm run check`: 89 passed, 0 failed. Re-ran `npm run check:tutorial`: 8 passed, 0 failed.
- In a fresh provider-owned headless Chromium session against an isolated copy of the editor, creating a blank project, adding text, and setting 34 px line height, auto width, vertical middle, and Luminosity all completed. Accessibility capture showed each selected value in the inspector. A separate blank-project replay opened and closed Preview successfully.
- The first Preview run recorded a CORS failure loading `/vendor/Inter-Variable.ttf` from the sandboxed `about:srcdoc` origin. This was fixed in the later Preview font follow-up below. The browser runner also emitted a service-worker security error in that sandbox; source search found no app service-worker access, so that event is attributed to the test environment and is not counted as an app defect.
- The HTML export control completed and issued a Blob download named `finance-dashboard.html`, but the headless provider cancelled the download. The actual file contents were not verified.
- The REA scenario runner could not directly perform drag, modifier-click, or file-picker actions. A separate direct-CDP headless Chrome pass below covered those behaviors in an isolated profile and project directory.
- No code or executable was changed during this verification. The evidence does not establish 1:1 Figma parity or prove the editor bug-free. The known product gaps remain native `.fig` import and Figma-equivalent masks; masks use CSS clipping as an approximation.

### Direct headless interaction follow-up — 2026-11-13

- Used a separate isolated Chrome 157 profile connected over loopback CDP; all projects, test images, browser downloads, and server files were created under a temporary test directory that was removed after the run. The Forma desktop app and saved user projects were not used.
- Pointer drawing passed in both forward and reverse directions. The reverse drag normalized its bounds and produced a 225 × 175 px rectangle at X 790, Y 520 in the canvas coordinate space. A separate drawing also passed undo and redo.
- Dragging a rectangle near another layer displayed two smart-guide lines and landed at the expected alignment. Alt-drag created a second rectangle and reported “Duplicate placed.” Shift-click selected two layers; the Actions palette’s “Align selection center” brought both layer centers to the same coordinate.
- Saved and reopened the edited project. The three rectangles and their positions and dimensions matched before and after reopening.
- Imported a temporary 1 × 1 PNG through the file input, placed it from the project image gallery, changed its fit to `contain` with focal position 72% × 28%, and confirmed those settings remained after reopening. This validates the import and persistence path, but the tiny fixture does not validate realistic photo cropping or visual quality.
- Applied an ellipse mask to the adjacent image and released it. The image-mask relation appeared on apply and was removed on release. This verifies the UI lifecycle, not Figma pixel parity; the implementation still uses CSS clipping.
- Captured the HTML export into the temporary download folder (1,185,651 bytes). The download opened and completed; a pixel comparison of that export with the tutorial result was not performed.
- **Still open:** compare rendered screenshots at tutorial dimensions, exercise the tutorial with its actual image assets and complete visual styling, validate prototype interactions if required by the target tutorial, and establish feature parity with Figma. Native `.fig` import is unsupported; masks remain an approximation.

### Preview font fix — 2026-11-13

- Preview now fetches Forma's local Inter font in the parent page and embeds it as a data URL in the sandboxed preview document. The iframe remains sandboxed without `allow-same-origin`; the font no longer requires a cross-origin request from its opaque origin. Font data is cached for subsequent previews in the current editor session.
- Verified in Chrome 157 against a temporary isolated editor copy: the parent font request returned HTTP 200 for 876,576 bytes; the `about:srcdoc` frame contained the inline font face; its Inter `FontFace` status was `loaded`; `document.fonts.check('400 32px Inter', ...)` returned true; and no font console errors or failed font requests were recorded.
- Added unit coverage for byte-to-data-URL conversion, stylesheet replacement, and fallback behavior when fetching the local font fails. `npm run check`: 91 passed. `npm run check:tutorial`: 8 passed.
- Rebuilt `desktop/bin/x64/Release/Forma.exe` and packaged `desktop/release/Forma-2.0.6/Forma.exe` plus `desktop/release/Forma-Desktop-2.0.6.zip`. The build succeeded using a fresh intermediate directory because the previous MSBuild state file denied writes. The built and packaged executables have matching SHA-256 `DBE741F33F9AB35BB37D9A1DF26A1EF5E61AA8605FE583BEAE81E2D2E5A939D3`. The packaged `dist/preview-service.js` and ZIP entry both match the source SHA-256 `1A2A4B0B3A4CFBA2072F4D511526479BB7C9F2AC4AD513FB9CCC1D9905096B0D`.
