# Forma editor fidelity test report

## Reliability follow-up — 19 October 2026

The original imported-gradient Undo failure below has been repaired by a single document history covering GrapesJS CSS rules, geometry, and Forma metadata. A fresh two-page CSS-gradient fixture was checked in the live editor: changing the first stop to green, Undo to red, Redo to green, and reload all passed; the second page remained present. A geometry edit followed by a variable-mode action also undid and redid in chronological order. These checks used disposable projects and did not edit existing designs.

Portable HTML was downloaded and inspected: both pages and the edited gradient were present, the bundled font was embedded, and no local asset API URLs remained. Automated tests cover independent duplicated image files, restoring a backup after removal of its source project, save conflicts, startup failure, and API boundaries.

## Automated checks

| Check | Expected | Result |
|---|---|---|
| `node --check dist/app.js` | Valid module syntax | Pass |
| `node --check dist/fidelity.js` | Valid module syntax | Pass |
| `node --check dist/style-resolver.js` | Valid module syntax | Pass |
| Gradient parser and individual stop edit | Keep type, angle, other stops and positions | Pass |
| Nested `rgba()` inside gradient | Preserve commas inside the color function | Pass |
| Multiple background layers | Identify gradient while retaining the remaining image layer | Pass |
| Shadow, backdrop blur, opacity resolution | Report actual declared values | Pass |

## Original manual checks (before the reliability follow-up)

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| Open the saved Pesquisas Feco project on File uploader and Preview | Same visible page and initial content | Both showed File uploader, Upload your files, and Drag and drop your file | Pass |
| Navigate to History in Preview | History heading and history content; outer viewport remains stable | Preview switched to History and showed Prepared jobs / No history yet; no click-triggered refit | Pass |
| Select the GrapesJS History page | Canvas displays its saved History page | The canvas showed the History page and its project content | Pass |
| Select the project logo layer | Inspector identifies the actual gradient and existing effect | Showed a 145° linear gradient, both RGB stops as color controls, and the existing drop shadow values | Pass |
| Save and reload without editing document content | Reopen saved document data | Project loaded from the existing folder and retained its pages | Pass |
| Edit a gradient stop | Only the chosen stop changes; Canvas and Preview reflect it | Inspector stop changed the live gradient CSS; project was restored to its original color after the test | Pass |
| Effects shown from the selected project layer | Inspector lists existing effects | Inspector displayed the selected layer's actual drop shadow value | Pass |
| Undo an Inspector style edit | Undo returns the document and Inspector to the prior value | A real gradient-stop edit remained applied after clicking Undo; GrapesJS undo tracking for this imported CSS style is unresolved | Fail |
| Pan, zoom, undo/redo, geometry and typography regression | Existing editor interactions remain operational | No regression observed during page selection and preview checks; broad interaction matrix was not repeated | Partial |

## Remaining issues

- **Resolved P1:** Inspector changes to imported CSS-rule-backed components now use the unified document history. The follow-up at the top records the gradient and mixed-edit regression checks.
- **P2:** The Layers panel still falls back to element type names such as `Div` for imported components without an explicit GrapesJS name. Semantic naming should be a separate safe improvement that preserves explicitly assigned names.
- **P2:** The preview implements generic page switching, theme, sidebar collapse, switches, and explicit prototype actions. Project-specific file processing remains a local mock and Preview interaction state does not write back to the document model.
- **P3:** Gradient controls expose color and position for parseable stops; unusual CSS color syntaxes and multi-stop interpolation hints remain editable through the raw CSS field rather than a dedicated control.

The current repair does not add collaboration, a native C++ renderer, or a new page/component schema. It stabilizes the existing GrapesJS web rendering path.
