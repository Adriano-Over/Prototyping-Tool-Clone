# DataPharma Figma Import Fidelity: Implementation Guide

## Objective

Make Forma reproduce the imported Figma design faithfully, starting with the **“2 - Visão Geral”** frame from `DataPharma - Dashboard Financeiro (Community).fig`. Preserve the source design and make the importer, canvas, and PNG export represent the same frame consistently.

This guide is based on a comparison of that frame in Figma and Forma. Both were exported at **1920 × 1080**. The images matched at **70.2% exact RGB pixels**; that metric includes font rasterization and antialiasing differences, so it is a locator for differences rather than a standalone pass/fail threshold.

## Comparison findings

### Confirmed

- The selected frame is 1920 × 1080 in both applications.
- The chart areas in the selected Figma frame are empty too. Do not add chart data as an import fix; that would alter the source design.
- Forma can export the frame to a 1920 × 1080 PNG. Export dimensions are correct; the remaining issue is visual fidelity.
- The Figma file contains layered header fills, an image fill with image adjustments, a half-opacity rounded rectangle (`Rectangle 4`), a dollar-coin vector, text using Inter and Inria Sans, and stroked cards/dividers.
- The current importer converts image fills to CSS backgrounds, vector paths to SVG, text to CSS text, and strokes to borders/shadows. Those conversions do not yet cover every Figma paint/effect property.
- Inter font files were not found in the imported project assets or the checked Windows Fonts folder. CSS names the font but does not bundle it, so browser fallback can change text metrics.

### Visual gaps to resolve

1. Header color, pattern, and image treatment differ; an overlay appears differently from Figma.
2. The revenue dollar-coin vector renders as a different ring-like shape.
3. Text weight, size, baseline, and spacing vary.
4. Card outlines and dividers do not consistently match.
5. Some navigation icons/colors differ, suggesting vector or component-instance paint/override loss.
6. More generally, layered transparency, paint order, masks, and effects need explicit support or an import warning.

The visible rounded header overlay maps to a real half-opacity source shape. **Do not remove or hide it as a cosmetic workaround.** First establish whether its stacking/compositing matches Figma.

## Relevant implementation locations

- [`fig-import.mjs`](../fig-import.mjs): Figma paint conversion (`paintCss`, `imageFillLayer`, `paintStackCss`), vector-to-SVG conversion (`vectorPathsToDataUrl`), node style mapping, text styles, strokes, frame clipping, and component-instance expansion.
- [`dist/asset-manager.js`](../dist/asset-manager.js): project-backed image fill URL replacement. Preserve the fill's crop, stacking, and effects when resolving the asset URL.
- [`dist/design-export.js`](../dist/design-export.js) and [`render-service.mjs`](../render-service.mjs): export request and browser rendering. These are relevant if the canvas matches but the exported PNG does not.
- [`tests/fig-import.test.cjs`](../tests/fig-import.test.cjs): existing importer test location, if adding coverage is part of the implementation work.

Do not edit generated or bundled files as the only fix if an editable source module is available. Follow the repository's existing build/release process for generated outputs.

## Implementation plan

### 1. Capture a stable reference and isolate differences

Before changing import behavior:

1. Keep the original `.fig` file unchanged and use the same `2 - Visão Geral` frame in both apps.
2. Export the Figma frame and Forma frame at 1920 × 1080, with the same content bounds and no editor selection outlines or overlays.
3. Save the reference/export paths and record the Forma importer revision used.
4. Generate a side-by-side and a difference image. Use a small per-region comparison for header, revenue icon, navigation, text, and cards. Do not use exact whole-image equality as the only criterion; text antialiasing can differ across renderers.
5. Confirm that the PNG is captured from the same page/frame and that export backgrounds/content bounds match before attributing any difference to import.

### 2. Correct paint stacks and image fills

**Cause to address:** Figma image paints can include scale mode, crop transform, rotation, opacity, color adjustment filters, and blend mode. A CSS `cover`/`contain` background does not express every Figma combination. The DataPharma header uses overlapping image and solid fills and includes `paintFilter` settings. The current conversion does not apply those image adjustments or all blend modes.

**Implementation instructions:**

1. Normalize each Figma paint into an intermediate representation that retains its source order, visibility, opacity, blend mode, image scale mode, crop matrix, rotation, scale, and image `paintFilter` fields (tint, shadows, highlights, exposure, temperature, vibrance, contrast).
2. Render fills in the same back-to-front order as Figma. Verify the ordering with a small fixture containing two opaque fills and then a translucent image over a solid fill.
3. Implement the Figma image crop transform and scale modes without losing the image's aspect ratio. Keep the existing asset URL replacement path from discarding or resetting those paint properties.
4. Implement image adjustments with a rendering path that can reproduce the Figma filter values. CSS filters alone may not match Figma's tint, highlights, shadows, and vibrance; use a deterministic pixel-processing or SVG/filter pipeline where necessary. Cache processed results by source hash and normalized filter parameters so the same image is not repeatedly transformed.
5. Apply paint opacity at the paint level, not by lowering opacity on the entire node and its children.
6. Support known blend modes explicitly. If a blend mode or filter cannot be reproduced, record it in the import summary and show a clear warning rather than silently substituting normal blending.
7. Compare the header before and after this work. Retain `Rectangle 4`; correct its paint alpha/order/compositing to match the reference rather than deleting it.

**Acceptance checks:** Header hues and pattern placement match the Figma export; the half-opacity overlay has the same extent and appearance; unrelated layers remain unchanged; imported asset replacement does not change the result.

### 3. Make vector rendering preserve Figma path semantics

**Cause to address:** The SVG conversion path currently reduces vector paints to a limited set of solid fills/strokes. Complex paint stacks, fill rules, masks, transforms, stroke properties, and some path-level details may be lost. The dollar-coin symbol is a clear regression case.

**Implementation instructions:**

1. Extend the vector representation to retain every path, path order, path transform, fill rule, fill paints, stroke paints, stroke width, cap, join, dash pattern, and opacity.
2. Preserve SVG fill rules such as `nonzero` and `evenodd`; do not serialize every path using browser defaults.
3. Preserve multiple fills/strokes and their ordering per path. Do not take only the first visible paint.
4. Preserve masks and clipping relationships used by vectors. If the source shape cannot be represented by the current SVG conversion, retain an editable vector structure or report it as unsupported.
5. Check how component instances apply paint overrides to descendant vector nodes. Preserve all applicable overrides when expanding an instance, not just the subset currently mapped.
6. Keep the vector as vector data where possible; avoid rasterizing it during import so it remains sharp at other zoom levels.
7. Add the DataPharma dollar-coin vector and at least one multicolor/multistroke vector as regression fixtures.

**Acceptance checks:** The dollar coin matches Figma's silhouette and interior detail at 100%, 200%, and the design's canvas zoom. Navigation icons preserve their expected colors. SVG bounds do not clip strokes or move the icon.

### 4. Package and apply fonts correctly

**Cause to address:** Imported text styles name a font family, but a CSS family name does not install or bundle a font. The project has no packaged Inter/Inria Sans font assets, and local Inter was not found. Substituted fonts change glyph widths, line breaks, weight, and baselines.

**Implementation instructions:**

1. Identify the exact family, style, and weight required by each text node in the Figma file. Resolve variable-font axes or static font files where applicable.
2. Bundle only fonts that Forma is permitted to redistribute. If redistribution is not permitted, provide a documented font-availability warning and a user-selectable local-font mapping.
3. Register bundled files with `@font-face`, including correct weight/style ranges, and wait for fonts to load before canvas capture or export.
4. Preserve Figma font family, weight, italic state, font size, line height, tracking, horizontal alignment, and text box dimensions. Do not use generic fallback until the requested font load has failed.
5. Ensure the same font loading path is used in the editor canvas and export renderer.

**Acceptance checks:** Inter and Inria Sans resolve to the intended font files in the editor and export. Text line breaks, measured widths, baselines, and weights match the reference. A missing-font case produces a visible warning instead of silently passing as faithful.

### 5. Match strokes, card borders, and dividers

**Cause to address:** Figma strokes can have multiple paints, alignment, opacity, and geometry. CSS borders and box-shadow approximations do not exactly match every inside/center/outside stroke, and line rendering can shift by a fraction of a pixel.

**Implementation instructions:**

1. Retain all visible stroke paints rather than selecting only the first one.
2. Implement inside, centered, and outside stroke alignment without changing the node's measured frame bounds. For vectors, represent strokes directly in SVG; for boxes, use a rendering approach that supports the alignment and rounded-corner behavior.
3. Preserve stroke opacity, width, joins, caps, and dash patterns.
4. Keep zero-height/zero-width lines from disappearing or shifting due to CSS layout. Render them with their source coordinates and stroke alignment.
5. Preserve independent corner radii where present instead of applying a single radius to all corners.
6. Compare the KPI container outline, its row dividers, and both chart card dividers against Figma at 100% export scale.

**Acceptance checks:** Borders have the same position, thickness, color, and corner shape; dividers begin/end at the same coordinates; no border is clipped by its parent or doubled by overlapping strokes.

### 6. Preserve component-instance overrides and layer appearance

**Cause to address:** Figma instances can override descendant fills, strokes, visibility, opacity, text, and component properties. Incomplete override expansion can produce icons with the wrong color or style. General node rendering also needs explicit treatment for blend mode, masks, transforms, and effects.

**Implementation instructions:**

1. Expand the supported Figma override types from the source schema. Map overrides to the correct descendant identity and apply them before rendering child nodes.
2. Include visibility, opacity, fills, strokes, text, component properties, and any supported effects in override handling.
3. Preserve affine transforms, not just translation and rotation. Either represent the full matrix with a CSS/SVG transform or flag unsupported skew/nonuniform-transform cases.
4. Implement masks and clipping from their actual source relationship. Do not infer that every frame is a clipping frame or that every vector mask can be replaced by `overflow: hidden`.
5. Preserve supported effects and blend modes in a defined rendering order. Make unsupported items visible in the import report.
6. Add fixture coverage for a component with a color override, a hidden child, a transformed child, and a masked vector.

**Acceptance checks:** Navigation icons render with the source instance's colors; hidden children remain hidden; transformed and masked content stays within the same bounds as Figma; unsupported behavior is reported instead of silently dropped.

### 7. Verify editor and export parity

After the importer fixes:

1. Re-import the untouched `.fig` file into a clean Forma project so stale project data cannot mask importer changes.
2. Compare the same frame in the Forma editor and its exported PNG. If the editor matches Figma but the PNG does not, investigate the export renderer, font readiness, color profile, scale, and content bounds separately.
3. Export PNG at 1×, 1920 × 1080, with content bounds equivalent to Figma. Record the settings used.
4. Review the header, dollar icon, nav icons, text, KPI card outline, and chart dividers at native size and at high zoom.
5. Recheck the full frame to catch regressions in layers that were not part of the focused fixtures.
6. Document remaining unsupported Figma properties per imported project. A clean render should not conceal dropped data.

## Recommended implementation order

1. Stable reference capture and per-region comparison.
2. Paint stack ordering, image crop, filters, opacity, and blend modes (resolves the largest header mismatch).
3. Vector paths, paint semantics, and component-instance overrides (resolves the revenue and navigation icon mismatches).
4. Font packaging/loading and text metrics.
5. Stroke alignment and line rendering.
6. General affine transforms, masks, and remaining effects.
7. Full-frame editor/export regression review and unsupported-feature reporting.

## Completion criteria

Call the DataPharma import faithful only when all of the following are true:

- The same Figma frame and Forma frame have identical dimensions, bounds, and content placement.
- Header, vectors, icons, text, borders, and dividers have been checked against the same-scale Figma export.
- No known visible source paint, font, vector, stroke, mask, or instance override has been silently discarded.
- The editor canvas and PNG export agree with one another.
- Any remaining difference is documented and explained (for example, renderer-specific antialiasing), rather than counted as an uninvestigated mismatch.

Do not claim that every imported Figma file is 1:1 based only on this one example. The DataPharma file is a regression fixture for the features it exercises; additional Figma files are needed to validate other paint types and component structures.
