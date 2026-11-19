# Migration fixtures

The project samples in `projects/` include small synthetic envelopes plus minimized geometry samples derived from the checked-in Figma UI3 Toolbar Forma project. `forma-real-css-rules.json` covers ID-based frame geometry; `forma-real-flex.json` retains a real dropdown flex row, its child dimensions, padding, gap, and media condition while omitting design content. Rust tests verify converted geometry, and the JavaScript migration test verifies source CSS rules are preserved. These are focused regression fixtures, not substitutes for a full real project or an independently authored `.fig` fixture.

`synthetic-shape.fig` is an original generated fixture with one rectangle and no user content. It was generated with `scripts/create-synthetic-fig.mjs` using the MIT-licensed `openfig-core` and Node's Zstandard support. It tests the binary import path; it is not an independently authored Figma export, so real-file coverage is still needed.
