# Migration fixtures

The project samples in `projects/` include small synthetic envelopes plus `forma-real-css-rules.json`, a minimized geometry sample derived from the checked-in Figma UI3 Toolbar Forma project. It retains the real frame and section IDs, dimensions, CSS rules, and `(max-width: 1400px)` media condition while omitting the design content. The Rust converter test verifies resolved geometry; the JavaScript migration test verifies the editor preserves those exact source rules. This is a focused regression fixture, not a substitute for a full real project or an independently authored `.fig` fixture.

`synthetic-shape.fig` is an original generated fixture with one rectangle and no user content. It was generated with `scripts/create-synthetic-fig.mjs` using the MIT-licensed `openfig-core` and Node's Zstandard support. It tests the binary import path; it is not an independently authored Figma export, so real-file coverage is still needed.
