const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const source=()=>fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
test('new projects do not depend on unsupported native prompts',()=>{const app=source();assert.match(app,/async function createBlankProject\(\)\{/);assert.doesNotMatch(app,/createBlankProject\(\)\{const name=prompt/);assert.doesNotMatch(app,/async\s+async/);});
test('empty projects receive one visible desktop frame initializer',()=>{const app=source();assert.equal((app.match(/function blankCanvasComponents/g)||[]).length,1);assert.equal((app.match(/function ensureUsableCanvas/g)||[]).length,1);assert.match(app,/requestAnimationFrame\(\(\)=>zoomController\.fit\(\)\)/);});
