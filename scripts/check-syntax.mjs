import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'desktop']);
const extensions = new Set(['.js', '.mjs', '.cjs']);
const files = [];

async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name) || path.relative(root, path.join(directory, entry.name)).replaceAll('\\', '/') === 'dist/vendor') continue;
      await collect(path.join(directory, entry.name));
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
}

await collect(root);
let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`${path.relative(root, file)}\n${result.stderr || result.stdout}`);
  }
}

if (failed) process.exitCode = 1;
else console.log(`Syntax check passed for ${files.length} project and test files.`);
