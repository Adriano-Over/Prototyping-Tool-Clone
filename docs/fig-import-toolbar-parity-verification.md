# Figma UI3 Toolbar import verification

Date: 2026-11-18

The supplied `Figma UI3 Toolbar (Community).fig` opens, saves, and reopens in Forma. The imported design and prototype differ from the original in Figma. This report covers the supplied file and the native apps used for the comparison.

## Appearance and canvas

Compared the live Figma and Forma editors on `Toolbar Demo`. Figma showed the `TOOLBAR` cover at 73% and the `Figma UI3 Components` section at 63%. Forma showed both at 62% after manual panning. Forma also exported the selected cover as a 1× PNG. The embedded Figma thumbnail is 122 × 400 and shows the whole page. It provides a secondary reference for the overall appearance, but the live app is the reference for icon detail. A matching 1× PNG from Figma could not be saved in this run, so no pixel match percentage was calculated.

| Check | What was observed | Evidence and next fix |
| --- | --- | --- |
| Cover dimensions and clipping | Both apps report 1024 × 800 with clipping enabled. The rotated examples are intentionally cut at the right edge in Figma as well. | Preserve the cover frame and this clipping. Forma normalizes source page coordinates by (+299, +513) in the generated editor, which accounts for the offset while preserving the relative positions of the four top-level items. |
| Cover typography | Figma shows a centered, condensed, uppercase title. Its credit and footer link each fit on one line. Forma shows a wider mixed case title, wraps the credit and link, and wraps some of the rotated mode labels. These differences reproduce in the PNG. | Source title `1:192` specifies `Oswald ExtraLight`, `UPPER`, centered text, and height auto-resize. Forma writes the Oswald family and generic fallback but omits uppercase and the ExtraLight weight. Apply the full font metadata, text case, decoration, and resize behavior, and verify Oswald resolves in the editor and export renderer. |
| Toolbar glyphs | Multiple shapes that should be fine line icons are solid squares or diamonds. The text and code controls are visibly wrong. The same pattern appears in the cover, component examples and cover PNG. | Example Boolean layers `14:1070` and `14:1121` become normal filled elements instead of resolved paths. Render Boolean geometry as paths, preserve strokes and fill rules, and check the rendered toolbar after nested instance overrides are applied. |
| Toolbar layout | The cover and component examples have the expected broad arrangement. Some imported controls sit low or overhang their shared toolbar housing, and divider and gap details differ. | The demo source uses horizontal auto layout and Forma maps a 418 × 48 toolbar variant to flex with an 8 px gap. Compare each child's rendered bounds and sizing with Figma before deciding which layout rule is responsible. |
| Component section | Both apps report 750 × 1000 and show the toolbar samples and variant tiles. Figma shows a section label, purple variant labels and dashed outlines. Forma imports the section as a basic layer and displays plain outlines or omits these labels. | Source `1:15` is a `SECTION`. Preserve the section type and implement its editor presentation. Keep editor labels and handles separate from export content. |
| Fit selection and overlays | Figma framed the selected section at 63%. In Forma, Fit selection dropped the zoom from 16% to 6% and left the selected section offscreen. Green `change-component-state` markers also extended over editor controls while the Design tab was active. | Fit using bounds and centers in a shared coordinate system. Confirm overlays are confined to the canvas and visible only in the intended editing mode. These are editor issues separate from how the imported artwork renders. |
| Selected cover PNG | Forma downloaded a 1024 × 800 PNG. A blue line visible around the export has an opaque `#3B97E3` pixel on its outer edge. The editor selection uses the same blue. | The export path clones the selected element and copies its computed styles. Check whether selection styles are included before stripping editor-specific styling and verifying the export again. |

## Editable structure and storage

- The file contains one page named `Toolbar Demo` in both apps. The source contains the `TOOLBAR` cover, `Figma UI3 Components` section, `Examples of the Figma UI3 Components` frame, and `.Colorama Swatch Template` component. All four appear in Forma. The section has a different layer type, and Forma exposes an extra canvas wrapper in the layer panel.
- The saved Forma project retained 28 component definitions, 169 linked instance records, and 24 variables in four collections. It has `Type=Default` and `Type=Dev Mode` toolbar variants and four toggle states. One inherited variable-mode override stays on the default because the supplied record lacks a mode ID. Presence of records does not verify that editor changes propagate identically to Figma.
- An isolated local round trip imported the actual file, changed the cover text and the toolbar gap from 8 px to 13 px, saved, and reopened. The import, save, reopen and sampled asset fetch each returned HTTP 200. Both edits persisted. Component IDs and variant lists, instance target IDs and override paths, and the variable and prototype records survived. This test edited the Forma project through its local API, so editing and propagation through the UI remain to be verified. The scratch project was cleaned up.

## Prototype playback

1. Figma started `Demo Interactive Toolbar` at the cover frame `1:187`. Clicking the center demo toolbar's `</>` toggle changed the full blue toolbar to the smaller green Dev Mode toolbar.
2. Forma Preview opened on a blank viewport even with `TOOLBAR` selected. Scrolling exposed part of the component section. The corresponding cover toggle was not visible or reachable in that preview, so a matching click could not be tested there.
3. Parsing the supplied file confirmed that the cover carries `prototypeStartingPoint.name = Demo Interactive Toolbar`. The starting point was absent from Forma's editable prototype state. The import retained 182 binding records with 226 interaction occurrences, and zero were enabled. Of those, 224 were marked pending runtime and two were disabled as unsupported occurrences. Forma's preview filters out disabled interactions, so the stored mappings alone do not make the demo playable.

To close this gap, map the flow start to the imported frame, present that frame at its own bounds, and connect imported state changes to the intended linked instance. Replay the Dev Mode toggle and then verify the documented drag and variable-action gaps separately.

## Checks run

- Live native Figma and Forma editor comparison, prototype launch in both apps, successful Figma Dev Mode toggle, and 1× Forma PNG export.
- Direct parse and import of the supplied file, plus real import → edit → save → reopen against an isolated Forma server.
- `npm run check` passed with 127 tests and zero failures.
- The rows above document the baseline. The typography follow-up below records the first fix and its verification.

## Follow-up: cover typography and alignment

- A fresh File-menu import used bundled Oswald, Happy Monkey, and Roboto Mono. The files are served locally and their SIL Open Font Licenses are in `dist/vendor`. Preview and image exports embed the bundled faces. The recreation ZIP includes the font files and their licenses.
- The importer now maps layer-wide font weight and style, case, decoration, letter spacing, line height, and text resize. The credit wrapper now stretches across the vertical layout's width, allowing its center alignment to take effect.
- The editor reported `Oswald`, weight `200`, uppercase, and `138px` line height for the title. Forma's selected-frame export produced `C:\Users\Adriano\Downloads\design (2).png` at 1024 × 800. The author credit fits on one line and its visible pixels center at x=511 on the 1024 px cover. The footer text fits on one line and is uppercase and underlined.
- Baseline and updated `npm run check` both passed all 127 tests. The updated tests cover text import, alignment, offline font embedding, and font files in the recreation bundle.
- The next visible differences are the solid toolbar glyphs, section presentation, selection outline in the PNG, and inactive prototype flow. Pixel and mixed text formatting parity are still open.

## Follow-up: toolbar glyphs

- Forma now renders the saved Boolean paths with their winding rules and keeps the operands in the layer tree. Saved expanded vector strokes are filled as outlines. Independent corner radii restore the comment bubble, and ellipse geometry restores the round detail in the resources icon.
- Preserving the saved dimensions of nested component instances aligned the row of icons. The vertical divider uses the same space it occupies in Figma. A narrower centered Dev Mode example retains its saved width.
- Reimported the supplied `.fig` through the File menu and verified the artwork in the editor. The final 1024 × 800 PNG uses the saved `TOOLBAR` frame selected by source ID `1:187` through the local renderer. A separate import, save, and reopen retained all 1,054 imported occurrences. The cover recovered all 24 Boolean occurrences with resolved geometry. For five representative glyph sources, the reopened SVG path data exactly matched the path decoded from the `.fig`.
- Compared the corrected glyph row against the Figma cover observed in the baseline. The former blocks are recognizable outline icons, and the row aligns with the reference. No pixel match was measured. The UI export picker sometimes reverted to the examples frame, so its selected-frame behavior is still open.
- Baseline `npm run check` passed 127 tests. The updated suite passed 129 tests.

## Follow-up: selected-frame export and 1× comparison

- Forma remembers the project, page, and stable layer ID when the export dialog opens. The dialog displays that layer name and resolves the same ID when exporting. If the layer disappears, it shows an error instead of exporting another frame. The exporter suspends editor highlights while measuring computed styles, then restores them.
- In Forma, a fresh File-menu import opened `Toolbar Demo`. Selecting `TOOLBAR` and using **Export PNG, SVG or PDF** → **Selected layer or frame (TOOLBAR)** → **1×** downloaded `TOOLBAR.png`. In Figma, the same 1024 × 800 frame (node `1:187`) exported as `Figma-TOOLBAR-reference-1x.png` using PNG at 1×. The temporary Figma export preset was undone after the file was saved.
- Both PNGs are 1024 × 800. The cover edge pixel checked at (0, 3) is white in both images. Forma previously exported the examples frame at 1024 × 973 or included the blue editor outline.
- On the central toolbar crop (x=299–723, y=574–627), 196 of 22,950 pixels (0.85%) differed by more than 32 in at least one RGB channel. Mean absolute channel difference was 1.42 on a scale of 0–255. Frame and text icon crops matched exactly. The expanded cursor stroke now respects outside alignment. The pointer crop dropped from 67 pixels over the threshold in the previous render to three in the current export.
- The 1× gate is still open. The resource icon remains the largest difference (113 pixels over the threshold), followed by the pen (32) and code toggle (28) in the tested crops. The numeric values come from the two exported PNGs, without scaling or aligning them after export. They measure this file and crop, without implying a general import tolerance.
- `npm run check` passed 129 tests before this change and 132 after, including stable export selection, cropping after a page change, and vector stroke alignment.

## Follow-up on Resources, Pen, and Code

- Forma draws thin centered strokes with SVG rectangles and ellipses. It renders solid Boolean paths inline, preserving their full source coordinates and winding rules. Fractional positioning survives canvas painting. The selected-frame export also preserves the SVG viewport and authored transform. Logical operands remain in the scene and stay hidden in the rendered result.
- Reimported the supplied file and saved and reopened the project in an isolated Forma server. In the mounted editor, selected cover `TOOLBAR` (source node `1:187`) and ran Forma’s selected-frame capture and render functions. The export was a single 1024 × 800 PNG at 1×. The captured frame included 30 inline SVG paints.
- Compared the previous and new Forma PNGs against Figma’s native 1× PNG at their original positions. Counts in the table include pixels whose red, green, or blue channel differs by more than 32 on a 0–255 scale.

| Region | Previous Forma PNG | Updated Forma PNG | Figma SVG rendered in Chrome |
| --- | ---: | ---: | ---: |
| Resources at x=621–640 and y=591–610 | 113 | 16 | 18 |
| Pen at x=488–505 and y=592–609 | 32 | 9 | 9 |
| Code at x=673–689 and y=594–608 | 28 | 0 | 0 |
| Central toolbar at x=299–723 and y=574–627 | 196 | 48 | 74 |

- The last column measures how Figma’s SVG differs from Figma’s own PNG when Chrome renders the SVG at 1×. Comparing the new Forma PNG directly against that same Chrome-rendered SVG gives zero pixels above 32 in each of the three icon crops. Average absolute channel differences are 0.34 for Resources, 0.33 for Pen, and 0.41 for Code. The native PNGs still differ in edge coverage, so the exact 1× match remains open.
- `npm run check` passed 133 tests. Verification used the source build and its export functions. The desktop executable was outside this change.

## Follow-up on 1× edge coverage

- Forma's design PNG export samples eligible small imported SVG fills and centered strokes at 16 positions per output pixel. It samples the authored geometry, then composites at the frame's pixel grid. The editor, SVG export, PDF export, and higher-scale PNG exports keep their existing vector rendering.
- The sample pattern reproduces the reference coverage for all 724 pixels across the Resources and Pen crops at 1×. A separate native 2× Figma export reproduced the same coverage pattern for all 1,296 Pen pixels and 1,598 of 1,600 Resources pixels at that resolution. Directly averaging the four corresponding pixels from the native 2× export does not reproduce the native 1× PNG.
- Saved and reopened the original import, selected the same `TOOLBAR` frame, and exported a 1024 × 800 PNG at 1×. The acceptance comparison uses exact decoded RGBA values and no crop alignment, scaling, or tolerance. Resources has 51 differences out of 400 pixels, down from 135. Pen has 36 differences out of 324, down from 125. Each remaining difference in these crops is one RGB level and zero alpha levels. The full-frame comparison found 34,881 differences out of 819,200 pixels. The pixel-for-pixel gate stays open.
- `npm run check` passed 134 tests, including the new export coverage regression.

## Desktop import retest

- The original desktop session had been running since before the importer changes. Its local endpoint parsed the same file and returned zero inline vector paints. The current importer returns 77. The old session selected the Examples frame, drew prototype markers in Design, and showed a browser-recovery warning.
- Forma now opens pages with multiple imported artboards at page scope. Fit selection converts iframe coordinates before centering, and the fit leaves room for the floating tool dock. Prototype markers stay within the canvas and appear only in the Prototype tab.
- Large browser recovery snapshots use IndexedDB with legacy local storage as a fallback. Generated vector images keep their current variable values without a second upload. Repeated editor update events with unchanged document content no longer create new autosave revisions.
- Reimported the attached file via the desktop File menu, saved it as **Figma UI3 Toolbar (Community) - Reimported**, and reopened it through the desktop launcher. The saved `Toolbar Demo` page contains all four top-level items and 77 inline vector paints. It reopened without prototype markers in Design or a recovery warning. Fit selection centered the 1024 × 800 cover. The saved revision stayed at 96 during a nine-second idle check.
- `npm run check` passed 139 tests. This retest verified opening and saving the supplied file. Pixel-for-pixel export fidelity and prototype playback remain open.
