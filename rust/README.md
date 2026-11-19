# Rust migration workspace

This workspace is an incremental migration alongside the current Forma editor. The initial `forma-core` crate validates legacy project envelopes and retains their original JSON, including unknown fields. It does not yet implement the native document model, editing, storage, or server.

From this directory, run `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, and `cargo test --workspace --locked`. The fixture files are synthetic; the tests compare JSON values, not byte-for-byte serialization.
