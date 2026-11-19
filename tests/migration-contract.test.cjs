const test = require('node:test');
const assert = require('node:assert/strict');
const start = require('./test-server.cjs');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

test('synthetic fig fixture imports through the existing importer', async () => {
  const { importFigProject } = await import('../fig-import.mjs');
  const bytes = fs.readFileSync(path.join(__dirname, '../fixtures/synthetic-shape.fig'));
  const project = importFigProject(bytes, 'synthetic-shape.fig');
  assert.equal(project.importSummary.sourceRecords, 4);
  assert.equal(project.importSummary.pages, 1);
  assert.deepEqual(project.importSummary.unsupportedTypes, []);
  assert.deepEqual(project.importSummary.diagnostics, []);
  const shape = project.editor.grapesjs.pages[0].frames[0].component.components[0];
  assert.equal(shape.name, 'Blue rectangle');
  assert.equal(shape.style.width, '120px');
  assert.equal(shape.style.height, '80px');
  assert.equal(shape.style['background-color'], 'rgba(0, 128, 255, 1)');
});

test('migration contract covers local project, version, render and import routes', async t => {
  const server = await start(t);
  const post = (url, value) => server.raw(url, { method: 'POST', body: JSON.stringify(value) });
  const read = async response => ({ status: response.status, value: await response.json() });
  const name = 'contract-fixture';
  const project = { id: name, name, pages: [{ id: 'page', component: { type: 'wrapper', components: [] } }] };
  assert.equal((await read(await server.raw('/api/projects'))).status, 200);
  const created = await read(await post('/api/projects', project));
  assert.equal(created.status, 200);
  assert.equal(created.value.revision, 1);
  assert.equal((await read(await server.raw(`/api/projects/${name}`))).value.id, name);
  assert.equal((await read(await post('/api/projects', project))).status, 409);
  const version = await read(await post(`/api/projects/${name}/versions`, { name: 'Snapshot', project }));
  assert.equal(version.status, 200);
  assert.equal((await read(await server.raw(`/api/projects/${name}/versions`))).value.versions.length, 1);
  assert.equal((await read(await server.raw(`/api/projects/${name}/versions/${version.value.id}`))).status, 200);
  assert.equal((await read(await server.raw(`/api/projects/${name}/versions/${version.value.id}`, { method: 'DELETE' }))).value.deleted, true);
  assert.equal((await read(await server.raw(`/api/projects/${name}/versions/${version.value.id}`))).status, 404);
  assert.equal((await read(await post('/api/render', { format: 'svg', documents: [] }))).status, 400);
  const imported = await server.raw('/api/import/fig', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'invalid fig' });
  assert.equal(imported.status, 400);
  const fixture = fs.readFileSync(path.join(__dirname, '../fixtures/synthetic-shape.fig'));
  const importedFixture = await read(await server.raw('/api/import/fig', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'synthetic-shape.fig' }, body: fixture }));
  assert.equal(importedFixture.status, 200);
  assert.equal(importedFixture.value.importSummary.nodes, 1);
  assert.equal((await read(await server.raw(`/api/projects/${name}`, { method: 'DELETE' }))).value.deleted, true);
  assert.equal((await read(await server.raw(`/api/projects/${name}`))).status, 404);
});

test('migration contract covers workspace session and remaining owner routes', async t => {
  const server = await start(t), user = server.account();
  assert.equal((await user.request('/me')).value.user, null);
  assert.equal((await user.request('/files')).status, 401);
  const registered = await user.request('/auth/register', { name: 'Fixture', email: 'fixture@example.invalid', password: 'Synthetic-password-123' });
  assert.equal(registered.status, 200);
  assert.equal((await user.request('/me')).value.user.id, registered.value.user.id);
  const project = { name: 'Fixture', editor: { grapesjs: { pages: [{ id: 'page', component: { type: 'wrapper', components: [] } }] } } };
  const created = await user.request('/files', { project });
  const route = `/files/${created.value.id}`;
  assert.equal((await user.request('/files')).value.files.length, 1);
  assert.equal((await user.request(route + '/members')).value.members.length, 1);
  assert.equal((await user.request(route + '/presence', { clientId: 'fixture-client', x: 1, y: 2 })).status, 200);
  const version = await user.request(route + '/versions', { name: 'Fixture version' });
  assert.equal((await user.request(route + '/versions')).value.versions.length, 1);
  assert.equal((await user.request(route + '/versions/' + version.value.id, {}, 'DELETE')).status, 200);
  assert.equal((await user.request(route + '/versions/' + version.value.id)).status, 404);
  assert.deepEqual((await user.request('/libraries')).value.libraries, []);
  assert.equal((await user.request(route + '/audit')).status, 200);
  assert.equal((await user.request('/auth/logout', {})).status, 200);
  assert.equal((await user.request('/me')).value.user, null);
});

test('migration contract records SVG rendering, bundle download and failure responses', async t => {
  const server = await start(t);
  const vendor = path.join(server.directory, 'dist', 'vendor');
  await fsp.mkdir(vendor, { recursive: true });
  for (const name of ['inter.css', 'Inter-Variable.ttf']) {
    await fsp.copyFile(path.join(__dirname, '../dist/vendor', name), path.join(vendor, name));
  }
  const post = (url, value) => server.raw(url, { method: 'POST', body: JSON.stringify(value) });
  const render = await post('/api/render', { format: 'svg', documents: [{ name: 'Fixture', width: 50, height: 30, html: '<div>Fixture</div>' }] });
  assert.equal(render.status, 200);
  assert.match(render.headers.get('content-type'), /^image\/svg\+xml/);
  assert.match(await render.text(), /<foreignObject/);
  const invalidBundle = await post('/api/exports', {});
  assert.equal(invalidBundle.status, 500);
  assert.equal((await invalidBundle.json()).error, 'Incomplete project export');
  const project = { pages: [{ id: 'page', component: { type: 'wrapper', components: [] } }] };
  const bundleResponse = await post('/api/exports', { id: 'fixture', name: 'Fixture', project, html: '<div>Fixture</div>', css: '' });
  assert.equal(bundleResponse.status, 200);
  const bundle = await bundleResponse.json();
  assert.equal(bundle.download, '/api/exports/fixture/download');
  const download = await server.raw(bundle.download);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/zip');
  assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  assert.equal((await server.raw('/api/exports/absent/download')).status, 404);
  const missing = await server.raw('/api/projects/missing/assets/asset_00000000000000000000');
  assert.equal(missing.status, 404);
});

test('migration contract captures workspace authentication and access failures', async t => {
  const server = await start(t);
  const owner = server.account(), viewer = server.account();
  const password = 'Synthetic-password-123';
  assert.equal((await owner.request('/auth/register', { email: 'invalid', password })).status, 400);
  assert.equal((await owner.request('/auth/register', { email: 'owner@example.invalid', password })).status, 200);
  assert.equal((await viewer.request('/auth/register', { email: 'viewer@example.invalid', password })).status, 200);
  assert.equal((await owner.request('/auth/register', { email: 'owner@example.invalid', password })).status, 409);
  const project = { name: 'Fixture', editor: { grapesjs: { pages: [{ id: 'page', component: { type: 'wrapper', components: [] } }] } } };
  const route = '/files/' + (await owner.request('/files', { project })).value.id;
  assert.equal((await viewer.request(route)).status, 404);
  assert.equal((await owner.request(route + '/members', { email: 'viewer@example.invalid', role: 'viewer' })).status, 200);
  assert.equal((await viewer.request(route)).status, 200);
  assert.equal((await viewer.request(route + '/members')).status, 200);
  assert.equal((await viewer.request(route + '/audit')).status, 403);
  assert.equal((await viewer.request(route + '/library', { name: 'Denied' })).status, 403);
  assert.equal((await viewer.request(route + '/versions', { name: 'Denied' })).status, 403);
  assert.equal((await viewer.request(route + '/branches', { name: 'Denied' })).status, 403);
  assert.equal((await viewer.request(route + '/presence', { clientId: 'bad' })).status, 400);
  assert.equal((await owner.request(route + '/ops', { operationId: 'invalid' })).status, 400);
  assert.equal((await owner.request(route + '/comments', { text: '' })).status, 400);
  assert.equal((await owner.request(route + '/members', { email: 'viewer@example.invalid', role: 'owner' })).status, 400);
});
