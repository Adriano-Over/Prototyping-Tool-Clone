# Rust migration workspace

This workspace is an incremental migration alongside the current Forma editor. The initial `forma-core` crate validates legacy project envelopes and retains their original JSON, including unknown fields. It also provides a shared undo/redo history for commands that set or remove existing-parent JSON object properties. This is a foundation, not yet integrated with the editor or a complete set of design commands. Initial typed pages and nodes can be serialized to JSON with hierarchy and geometry validation; unknown object fields on pages, nodes, transforms, and sizes are preserved. Unknown node kinds are still rejected. Legacy conversion, a complete project format, styling, storage, and the server remain to be implemented.

Variable aliases can be resolved across collections and selected modes, with errors for cycles, missing values, and type mismatches. This typed API is not yet connected to legacy project data. Unlike the existing JavaScript resolver, it currently reports a missing mode instead of falling back to the first available value; legacy compatibility requires an adapter and parity checks.

From this directory, run `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, and `cargo test --workspace --locked`. The fixture files are synthetic; the tests compare JSON values, not byte-for-byte serialization.
