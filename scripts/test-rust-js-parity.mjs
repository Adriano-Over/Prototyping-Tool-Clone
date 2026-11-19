import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateProject } from '../dist/project-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'fixtures', 'projects', 'forma-real-flex.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const cargoPath = process.env.CARGO
  || (process.platform === 'win32' && existsSync(path.join(os.homedir(), '.cargo', 'bin', 'cargo.exe'))
    ? path.join(os.homedir(), '.cargo', 'bin', 'cargo.exe')
    : 'cargo');
const probe = spawnSync(cargoPath, [
  'run', '--quiet', '--offline', '--locked',
  '--manifest-path', path.join(root, 'rust', 'Cargo.toml'),
  '-p', 'forma-core', '--example', 'legacy-parity-probe', '--', fixturePath,
], { cwd: root, encoding: 'utf8' });

if (probe.error) throw probe.error;
assert.equal(probe.status, 0, probe.stderr || `Rust parity probe exited ${probe.status}`);

const rustResult = JSON.parse(probe.stdout);
const jsResult = migrateProject(fixture, { now: '2026-11-19T00:00:00.000Z' });
assert.deepEqual(
  rustResult.editor,
  jsResult.editor.grapesjs,
  'Rust and JavaScript must retain the same normalized legacy editor data',
);

const dropdown = rustResult.pages[0].nodes['legacy-0-0'];
assert.deepEqual(
  [dropdown.transform.e, dropdown.transform.f, dropdown.size.width, dropdown.size.height],
  [12, 72, 48, 32],
  'Rust conversion must preserve the real-derived flex dropdown geometry',
);

console.log('Rust/JavaScript parity passed for retained Forma editor data and flex fixture geometry.');
