# Forma control verification — 2026-10-28

## Scope and meaning of status

This is a control-family coverage report for the packaged Forma 2.0.6 desktop app. “Automated pass” means the matching automated checks passed; it does not mean the visible control was clicked in the packaged app. “Live pass” means a UI interaction was observed in the packaged app. A blank area or “not exercised” is still unverified. Passing these checks cannot prove the absence of all bugs.

The static UI inventory contains **101 labeled or identified controls** from `dist/index.html`, with a live status and evidence field for each, in `docs/forma-control-inventory-2026-10-28.csv`. Current tally: 5 live round-trip passes, 3 targeted live passes, 38 smoke passes, and 55 controls not individually exercised live. The tally counts static controls, not dynamic inspector fields. Controls generated dynamically by Workbench and the image/stroke/gradient inspectors are represented by family in the matrix below because their exact fields are created at runtime.

The current project in the packaged app is `Tutorial replay from zero 2026-10-28`. Temporary canvas edits in this pass were undone. The project file contains the original six Desktop children and no test Frame; no test edits were saved as a new layer.

## Verification run

- `npm run check`: passed. This ran syntax checks for the shipped JavaScript modules and **76 tests**: 76 passed, 0 failed.
- Packaged app: launched and used through its WebView. The rebuilt release executable at `desktop/release/Forma-2.0.6/Forma.exe` matches the source build; SHA-256: `331A507223B4557487621E915A42DEAC8A9BD6EF08884AECF73B7A9D268D6B7A`.
- **Live pass — Quick Insert items:** Frame was added, undone, redone, then undone again. Rectangle, Ellipse (120×120), Text, Button, and Line (220×2) were each added from Assets > Quick Insert and removed with Undo. The project JSON has no temporary Frame.
- **Live pass — gradient:** edit, save, reopen, verify persisted stops, and export HTML with gradient CSS; test fill was restored.
- **Live pass — Auto Layout gaps:** set general/row/column gaps to distinct values, save/reopen and confirm values persisted; temporary layout was removed. Export-specific layout verification was not done.
- **Live pass — stroke style:** reproduced the dashed-to-solid regression, confirmed the fix, save/reopen and export CSS; restored Solid and zero widths.
- **Live pass — prototype keyboard action:** Enter-triggered message ran in Preview; temporary interaction was cleared, saved, reopened, and confirmed absent. It was not kept in the final export.
- **Live pass — clean HTML export:** after cleanup and reopen, exported the project; the HTML contains project content and not the temporary test message.
- **Live pass — X geometry round trip:** changed Desktop X from 88 to 89, saved/reopened and confirmed 89, restored 88 and saved; project JSON and HTML both contain `left:88px`.
- **Live pass — opacity smoke check:** changed Desktop opacity 100% → 99% → 100% and saved. Reopen/export persistence was not checked.
- **Live attempt — visibility:** toggled Desktop Hidden and then Visible. A fresh screenshot after closing the Downloads pane shows the final state as Visible.

- **Workbench navigation live check:** confirmed the Workbench opens after the Downloads pane was closed. Visually inspected Layout, Components, Variables, Prototype, Comments, Versions, Dev Mode, and Coverage sections. Versions initially displayed a loading state, then settled to the empty named-snapshots view. Dev Mode displayed Desktop HTML/CSS/attributes. Coverage rendered the capability map. This verifies section navigation and rendering only; controls inside each section were not individually exercised.
- **Live pass — local Variables controls:** added a temporary Color variable (`qa.verify_temp`, `#123456`) and deleted it; the list returned to the original six variables. The selected-layer binding returned to `color.primary`, and no temporary variable definition remains.
- **Variable deletion defect fixed and live-verified in the rebuilt package:** deletion now clears both generated encoded properties and legacy CSS aliases from page roots and layers. The regression test is green. After recreating and deleting `qa.verify_temp`, saving, closing and reopening Forma, the project still had one page and the original six Desktop children, with no variable definition or either stale CSS property. A fresh HTML export (1,187,124 bytes) also contained neither the temporary variable name nor either property. This workflow is a targeted live pass.
- **Live pass — navigation rail:** File opened and closed the Projects dialog; Assets opened Quick Insert; Agents and Tools opened the local Create Workbench section; Variables opened its Workbench section. These confirm navigation only, not the full functionality of those features.
- **Live pass — canvas and tool behavior:** at 13% zoom, drew a Polygon by dragging in a blank region of Desktop. Its reported X/Y/width/height matched the drag location and extent at the current zoom. Undo removed the temporary shape; the project still has only the original six Desktop children. The shape menu exposed Rectangle, Line, Arrow, Ellipse, Polygon, Star, Email input field, and Image/video. Keyboard shortcuts V, R, T, and P selected Move, Rectangle, Text, and Pen; V restored the selection tool.
- **Live pass — zoom controls:** zoom-in changed 13% to 20%; zoom-out returned to 13%. Numeric zoom entry also restored 13%.
- **Live pass — layer panel:** search for Rectangle filtered the layer list to its matching layer; clearing restored all layers. Renamed Desktop temporarily and restored the original name. Lock and unlock both worked and showed matching toast/icon state.
- **Live pass — geometry edit smoke checks:** changed and restored Y (72→73), width (1440→1441), height (4000→4001), rotation (0→1°), and corner radius (12→13). X has the separate saved/reopened/exported round trip above. These extra geometry edits were not individually save/reopen tested.
- **Live pass — solid fill controls:** changed the fill hex from 111318 to 223344 and restored it; fill transparency changed 100%→99%→100%. The fill-type menu exposed Solid, Linear gradient, and Radial gradient. The blend-mode menu exposed Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, and Color Burn; no new blend mode was applied.
- **Live pass — typography smoke checks:** font family changed from Inter to other available choices and restored to Inter; weight changed from Medium to Semibold and restored; size changed from 28 to 29 and restored to 28; alignment changed to center and restored to left; text color changed and restored to the original `#274D38`. The final inspector confirms Inter / Medium / 28 / `#274D38`, with left alignment selected. These checks were not individually saved and reopened.
- **Live pass — stroke width and layer blur smoke checks:** stroke width changed 0→1→0 (the inspector reflected 1px on all sides, then 0px); layer blur changed 0→2px→0 and displayed/cleared its CSS filter. The restored values are visible in the final inspector. These checks were not individually saved and reopened.
- **Live pass — tool modes:** switched to Draw, Motion, and Dev Mode, then returned to Design. Toasts and the selected dock icon confirmed Draw and Design; the Motion and Dev dock icons were also observed. No canvas content was created by these mode switches.
- **Live pass — prototype navigation control:** added a temporary click-to-page action and confirmed the inspector displayed one interaction/one ordered action. Cleared it; the toast confirmed the clear and the inspector returned to no saved navigation action.
- **Live pass — layout grid apply/remove:** applied the Desktop grid (12 columns, 15 gutter, 80 margin, 1110 max width), removed it, then restored and re-applied the original grid values. The saved project JSON confirms the original grid configuration and six original children are present.

## Control-family matrix

| Control family | Automated coverage that passed | Packaged-app exercise | Status / remaining check |
|---|---|---|---|
| Canvas placement, drag bounds, viewport zoom coordinates | `canvas-placement`, `zoom-controller` | Quick Insert Frame, Rectangle, Ellipse, Text, Button, Line; undo/redo; X geometry round trip | Partial. Quick insert, a Polygon drag placement/Undo, and button zoom in/out are confirmed. Pan, wheel/pinch zoom, fit-page, pen path completion, image/video placement, and multi-selection remain unverified live. |
| Tool dock, tool groups, shortcuts, mode buttons | `tool-state`, `text-editing`, `vector-tools` | Draw, Motion, Dev Mode, and Design activated; restored Design | Partial. Mode switching was smoke checked; each grouped tool and keyboard shortcuts panel still needs live action checks. |
| Layers and selection | `stable-ids`, `commands`, `project-model`, `document-history` | Original layer tree visible; temporary test layers were removed | Partial. Search, temporary rename, and lock/unlock were observed and restored. Hide, duplicate, delete, reorder, group, and multi-select need live checks; persisted state for rename and lock remains unverified. |
| Geometry and alignment inspector | `commands`, `node-behavior`, `document-history` | X position changed, saved, reopened, restored, and checked in HTML export | Partial. X is round-trip verified. Y/W/H/rotation/radius accepted temporary edits and restored values; their save/reopen persistence is unverified. Alignment, clipping, constraints, and reset remain unverified. |
| Appearance and fill inspector | `style-resolver`, `design-system` | Gradient round-trip/export; opacity edited/restored; visibility toggled and confirmed Visible | Partial. Hex and fill transparency edits restored successfully; the blend-mode menu choices and fill-type choices were inspected. Opacity reopen/export persistence, solid color picker behavior, None, applying radial gradient, gradient stop editing, eyedropper, and blend mode rendering remain unverified. |
| Typography | `text-editing`, `style-resolver` | Font family, weight, size, color, and left/center alignment changed and restored | Partial. Smoke checks only; letter spacing, case, text editing, right alignment, text-on-path, and persistence/export remain unverified. |
| Stroke and effects | `style-resolver`, `design-system`, `node-behavior` | Dashed + per-side width persisted and exported; width 0→1→0 and layer blur 0→2→0 smoke checked | Partial. Solid/dotted rendering, colors, caps, joins, every side, shadows, background blur, masks, combinations, and persistence/export remain unverified. |
| Frames, sections, grids, slices | `canvas-placement`, `layout-service`, `design-export` | Quick Insert Frame and undo/redo; grid apply/remove and original grid restoration verified | Partial. Grid control behavior is checked; frame presets, section/slice creation, slice crop/export, and restore remain unverified live. |
| Auto Layout and responsive sizing | `layout-service`, `document-history` | Distinct general/row/column gaps persisted after reopen | Partial. Direction, wrap, padding, alignment, sizing modes, constraints, nesting, and exported behavior remain unverified live. |
| Components and variants | `design-system` | Not functionally exercised in this pass | Not verified live. Main/instance edits, overrides, exposed properties, variant swaps, reset, and detach need live round trips. |
| Variables and modes | `design-system`, `project-model` | Temporary Color variable create/delete; save/reopen and HTML export confirmed no stale aliases or generated CSS properties | Variable deletion fix is verified. Collections/modes, aliases, binding changes, per-layer overrides, cycle/type errors, and broader export need checks. |
| Prototype authoring and preview | `preview-runtime`, `preview-service` | Enter key trigger showed the configured message; temporary interaction was cleared after reopen | Partial. Enter-key behavior was previewed earlier; click navigation was added and cleared here. Hover/drag/back/overlay/condition/delay/transition/scroll/variables and complex ordered chains still need live checks. |
| Assets, image crop, and video | `asset-manager`, `project-model` | Not functionally exercised in this pass | Not verified live. Upload limits have automated coverage; image fit/crop/focal point, replacement, embedded assets, video preview, and export need packaged-app checks. |
| Comments, versions, Dev Mode, navigation, Actions | `project-state`, `project-model`, `commands`, `collaboration-model` | Not functionally exercised in this pass | Not verified live. Pin/comment threads, snapshots/restoration, measurements/clipboard, menus, search, actions, and panel routing need UI workflows. |
| Save, reopen, recovery, import, duplicate, project switching | `project-store`, `project-recovery`, `project-state`, `server-reliability` | Gradient, stroke, layout, and prototype state reopened | Partial. Concurrent edits, interrupted writes, import/duplicate, and every save route need separate host-level checks. |
| Export: HTML, AI bundle, PNG, SVG, PDF, JSON | `design-export`, `render-service`, `release-integrity` | HTML export verified for gradient, stroke, and clean project | Partial. AI ZIP, backup/import JSON, PNG, SVG, PDF, multipage output, and reopened exports need packaged-app checks. |
| Local workspace/collaboration | `collaboration-model`, `workspace-service` | Not functionally exercised in the UI | Automated service pass only. Roles, invites, live events, presence, branches, merge conflicts, and permissions need multi-session UI tests. |
| Native Windows host and release package | `release-integrity` | Packaged executable launched and used | Partial. Host close/restart, background-process cleanup, file dialogs, renderer availability, and clean-machine installation need platform checks. |

## Current conclusion

The automated suite is green and several high-risk workflows have live packaged-app evidence, including fixed stroke behavior and variable cleanup. **55 of 101 inventoried static controls remain untested live, and the exercised controls are not all proven through save/reopen/export.** The variable-deletion regression is fixed and the rebuilt packaged app passed save/reopen/export verification. Image crop/position remains untested live. Dynamic fields inside Workbench and inspectors are not included in the 101-control tally. This is meaningful coverage, not proof that every feature is bug-free.

The Downloads pane is now closed and Workbench navigation can be inspected. The underlying individual Workbench actions and most right-side inspector controls remain unverified; the current live results are listed above. The visibility toggle was confirmed Visible after the overlay closed.

## Tutorial readiness replay — 2026-10-30

The supplied Flux Academy recording was used as the reference for a focused replay of the controls needed to build its page. This is a readiness check, not a claim that every tutorial step or every app control is bug-free.

- The rebuilt `desktop/release/Forma-2.0.6/Forma.exe` launched successfully. Its SHA-256 still matches the source executable: `331A507223B4557487621E915A42DEAC8A9BD6EF08884AECF73B7A9D268D6B7A`.
- `npm run check` passed all **77 tests** after the text-focus change.
- **Text insertion live pass:** in the packaged app, a point-text layer accepted immediate typing, rendered “TUTORIAL QA” on the canvas, and exposed the expected 185×41 text bounds. The temporary test text was undone. This verifies the observed focus failure path; it does not cover every font, text-box, and keyboard-edit case.
- **Canvas, grid, and placement live pass:** the active Desktop frame reported 1440×4000, with a 12-column grid, 15 px gutter, 80 px margin, and 1110 px maximum content width. Zoom changed from 100% to 25% and then 13%; the frame stayed in view. At 13%, a temporary rectangle drag produced a 382×308 shape at document coordinates X=528, Y=2482, visually under the pointer. Undo returned the layer count to 9. Pointer-anchored wheel zoom and other drag directions/modifiers were not exercised.
- **Gradient mask live pass:** the existing radial gradient remained visible through its ellipse mask in the editor and preview. The mask source's zero opacity is intentional: it hides the mask shape while the lower artwork is clipped.
- **Preview live pass:** preview opened, displayed the saved page, scrolled through its tall frame, and closed. The current project is still a partial tutorial design (dark frame, “CRYPTO” label, gradient artwork, and email field), not the finished NFT landing page shown at the end of the recording. The tutorial's real site behavior is outside this design-only preview unless prototype actions are authored.
- **HTML export live pass:** export completed with the “Portable HTML exported” message. The exported file contained the CRYPTO text, email field, and gradient CSS, and did not contain the temporary QA text. The file was saved to `C:\Users\Adriano\Downloads\tutorial-replay-from-zero-2026-10-28 (5).html` (1,187,209 bytes).

### Still needed for a strong readiness claim

The live replay did not cover image insertion/cropping, responsive auto layout, the tutorial's full text and button sequence, save-close-reopen of a newly built design, or interaction behavior in a completed prototype. The broad coverage matrix above still applies: many control families are automated-only or not individually exercised live. These checks would be required before describing the app as fully verified for the entire tutorial. The recording itself is available at `C:\Users\Adriano\Downloads\videoplayback.mp4`.













