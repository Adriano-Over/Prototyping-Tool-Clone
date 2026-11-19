// Creates an original, synthetic fixture without copying a user's Figma file.
import fs from 'node:fs';
import { zstdCompressSync } from 'node:zlib';
import { createEmptyFigDoc, encodeFigParts, assembleCanvasFig, createFigZip } from 'openfig-core';

const doc = createEmptyFigDoc();
doc.meta = { file_name: 'Forma synthetic fixture', version: 0 };
doc.message.nodeChanges.push({
  guid: { sessionID: 1, localID: 1 }, phase: 'CREATED',
  parentIndex: { guid: { sessionID: 0, localID: 1 }, position: 'a' },
  type: 'RECTANGLE', name: 'Blue rectangle', visible: true, opacity: 1,
  size: { x: 120, y: 80 }, transform: { m00: 1, m01: 0, m02: 20, m10: 0, m11: 1, m12: 30 },
  fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0.5, b: 1, a: 1 }, opacity: 1, visible: true }],
  strokeWeight: 0, strokeAlign: 'CENTER', strokeJoin: 'BEVEL',
});
const parts = encodeFigParts(doc);
const canvasFig = assembleCanvasFig({ ...parts, messageCompressed: zstdCompressSync(parts.messageRaw) });
fs.writeFileSync(new URL('../fixtures/synthetic-shape.fig', import.meta.url), createFigZip({ canvasFig, meta: doc.meta }));
