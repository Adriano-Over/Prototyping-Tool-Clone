const test=require('node:test'),assert=require('node:assert/strict');
test('design rendering validates dimensions and exports a portable SVG',async()=>{
  const {createRenderService,validateRenderRequest}=await import('../render-service.mjs');assert.throws(()=>validateRenderRequest({format:'png',scale:4,documents:[{html:'<div/>',width:10000,height:10000}]}),/megapixels/);
  const service=createRenderService({assetService:{portable:async value=>value},root:require('node:path').resolve('dist'),zipFiles:()=>{throw Error('unused');}});
  const value=await service.render({format:'svg',scale:1,transparent:true,documents:[{name:'Gradient',width:200,height:120,html:'<div xmlns="http://www.w3.org/1999/xhtml" style="width:200px;height:120px;background:linear-gradient(red,blue)">Vector export</div>'}]});assert.equal(value.mime,'image/svg+xml');assert.ok(value.bytes.toString().includes('data:font/ttf;base64,'));assert.ok(value.bytes.toString().includes('linear-gradient'));
});
