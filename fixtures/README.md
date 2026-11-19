# Migration fixtures

The project samples in `projects/` are synthetic and contain no user designs. They cover a legacy top-level editor payload, a legacy `data` envelope, and a version 3 Forma envelope. They are starting points, not substitutes for three real saved projects or an independently authored `.fig` fixture.

`synthetic-shape.fig` is an original generated fixture with one rectangle and no user content. It was generated with `scripts/create-synthetic-fig.mjs` using the MIT-licensed `openfig-core` and Node's Zstandard support. It tests the binary import path; it is not an independently authored Figma export, so real-file coverage is still needed.
