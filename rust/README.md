# Rust migration workspace

This workspace is an incremental migration alongside the current Forma editor. The initial `forma-core` crate validates legacy project envelopes and retains their original JSON, including unknown fields. It also provides a shared undo/redo history for commands that set or remove existing-parent JSON object properties. This is a foundation, not yet integrated with the editor or a complete set of design commands. The native document model, storage, and server remain to be implemented.

From this directory, run `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, and `cargo test --workspace --locked`. The fixture files are synthetic; the tests compare JSON values, not byte-for-byte serialization.
