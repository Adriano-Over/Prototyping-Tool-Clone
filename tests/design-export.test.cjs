const test = require('node:test');
const assert = require('node:assert/strict');

test('vector coverage resolves solid, half-covered and empty export pixels on the frame grid', async () => {
  const { sampleVectorPixels } = await import('../dist/vector-export-coverage.js');
  const inverse = { a:1, b:0, c:0, d:1, e:-0.5, f:0 };
  const tiles = sampleVectorPixels([0, 0, 4, 1], inverse, (x, y) => x >= 0 && x < 2 && y >= 0 && y < 1);
  assert.deepEqual(tiles[16], ['M1 0h1v1h-1Z']);
  assert.deepEqual(tiles[8], ['M0 0h1v1h-1Z', 'M2 0h1v1h-1Z']);
  assert.equal(tiles.flat().length, 3);
});

const makeLayer = (id, name, children = [], attributes = {}, style = {}) => ({
  get: key => ({formaNodeId:id,name,type:'default'})[key],
  getAttributes: () => attributes,
  getStyle: () => style,
  components: () => ({models:children}),
});

test('selected-frame export resolves the remembered ID after the selection and component models change', async () => {
  const { rememberExportTarget, collectExportDocuments } = await import('../dist/design-export.js');
  const preset = [{imageType:'PNG',suffix:'@1x'}];
  let cover = makeLayer('node_cover','TOOLBAR',[],{'data-figma-export-settings':JSON.stringify(preset)});
  const board = makeLayer('node_board','Examples');
  let root = makeLayer('node_root','Page',[board,cover]);
  let selected = cover;
  const page = {id:'page-1'};
  const api = {
    getProjectId: () => 'toolbar',
    selected: board,
    editor: {getSelected: () => selected, getWrapper: () => root, Pages:{getSelected: () => page, getAll: () => [page], select: () => assert.fail('single-page export changed the page')}},
  };
  const target = rememberExportTarget(api);
  assert.equal(target.name,'TOOLBAR');
  assert.deepEqual(target.presets,preset);
  selected = board;
  cover = makeLayer('node_cover','TOOLBAR');
  root = makeLayer('node_root','Page',[board,cover]);
  const result = await collectExportDocuments(api,'selection',target,(layer,options)=>({layer,options}));
  assert.equal(result[0].layer,cover);
  assert.equal(result[0].options.name,'TOOLBAR');
  assert.equal(selected,board);
  root = makeLayer('node_root','Page',[board]);
  await assert.rejects(collectExportDocuments(api,'selection',target,()=>assert.fail('wrong frame captured')),/selected layer is no longer available/);
});

test('slice exports use the remembered slice bounds after switching pages and then restore the current page', async () => {
  const { rememberExportTarget, collectExportDocuments } = await import('../dist/design-export.js');
  const slice = makeLayer('node_slice','Cover crop',[],{'data-forma-region':'slice'},{left:'10px',top:'20px',width:'60px',height:'40px'});
  const first = {id:'page-1', root:makeLayer('node_root1','Page 1',[slice])};
  const board = makeLayer('node_board2','Board');
  const second = {id:'page-2', root:makeLayer('node_root2','Page 2',[board])};
  let page = first, selected = slice, waits = 0;
  const api = {getProjectId:()=> 'test-project', editor:{getSelected:()=>selected,select:node=>{selected=node;},getWrapper:()=>page.root,Pages:{getSelected:()=>page,getAll:()=>[first,second],select:value=>{page=value;}}},renderPages(){},renderLayers(){},syncInspector(){}};
  const target = rememberExportTarget(api);
  page = second; selected = board;
  const [result] = await collectExportDocuments(api,'selection',target,(root,options)=>({root,options}),async()=>{waits++;});
  assert.equal(result.root,first.root);
  assert.deepEqual(result.options,{crop:{x:10,y:20,width:60,height:40},name:'Cover crop'});
  assert.equal(page,second);
  assert.equal(selected,board);
  assert.equal(waits,2);
});
