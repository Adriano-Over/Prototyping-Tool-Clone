const test = require('node:test');
const assert = require('node:assert/strict');

test('assigns stable IDs once and repairs duplicates deterministically', async () => {
  const { ensureStableNodeIds } = await import('../dist/stable-ids.js');
  const root={components:[{formaNodeId:'node_existing1',components:[]},{formaNodeId:'node_existing1',components:[{}]}]};
  let n=0;const result=ensureStableNodeIds(root,{createId:()=>`node_generated${++n}`});
  assert.equal(result.assigned,2);assert.equal(result.repaired,1);
  assert.equal(root.components[0].formaNodeId,'node_existing1');assert.equal(root.components[1].formaNodeId,'node_generated2');
  const snapshot=JSON.stringify(root);ensureStableNodeIds(root,{createId:()=>`node_unwanted${++n}`});assert.equal(JSON.stringify(root),snapshot);
});

test('renews IDs for a duplicated node and descendants', async () => {
  const { renewStableNodeIds } = await import('../dist/stable-ids.js');
  const clone={formaNodeId:'node_oldroot',components:[{formaNodeId:'node_oldchild'}]};
  let n=0;renewStableNodeIds(clone,{createId:()=>`node_duplicate${++n}`});
  assert.equal(clone.formaNodeId,'node_duplicate1');assert.equal(clone.components[0].formaNodeId,'node_duplicate2');
});

