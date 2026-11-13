const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('release dist copy contains exactly the tested source files and hashes', async t => {
  const { copyAndVerifyDist, collectHashes, compareHashes } = await import('../release.mjs');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'forma-release-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const source=path.join(temp,'source'),target=path.join(temp,'release');await fs.mkdir(source);await fs.writeFile(path.join(source,'app.js'),'current');await fs.writeFile(path.join(source,'zoom-controller.js'),'tested');
  const hashes=await copyAndVerifyDist(source,target);assert.deepEqual(hashes,await collectHashes(target));
  await fs.writeFile(path.join(target,'app.js'),'stale');assert.equal(compareHashes(hashes,await collectHashes(target)).matches,false);
});

