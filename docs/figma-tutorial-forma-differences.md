# Figma tutorial vs Forma: observed gaps and code paths

Updated: 2026-10-26

**Status:** This document records the earlier Forma baseline. The grouped drawing tools and placement behavior it identified have since been implemented in part; use [`figma-live-visual-parity-audit.md`](figma-live-visual-parity-audit.md) and `FEATURE-COVERAGE.md` for the current implementation status and remaining gaps.

## Evidence boundary

- The user-provided images were an earlier snapshot: they showed **Sem título** with the AI/chat area open. A later live visual inspection of Figma 126.10.11 observed the blank **Sem título** design workspace and the separate **Wireframing (cópia) - 1. Start** prototype. Neither is the Flux Academy starter file used in the tutorial. See [`figma-live-visual-parity-audit.md`](figma-live-visual-parity-audit.md) for the newer direct observations.
- The tutorial is Flux Academy's **Figma tutorial for Beginners: Complete Website from Start to Finish** (2022). Its chapter outline covers interface, page/grid setup, hero/navigation, background effects, content, masks/blend modes, gradients, footer, and a form.
- The later live inspection opened the blank design tab and visually inspected the tool dock, the Move dropdown, the Actions panel, and the separate prototype. No canvas objects were drawn or altered. This remains visual UI evidence; it is not a complete replay of the tutorial.
- REA passive Electron discovery could not connect at loopback ports 9222, 9223, or 9333. REA's static JavaScript analyzer rejected the installed `app.asar` as malformed during inventory. Thus there is no REA runtime trace or source-level proof of Figma's internal event handlers in this report.
- Figma is proprietary. Its shipped JavaScript bundle is not equivalent to original source code. Figma's official help documents establish the public behavior; Forma's actual source establishes Forma's implementation. Do not label the Forma code below as Figma code.

## Toolbar gap from the screenshots

The Figma reference screenshot shows a compact toolbar with grouped tool menus and a mode strip. Figma's official toolbar guide identifies Move, Frame/Region, Shape, Pen/Pencil, Text, Comments, Actions, and mode switching. The Shape menu contains rectangle, line, arrow, ellipse, polygon, star, and image/video placement.

Forma's main dock is much smaller. In `dist/index.html`, it only declares Select, Frame, Rectangle, Ellipse, Text, and Pan. It has no persistent Line/Arrow/Polygon/Star/Place-image shape menu, Pen/Pencil mode, Comment tool, or Figma-like mode switcher in that dock. Some similar concepts live elsewhere: Workbench has an SVG preset for polygon/star/arrow/pencil-looking artwork, and the left Assets tab has quick-insert controls. These are not equivalent to active drawing tools.

The behavior difference is more important than the icons:

| Figma | Forma source behavior | Effect in the tutorial |
|---|---|---|
| Choose a tool from a grouped menu, then click-drag to draw at the pointer location. Shift/Alt modifiers affect geometry. | The dock's `data-add` click calls `addElement(kind)`, which creates a predefined-size object centered in the parent and selects it. The keyboard handler maps `R`, `O`, `T`, and `F` to the same insertion function. | You cannot make each box/card/shape by dragging its exact size and position as shown. You must insert it, then reposition/resize using inspector or handles. |
| Frame tool supports freeform sizing and preset frame sizes. | Forma's `F` inserts a fixed 640×480 Frame. No draw-on-canvas gesture or device preset picker is attached to the toolbar. | The tutorial's 1440-wide desktop frame setup is not a one-step match. |
| Shape picker includes Line, Arrow, Polygon, Star, and image/video placement. | Main dock has only Rectangle and Ellipse; the Assets quick insert adds a fixed line, and Workbench's vector presets are SVG images rather than editable vector paths. | The visible bar is missing the shape families and placement workflow the tutorial relies on. |
| Pen builds editable vector networks; Pencil creates freehand paths. | No canvas pointer-to-path authoring tool is connected in the dock. Workbench's “Pencil stroke” is a pre-drawn SVG image. | Bézier edits, anchor handles, live freehand path creation, and Figma-style vector editing are not present. |

Figma's documented toolbar and shape behavior: [Access design tools from the toolbar](https://help.figma.com/hc/en-us/articles/360041064174-Access-design-tools-from-the-toolbar), [Shape tools](https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools).

## Forma code paths (verified in the workspace)

1. **Toolbar construction:** `dist/index.html` contains the `.tool-dock` and button declarations. `data-add="frame|rectangle|ellipse|text"` are the creation entry points; select and pan have separate handlers.
2. **Object insertion:** `dist/app.js:addElement(kind)` chooses dimensions in code (Frame 640×480, Rectangle 180×120, Ellipse 120×120, Text 240×45), calls `centeredElementPosition`, builds a GrapesJS component, appends it to the selected board, selects it, and refreshes layers. This is why new objects appear centered rather than under the pointer.
3. **Keyboard tools:** `dist/app.js:keydown` routes `R/O/T/F` into `addElement`; Space temporarily switches to pan and `H` toggles pan. These shortcuts select no persistent drawing mode.
4. **Workbench shape presets:** `dist/workbench.js:appendSvg` stores each polygon/star/arrow/pencil preset as a data-URL `image` component. The generated artwork looks vector-like but the preset path itself is not an editable node network.
5. **Layout guide overlay:** `dist/layout-panel.js` exposes only column count and gutter. `dist/layout-service.js:gridMetadataCommand` stores those two values, and `createGridOverlay` paints a CSS overlay. It does not expose Figma's uniform/column/row guide types, per-guide color/opacity, or centered/stretch layout-guide settings.
6. **Fills and styling:** `dist/index.html` and `dist/app.js:syncInspector` expose solid color, alpha, linear/radial gradient controls, typography, border, and shadow. `dist/fidelity.js` parses/edits CSS gradient stops. This is CSS styling over GrapesJS components, not Figma's native fill stack/image-fill editor.
7. **Auto layout and constraints:** `dist/layout-panel.js` plus `dist/layout-service.js` implement a basic CSS Flex layout, fixed/hug/fill sizing, and left/right/top/bottom/center/scale constraints. Forma has useful partial support, but the tutorial's interactions, layout semantics, and controls are not 1:1.

## Tutorial-by-tutorial comparison

| Tutorial section | What the tutorial does | Forma status and source-level difference |
|---|---|---|
| Starter file and interface (0:00–4:29) | Duplicates the Flux starter with a wireframe, color reference, text, and image assets; uses the layers and properties panels. | The screenshot shows a blank Figma file, not the starter. Forma offers local projects, Layers/Assets and a properties inspector, but cannot open a native Figma file as an editable project. Starting 1:1 also requires the starter assets/content. |
| Board navigation | Space-drag pans; zoom is available from the UI and keyboard. | Forma supports Space/H pan and continuous pointer-anchored zoom, but its toolbar and canvas interaction model differ. See `dist/app.js:keydown` and `dist/zoom-controller.js`. |
| Desktop frame and page background (4:30–6:08) | Chooses a Desktop preset, draws/positions it, makes the page tall, changes its fill, and samples a color using eyedropper `I`. | Forma inserts a fixed frame on `F`; width/height and fill can be edited in the inspector, but there is no frame preset/draw mode or eyedropper tool. |
| 12-column grid (6:09–9:20) | Adds layout guides, switches to columns, sets count/width/gutter, and centers content. | Forma grid metadata only exposes columns and gutter and paints a simplified equal-column overlay. There is no width/alignment/row/uniform type or grid color/opacity editor. |
| Hero/navigation, typography and buttons (9:21–21:19) | Positions provided text and images, changes font/weight/case/letter spacing, makes filled and ghost buttons, groups layers, uses tidy-up and eyedropper. | Forma supports text, basic font family/weight/size/alignment, shapes, layers, grouping through the component tree and basic auto layout. Its main UI lacks Figma's editing shortcuts, type details (case/letter spacing controls), style/library workflow, tidy-up behavior, and eyedropper. Button quick insert is a prebuilt HTML-like group, not a Figma vector grouping workflow. |
| Background effects (21:20–24:28) | Builds circles/shapes and tunes transparency/blend effects. | Forma supports ellipse/opacity and CSS effects. The draw-to-size shape workflow is missing; blend modes are not an equivalent first-class inspector control. |
| Content sections (25:00–30:49) | Duplicates and edits groups, uses alignment guides, text styles, responsive auto layout buttons, image placement, and section organization. | Forma can duplicate, align, use its CSS flex auto layout, and import images; the Figma grouping/editing and auto-layout behaviors are only partial and use different workflows. |
| Testimonial masks and blend modes (30:50–36:29) | Places a portrait inside an ellipse with **Use as mask**, then adjusts image contents and blend modes. | Forma has clipping (`overflow:hidden`) but no Figma mask stack where a shape masks a separately movable image. The layer model has no dedicated mask operation. The effect panel exposes a basic drop shadow, not the tutorial's blend-mode picker. |
| Gradient and CTA/footer (36:30–39:59) | Uses editable gradient fills and text/style refinements to create the call-to-action and footer. | Forma's inspector can produce simple two-stop linear/radial CSS gradients. It does not have an image/pattern fill stack, Figma gradient handles, or the same editable native fill model. |
| Newsletter form (40:00–42:25) | Visually assembles a field and submit button; the tutorial ends in design, then points to a separate Webflow video for making it a real website. | Forma can assemble the visual controls and has a local email-validation demo action, but that is not a working hosted form or backend. The tutorial itself does not implement a real form submission. |

The tutorial's stage order and contents are corroborated by the [video and chapter list](https://www.youtube.com/watch?v=HZuk6Wkx_Eg) and its [transcript](https://lilys.ai/en/notes/670210). This is tutorial documentation, not a live replay of the Figma window.

## What would close the largest gap

The most impactful first change is a real **tool-state + pointer-drawing system**: shape dropdown with rectangle/line/arrow/ellipse/polygon/star/image; persistent tool mode; pointer-down/move/up creates geometry under the cursor; modifier-key geometry; cancel/escape; and undo-safe object creation. Add a frame preset menu and freeform frame creation next. Then add editable vector paths, image fills/masking, fuller layout guides, blend modes, and text-style details. Keep the current click-to-insert shortcuts as quick-create actions where that remains useful.

Do not present these as implemented until pointer placement, draw sizing, presets, cancellation, undo/redo, and saving/reopening are tested in the app.
