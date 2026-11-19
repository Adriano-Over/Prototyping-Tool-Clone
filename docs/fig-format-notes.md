# Figma import reconnaissance

The Node importer receives `.fig` bytes via `/api/import/fig` and uses `openfig-core` (`parseFig` and vector/gradient helpers). `fig-import.mjs` builds a Forma project and diagnostics; related modules handle source preservation, resource indexing, variables, layout, text, prototype interactions, and vector paint. The original decoded records are serialized as gzip/base64 assets with a 24 MiB compressed limit. Binary source fields use tagged base64 objects.

The importer retains source document metadata, node IDs and occurrence paths, assets, and scene relationships. It maps many component instances, variables, and prototype actions; unsupported behavior may be diagnosed and retained in source metadata. Existing documents and tests must be the reference for exact parity; complete Figma compatibility is not established.

Local sample inspection found the iOS 16 UI Kit contains real vector gradients and layer blend modes; `Sem título.fig` contains stacked fills. The latter currently fails full import during source preservation because decoded data contains a BigInt that `JSON.stringify` cannot serialize. This is an observed limitation to reproduce or address deliberately, not a successful parity fixture.

No third-party `.fig` files have been copied into this repository: permission to redistribute them and their license status have not been established. A small redistributable real fixture is still needed. Existing synthetic import cases are in `tests/fig-import*.test.cjs`.
