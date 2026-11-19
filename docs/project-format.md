# Existing Forma project format

This is an initial source-based inventory from `dist/project-model.js`, `server.mjs`, and the import modules, not a complete formal schema. There are no saved sample projects in the current `GrapesJS/projects` directory to inspect.

Version 3 uses an envelope like:

```json
{"format":"forma-project","schemaVersion":3,"id":"example","name":"Example","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","revision":1,"editor":{"grapesjs":{"pages":[{"id":"page-1","frames":[{"component":{"type":"wrapper","components":[]}}]}]}},"forma":{"components":[],"textStyles":[],"variables":{},"comments":{},"prototype":{},"layoutMetadata":{},"scene":null,"importSources":[]},"assets":[]}
```

`editor.grapesjs` holds the editor's pages, frames, components, and styles. `forma` contains editor metadata; imported projects may include a canonical scene with source records, assets, component definitions, variables, and node relationships. Assets can be materialized into project-local files. `revision` is checked during saves; the server writes the previous revision plus one. Project IDs are normalized to lowercase path-safe names.

`migrateProject` accepts `editor.grapesjs.pages`, legacy `data.pages`, or top-level `pages`, and rejects future Forma schema versions. Its output selects known envelope fields, so unknown top-level fields are not necessarily preserved by current migration. The server requires at least one page when saving. Browser recovery and workspace graph serialization have additional rules in `dist/project-store.js` and `dist/collaboration-model.js`.

Rust parity must preserve actual input data and its existing behavior; proposed lossless preservation is an additional requirement, not a description of current migration. Fixture coverage and detailed nested-field examples remain to be established before this contract is frozen.
