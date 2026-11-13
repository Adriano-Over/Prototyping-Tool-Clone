const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..','dist');

test('desktop workflows use the in-app dialog service instead of unsupported browser dialogs',()=>{
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const workbench=fs.readFileSync(path.join(root,'workbench.js'),'utf8');
  assert.match(app,/createDialogService/);
  assert.doesNotMatch(app,/(^|[^.\w])prompt\s*\(/m);
  assert.doesNotMatch(app,/(^|[^.\w])confirm\s*\(/m);
  assert.doesNotMatch(workbench,/(^|[^.\w])prompt\s*\(/m);
});

test('project store keeps the current-project serializer available to saves',()=>{
  const store=fs.readFileSync(path.join(root,'project-store.js'),'utf8');
  assert.doesNotMatch(store,/async function getProject\s*\(/);
  assert.match(store,/getProject:\s*openProject/);
});
