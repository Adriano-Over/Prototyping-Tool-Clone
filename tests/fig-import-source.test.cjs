const test=require('node:test');
const assert=require('node:assert/strict');
const {gunzipSync}=require('node:zlib');

test('source bundle keeps decoded binary records and uses a content-addressed asset',async()=>{
  const {createSourceDocumentBundle}=await import('../fig-import-source.mjs');
  const node={guid:{sessionID:2,localID:9},type:'VECTOR',name:'Icon'};
  const bytes=Buffer.from([0,1,2,253,254,255]);
  const doc={header:{prelude:'fig-kiwi',version:101},meta:{file_name:'Binary fixture'},nodes:[node],message:{blobs:[{bytes:new Uint8Array([4,5,6])}]},rawChunks:[new Uint8Array([7,8,9])],images:new Map([['image-hash',Buffer.from('png')]])};
  const result=createSourceDocumentBundle(doc,'Binary fixture',Buffer.from('source-file'));
  assert.equal(result.sourceDocument.sha256Kind,'original-file');
  assert.equal(result.sourceDocument.sha256,require('node:crypto').createHash('sha256').update('source-file').digest('hex'));
  assert.match(result.sourceDocument.sourceRecordsAssetId,/^asset_[a-f0-9]{20}$/);
  assert.equal(result.sourceAsset.id,result.sourceDocument.sourceRecordsAssetId);
  assert.equal(result.sourceAsset.mime,'application/vnd.forma.fig-source+gzip');
  const compressed=Buffer.from(result.sourceAsset.dataUrl.split(',')[1],'base64');
  assert.equal(compressed.length,result.sourceAsset.bytes);
  const source=JSON.parse(gunzipSync(compressed).toString('utf8'));
  assert.deepEqual(source.nodes,[node]);
  assert.deepEqual(source.message.blobs[0].bytes,{ $formaBinary:'Uint8Array',base64:Buffer.from([4,5,6]).toString('base64') });
  assert.deepEqual(source.rawChunks[0],{ $formaBinary:'Uint8Array',base64:Buffer.from([7,8,9]).toString('base64') });
  assert.equal(result.imageAssets[0].id,`asset_${require('node:crypto').createHash('sha256').update('png').digest('hex').slice(0,20)}`);
});

test('occurrence IDs are stable but distinct across instance paths',async()=>{
  const {stableImportedNodeId,sourceOccurrenceKey}=await import('../fig-import-source.mjs');
  const root=stableImportedNodeId('fig_123',[],'7:4');
  assert.equal(root,stableImportedNodeId('fig_123',[],'7:4'));
  assert.notEqual(root,stableImportedNodeId('fig_123',['7:2'],'7:4'));
  assert.notEqual(stableImportedNodeId('fig_123',['7:2'],'7:4'),stableImportedNodeId('fig_123',['7:3'],'7:4'));
  assert.equal(sourceOccurrenceKey('fig_123',['7:2'],'7:4'),JSON.stringify(['fig_123',['7:2'],'7:4']));
});

test('source archive limit fails the import instead of dropping source records',async()=>{
  const {createSourceDocumentBundle}=await import('../fig-import-source.mjs');
  const bytes=require('node:crypto').randomBytes(25*1024*1024);
  assert.throws(()=>createSourceDocumentBundle({header:{version:101},nodes:[],rawChunks:[new Uint8Array(bytes)]}),/import was stopped so source data is not discarded/i);
});
