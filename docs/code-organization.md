# Editor code organization

The editor is split by responsibility. `dist/app.js` remains the composition root: it starts GrapesJS, builds the editor shell and starter document, coordinates page/layer/inspector rendering, calls small named control binders, and publishes the `window.formaApi` bridge used by adjacent modules. Feature logic belongs in focused modules instead of one large handler.

| Module | Responsibility |
| --- | --- |
| `dist/app.js` | Application startup, canvas content, page/layer/inspector UI, command wiring, and export orchestration |
| `dist/project-store.js` | Project snapshots, folder API persistence, project listing/open/duplicate/delete, and save scheduling |
| `dist/zoom-controller.js` | Canvas zoom controls, fit-to-page calculation, resize handling, and keyboard-wheel zoom |
| `dist/style-resolver.js` | CSS parsing and mapping between GrapesJS styles and inspector controls |
| `dist/fidelity.js` | Fill/effects inspector behavior, preview window, and standalone HTML export |
| `dist/workbench.js` | Components, variables, comments, versions, prototype and developer panels |

Within `app.js`, control setup is grouped into fill, toolbar, project, tool palette, inspector, file, canvas/page, pan, and keyboard binders. This keeps startup readable while leaving the existing feature modules as the owners of zoom, persistence, styling, preview, and workbench behavior.

The app module should coordinate these services, not reimplement their behavior. Preview is owned by `fidelity.js`; project persistence is owned by `project-store.js`; zoom state and canvas fitting are owned by `zoom-controller.js`. The shared browser bridge provides only the editor instance and narrow callbacks required by those features.

## Zoom behavior

Fit sizes the active page component from its unscaled dimensions, then lets GrapesJS's native viewport fitter handle canvas coordinates and centering. It keeps a 36-pixel gap and a 5–100% fit range. A manual zoom action switches to manual mode, so resizing the app does not override the user's chosen scale; selecting Fit or changing pages returns to fit mode. The displayed percentage is read from the GrapesJS canvas state after each operation.

`npm run check` validates module syntax and runs the focused unit tests for fit-scale calculations and CSS style resolution.
