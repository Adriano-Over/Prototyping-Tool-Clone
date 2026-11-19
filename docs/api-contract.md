# Existing local API: reconnaissance baseline

Source: `server.mjs`, `workspace-service.mjs`, `server-assets.mjs`, `render-service.mjs` at commit `de4f460`. This inventory describes observed source behavior; it still needs independent route-by-route black-box verification before being frozen for Rust parity.

The server binds loopback (default port 5173, positional argument or `PORT`). `GET /api/session` returns `{token}`. API writes require `X-Forma-Token`; most require `application/json`. Binary asset uploads and `.fig` import are exceptions. Host and Origin checks reject invalid requests with 403. JSON errors generally have `{error: string}`, sometimes `code`, `conflicts`, or `revision`. JSON request bodies are capped at 256,000,000 bytes; `.fig` at 200 MiB; assets at 30,000,000 bytes. Check individual handlers for error handling: these limits do not consistently return 413.

| Method | Route | Input and successful output |
| --- | --- | --- |
| GET | `/api/session` | 200 `{token}` |
| GET | `/api/projects` | 200 `{folder, projects}` |
| POST | `/api/projects` | project or legacy editor payload, optional `id`, `name`, `baseRevision`; 200 `{id,name,updatedAt,revision,folder}`; stale save 409 `REVISION_CONFLICT` |
| GET / DELETE | `/api/projects/:id` | project JSON / 200 `{id,deleted:true}`; missing 404 |
| POST | `/api/projects/:id/assets` | binary PNG/JPEG/WebP/GIF/SVG, `Content-Type` and optional `X-File-Name`; 200 asset metadata; unsupported MIME 415 |
| GET | `/api/projects/:id/assets/:assetId` | binary asset; missing 404 |
| GET / POST | `/api/projects/:id/versions` | 200 `{versions}` / 200 version metadata from `{name,project}` |
| GET / DELETE | `/api/projects/:id/versions/:versionId` | 200 project / `{id,deleted:true}`; missing 404 |
| POST | `/api/import/fig` | binary `.fig`, optional `X-File-Name`; 200 project JSON, invalid import 400 |
| POST | `/api/portable` | project/HTML payload; 200 portable payload with assets/fonts embedded |
| POST | `/api/render` | render request; 200 binary SVG, PNG, PDF or ZIP; render error 400 |
| POST | `/api/exports` | AI recreation bundle request; 200 bundle metadata |
| GET | `/api/exports/:id/download` | 200 ZIP; missing 404 |

Workspace routes are under `/api/workspace`, require the same local token for writes, and use an HttpOnly `forma_workspace` session cookie after sign-in. Unauthenticated access normally returns 401; absent file membership returns 404; insufficient role returns 403. Registration and login accept `{email,password,name?}` and return 200 `{user}`; password hashes use scrypt. Logout returns `{signedOut:true}`.

| Method | Workspace path | Input / result |
| --- | --- | --- |
| GET | `/me` | `{user}` or `{user:null}` |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | register, authenticate, or clear session |
| GET / POST | `/files` | `{files}` / `{project}` to create; 201 file summary |
| GET | `/files/:id` | file summary, graph and project |
| GET | `/files/:id/events` | SSE connected, document, presence and other events; heartbeat |
| POST | `/files/:id/presence` | `{clientId,pageId?,nodeId?,x?,y?,leave?}` → `{ok:true}` |
| POST | `/files/:id/ops` | `{operationId,baseRevision,changes}` → `{revision,graph}`; conflicts 409 |
| POST | `/files/:id/branches` | `{name}` → 201 branch summary |
| POST | `/files/:id/merge` | `{operationId}` → `{fileId,revision}`; conflicts 409 |
| GET / POST | `/files/:id/members` | `{members}` / `{email,role}` → `{ok:true}` |
| GET / POST | `/files/:id/comments` | `{threads}` / `{text,nodeId?}` → 201 thread |
| POST | `/files/:id/comments/:threadId` | `{text}` or `{resolved}` → `{ok:true}` |
| GET / POST | `/files/:id/versions` | `{versions}` / `{name}` → 201 version metadata |
| GET / DELETE | `/files/:id/versions/:versionId` | project / `{ok:true}` |
| POST | `/files/:id/library` | `{name?}` → 201 library |
| GET | `/files/:id/audit` | owner-only `{entries}` |
| GET | `/libraries`, `/libraries/:id` | accessible library summaries / full library |

Static requests resolve under `dist/` (`/` → `index.html`); missing files return 404. Storage is under `GrapesJS/projects/:id/project.json`, `assets/`, `versions/`, legacy `GrapesJS/projects/:id.json`, `GrapesJS/workspace/workspace.json`, and `GrapesJS/exports/`. Writes use temporary files and rename, but do not explicitly fsync. Render uses temporary directories and local Edge/Chrome for PNG/PDF. `release.mjs` stages `desktop/release/Forma-<version>` and builds a release ZIP.

## Request and storage details

- Project save accepts `{id?,name?,baseRevision?,editor:{grapesjs:{pages:[...]}},forma?,assets?}`, or the legacy `{data:{pages:[...]}}` / `{pages:[...]}` forms. A new project without an ID receives a unique normalized ID; an existing ID requires its current revision. Embedded assets are written to the destination's assets directory and their references rewritten. The operation returns 400 for an empty pages array.
- `POST /api/portable` takes a project, or an object containing `project` and/or `html`, and returns a copy with local asset references replaced with data URLs. A project asset whose data is missing produces an error. Bundled font CSS in HTML is embedded.
- `POST /api/render` requires `{format,documents,scale?,transparent?,projectId?}`; `format` is `png`, `pdf`, or `svg`; each document has `{html,width,height,name?}`. It accepts 1–100 documents, scale 1–4, maximum 16,384 pixels per dimension and 64 million pixels per scaled frame. Multiple PNG or SVG frames return ZIP; PDF returns one multipage PDF. SVG uses `foreignObject`. Render exceptions are returned as 400, including a full queue or missing browser.
- `POST /api/exports` consumes `{id?,name?,project,workbench?,html,css}` where `project.pages` exists. It writes a bundle folder and ZIP and returns `{id,name,createdAt,folder,zip,download,files,assets,components}`. Bundle contents include `manifest.json`, `preview.html`, `project.grapesjs.json`, `component-tree.json`, `design-tokens.json`, `workbench-data.json`, HTML, CSS, instructions and assets.
- An incomplete AI bundle request currently reaches the outer error handler and returns **500** with `{error:'Incomplete project export'}`. This is an observed compatibility detail, not an endorsement of that status code.
- Local asset IDs use `asset_` plus the first 20 hexadecimal characters of SHA-256. Embedded image assets are limited to 25 MiB; preserved Figma source assets to 24 MiB. Asset retrieval validates identifiers and resolved paths; SVG responses add a sandbox CSP.
- Workspace `/ops` accepts change objects of kinds `set`, `delete`, and `sequence`, each with a string-array `path`; `sequence` also has `before` and `value`. A successful operation increments revision. A repeated operation ID with identical actor and request is idempotent; reuse with different content returns 409. Concurrent conflicting paths return 409 with conflict paths and revision.
- Workspace authentication limits failed sign-in attempts per email and uses seven-day sessions. File owners manage membership, publish libraries and see audit entries; editors can edit, branch and create versions; commenters can comment; viewers can read. The service uses 404 for a file the user cannot access, and 403 for a forbidden action on an accessible file.

## Evidence and remaining review

`tests/server-reliability.test.cjs` exercises saves, revisions, assets, portable backups, bundle assets, and boundary headers. `tests/workspace-service.test.cjs` exercises registration, roles, streaming, conflicts, comments, versions, branches, merge and libraries. `tests/server-smoke.mjs` covers the project and version API. These tests do not cover every route, response field, failure path, or storage failure; the inventory remains provisional until those gaps are checked.

`tests/migration-contract.test.cjs` additionally checks project list/create/read/delete, stale writes, project version list/create/read/delete, synthetic `.fig` upload, invalid render/import, SVG output, bundle download and its incomplete-input error, workspace session visibility, file list, membership list, presence, version list/delete, library list, audit and logout. The tests use isolated temporary storage and synthetic data.

The same suite checks invalid registration (400), duplicate registration (409), hidden shared files (404), permitted viewer reads, denied viewer audit/library/version/branch operations (403), and invalid presence, operations, comments and membership roles (400). The complete role-by-action matrix is still outstanding.
