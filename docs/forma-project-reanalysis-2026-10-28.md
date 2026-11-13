# Forma project reanalysis — 2026-10-28

## Result

The current automated checks pass, but Forma is not yet bug-free or 1:1 with Figma. This pass found no new reproducible source defect. It confirms known feature gaps and a significant verification gap: the current suite is mostly unit/service level and does not automate realistic end-to-end editor interactions.

## What I checked

- Read `README.md`, `FEATURE-COVERAGE.md`, and the prior full-app audit.
- Inspected the app source/module inventory, current test inventory, package scripts, and the desktop release folder.
- Ran `npm run check`: JavaScript syntax checks passed and all **75 tests passed**.
- Counted the Forma application executable in `desktop/`: one `Forma.exe` is present at `desktop/bin/x64/Release/Forma.exe` (58,368 bytes, rebuilt 2026-10-28 16:06 local time). The packaged executable has the same SHA-256 as the source output; the release ZIP was rebuilt at 16:07.

## Bugs found in this pass

- **Stroke style reset:** changing an individual border-side width always wrote `border-style: solid`, silently replacing Dashed or Dotted. The same hard-coded Solid value was used when changing the overall stroke color/width. The controls now preserve the currently selected line style. In the rebuilt packaged app, I selected Dashed, set Top width to 3, confirmed Dashed remained selected, saved, reopened and confirmed both values persisted, and exported HTML containing both `border-style:dashed` and `border-top-width:3px`. I restored the test ellipse to its original Solid style and zero widths and saved it.

Passing tests do not prove the full UI is correct: they cannot cover every browser/WebView state, pointer sequence, imported project, or platform configuration.

## Remaining gaps recorded in the current implementation

These are known capability differences from Figma, not newly reproduced runtime failures:

- **Vectors and transforms:** no full editable vector-network model or Boolean operations; Pencil pressure and editable text-on-path are incomplete; Scale does not reproduce Figma's complete multi-selection/group scaling semantics.
- **Fills and effects:** gradient editing lacks on-canvas handles and a full editable fill stack; advanced stroke/effect semantics and native Figma style behavior are incomplete.
- **Images and media:** image crop/focal-point/replacement controls and full video/media placement behavior are incomplete.
- **Responsive layout:** Auto Layout lacks the full set of Hug/Fill/Fixed sizing, min/max sizing, nested constraints, and responsive resize behavior.
- **Prototyping:** advanced triggers, overlays/back history, conditional branches, transitions, overflow, fixed/sticky layers, and interactive component variants are incomplete.
- **Frames and slices:** section organization, batch slice export settings, and Figma-compatible metadata are incomplete.
- **Platform scope:** cloud collaboration, hosted AI, marketplace/plugins, and other separate Figma products are outside Forma's local building-editor scope.

See `FEATURE-COVERAGE.md` for the detailed coverage inventory.

## Verification still needed for stronger confidence

1. Add browser/WebView end-to-end coverage for the editor's highest-risk flows: create/edit text, draw and transform shapes, mask rendered artwork, preview prototype actions, save/reopen, undo/redo, and export.
2. Run that suite against the packaged WebView app, not only the development browser, to catch host-specific behavior.
3. Compare each building workflow directly against the current Figma web app with the same inputs and record screenshots/interaction outcomes. This reanalysis did not attach to or operate Figma, so parity statements above are from Forma's current coverage records rather than a fresh live Figma comparison.

The control-family verification matrix and 101-control static UI inventory are tracked in `docs/forma-control-verification-2026-10-28.md` and `docs/forma-control-inventory-2026-10-28.csv`; they distinguish automated test coverage from packaged-app UI checks and list the remaining unverified controls.

## Conclusion

Forma's existing regression suite is green. It is not accurate to claim that all bugs or Figma gaps are resolved. The next concrete quality step is end-to-end testing of the editor and a fresh, workflow-by-workflow live Figma comparison; the major known parity gaps above still need implementation.

## Implementation follow-up

After this review, the following gaps were narrowed in source:

- Auto Layout exposes a separate column-gap setting alongside row gap.
- The Fill inspector can add/remove gradient stops and edit their color, position, and CSS direction.
- Image layers and CSS image fills expose fit mode and horizontal/vertical crop-position controls.
- Stroke editing now includes line style, SVG cap/join/dash settings, and per-side CSS border widths.
- Prototype preview now handles keyboard and drag/drop triggers; overlay open/close, backdrop dismissal, back history, transitions, per-action delays, and conditional actions.

After these edits, `npm run check` was rerun: syntax checks passed and all **75 tests passed**. The desktop executable was rebuilt and packaged as `desktop/release/Forma-2.0.6/Forma.exe` and `desktop/release/Forma-Desktop-2.0.6.zip`. The packaged app launched successfully in its WebView. A live UI inspection confirmed that the new Line style/cap/join and per-side border controls, separate Auto Layout row/column gaps, and Prototype trigger choices are present. I added a temporary keyboard-triggered prototype interaction, verified it in preview, then removed it and reopened the project to confirm the prototype is clean.

The targeted packaged-app functional checks covered:

- **Gradient:** changed the ellipse from solid to linear gradient, saved, closed and reopened Forma, confirmed the gradient and stop values persisted, exported portable HTML, and confirmed the export contains gradient CSS and an embedded Inter font. Restored the original solid `#B9D9C3` fill and saved it. Export: `C:\Users\Adriano\Downloads\tutorial-replay-from-zero-2026-10-28.html` (1,186,948 bytes).
- **Auto Layout:** set the general, row, and column gaps to distinct values (23, 31, 41), applied them, saved and reopened, and confirmed all three values persisted independently. Removed the temporary layout and saved the original 16/16/16 values.
- **Stroke:** reproduced and fixed the style-reset bug above. The rebuilt package retained Dashed and Top width 3 after save/reopen; exported HTML contained both declarations. Export: `C:\Users\Adriano\Downloads\tutorial-replay-from-zero-2026-10-28 (1).html` (1,187,063 bytes). Restored Solid and all zero widths afterward.

The clean project was reopened in the packaged app and exported again after cleanup: `C:\Users\Adriano\Downloads\tutorial-replay-from-zero-2026-10-28 (2).html` (1,187,062 bytes). The export contains the saved design content and excludes the temporary keyboard-test message. Gradient, Auto Layout, stroke, and prototype keyboard-action workflows have now been exercised across the applicable edit/save/reopen/export or preview steps. Image crop/position controls have not yet received a live edit-save-reopen-export check. This is targeted packaged-app verification, not a complete end-to-end pass of every editor control, and the pass did not include a fresh live Figma comparison. The remaining vector/Boolean, full scale, native fill-stack/gradient-handle, image replacement/crop parity, responsive sizing, advanced prototype, and frame/slice gaps above are still open.
