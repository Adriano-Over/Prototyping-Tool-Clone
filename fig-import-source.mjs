import crypto from 'node:crypto';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';

const MAX_SOURCE_RECORDS_BYTES = 24 * 1024 * 1024;
const parserVersion = JSON.parse(fs.readFileSync(new URL('./node_modules/openfig-core/package.json', import.meta.url), 'utf8')).version;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function serializeSourceValue(value) {
  if (ArrayBuffer.isView(value)) {
    return { $formaBinary: value.constructor.name, base64: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  }
  if (value instanceof ArrayBuffer) return { $formaBinary: 'ArrayBuffer', base64: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(serializeSourceValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, serializeSourceValue(item)]));
  }
  return value;
}

export function createSourceDocumentBundle(doc, filename = 'Imported Figma design', sourceBytes = null) {
  const imageAssets = [...(doc.images || new Map())].map(([hash, value]) => {
    const bytes = Buffer.from(value);
    let mime = 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = 'image/jpeg';
    else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
    else if (bytes.toString('ascii', 0, 3) === 'GIF') mime = 'image/gif';
    const imageSha256 = sha256(bytes);
    return {
      id: `asset_${imageSha256.slice(0, 20)}`,
      figmaHash: String(hash),
      mime,
      sha256: imageSha256,
      bytes: bytes.length,
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
      name: `Figma image ${String(hash).slice(0, 12)}`,
    };
  });
  const sourcePayload = serializeSourceValue({
    header: doc.header || {},
    meta: doc.meta || {},
    nodes: doc.nodes || [],
    message: doc.message || null,
    rawChunks: doc.rawChunks || [],
    thumbnail: doc.thumbnail || null,
    imageManifest: imageAssets.map(({ id, figmaHash, mime, sha256: imageSha256, bytes }) => ({ id, figmaHash, mime, sha256: imageSha256, bytes })),
  });
  const sourceJson = Buffer.from(JSON.stringify(sourcePayload));
  const compressed = gzipSync(sourceJson, { level: 9, mtime: 0 });
  const sourceSha256 = sourceBytes ? sha256(sourceBytes) : sha256(sourceJson);
  const documentId = `fig_${sourceSha256.slice(0, 24)}`;
  const parser = { name: 'openfig-core', version: parserVersion };
  let sourceAsset = null;
  let sourceRecords = null;

  if (compressed.length > MAX_SOURCE_RECORDS_BYTES) {
    throw new Error(`This Figma file's preserved source records exceed Forma's ${MAX_SOURCE_RECORDS_BYTES}-byte limit. The import was stopped so source data is not discarded.`);
  }
  const recordsSha256 = sha256(compressed);
  const assetId = `asset_${recordsSha256.slice(0, 20)}`;
  sourceAsset = {
    id: assetId,
    name: `${String(filename).replace(/[\\/:*?"<>|]/g, ' ').trim() || 'Figma design'}.source-records.json.gz`,
    mime: 'application/vnd.forma.fig-source+gzip',
    sha256: recordsSha256,
    bytes: compressed.length,
    dataUrl: `data:application/vnd.forma.fig-source+gzip;base64,${compressed.toString('base64')}`,
  };
  sourceRecords = {
    assetId,
    encoding: 'gzip+base64',
    sha256: recordsSha256,
    uncompressedBytes: sourceJson.length,
    records: Array.isArray(doc.nodes) ? doc.nodes.length : 0,
  };

  const sourceDocument = {
    id: documentId,
    sha256: sourceSha256,
    sha256Kind: sourceBytes ? 'original-file' : 'decoded-records',
    figVersion: Number(doc.header?.version || 0),
    parser,
    fileName: String(filename).slice(0, 200),
    ...(sourceRecords ? { sourceRecordsAssetId: sourceRecords.assetId, sourceRecords } : {}),
  };

  return { documentId, sourceDocument, sourceRecords, sourceAsset, imageAssets };
}

export function stableImportedNodeId(documentId, instancePath, sourceNodeId) {
  const digest = sha256(Buffer.from(JSON.stringify([documentId, instancePath || [], sourceNodeId]))).slice(0, 32);
  const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return `node_${uuid}`;
}

export function sourceOccurrenceKey(documentId, instancePath, sourceNodeId) {
  return JSON.stringify([documentId, instancePath || [], sourceNodeId]);
}
