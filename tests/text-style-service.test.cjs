const test = require('node:test');
const assert = require('node:assert/strict');

const text = (style = {}) => {
  const state = { 'font-family': 'Inter', 'font-size': '16px', 'font-weight': '400', color: '#202625', ...style };
  return { get: key => key === 'type' ? 'text' : undefined, getStyle: () => ({ ...state }), addStyle: value => Object.assign(state, value), setStyle: value => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, value); }, state };
};

test('named text styles capture typography, apply to another layer, and reject duplicate names', async () => {
  const { createTextStyleService } = await import('../dist/text-style-service.js');
  let styles = [];
  const state = { getTextStyles: () => structuredClone(styles), setTextStyles: value => { styles = structuredClone(value); } };
  const heading = text({ 'font-family': 'Outfit', 'font-size': '48px', 'font-weight': '700', 'letter-spacing': '-1px', 'text-transform': 'uppercase', 'line-height': '1.1' });
  const body = text({ 'font-size': '14px', color: '#777777', 'text-decoration': 'underline', left: '12px' });
  const service = createTextStyleService({ projectState: state, getSelected: () => heading, makeId: () => 'style-heading' });
  const saved = service.save('Hero heading');
  assert.equal(saved.style['font-family'], 'Outfit');
  assert.equal(saved.style['letter-spacing'], '-1px');
  assert.equal(saved.style['text-transform'], 'uppercase');
  const before = service.apply(saved.id, body).before;
  assert.equal(body.state['font-size'], '48px');
  assert.equal(body.state['font-weight'], '700');
  assert.equal(body.state.color, '#202625');
  assert.equal(body.state['text-decoration'], undefined);
  assert.equal(body.state.left, '12px');
  body.setStyle(before);
  assert.equal(body.state['font-size'], '14px');
  assert.throws(() => service.save('hero HEADING'), /already exists/);
  assert.throws(() => service.apply('missing', body), /no longer exists/);
  service.remove(saved.id);
  assert.deepEqual(service.list(), []);
});

test('text styles only accept text layers and preserve project round trips', async () => {
  const { createTextStyleService } = await import('../dist/text-style-service.js');
  const { createProjectState } = await import('../dist/project-state.js');
  const serviceState = { styles: [], getTextStyles() { return this.styles; }, setTextStyles(value) { this.styles = structuredClone(value); } };
  const service = createTextStyleService({ projectState: serviceState, makeId: () => 'body' });
  assert.throws(() => service.save('Body', { get: () => 'default' }), /text layer/);
  service.save('Body', text({ 'line-height': '1.5', 'text-align': 'center' }));
  const project = createProjectState({ getEditor: () => ({ getProjectData: () => ({ pages: [{}] }) }), getId: () => 'tutorial', getName: () => 'Tutorial' });
  project.setTextStyles(serviceState.styles);
  const saved = project.serialize();
  const reopened = createProjectState({ getEditor: () => ({ getProjectData: () => ({ pages: [{}] }) }), getId: () => 'tutorial', getName: () => 'Tutorial' });
  reopened.load(saved);
  assert.deepEqual(reopened.getTextStyles(), serviceState.styles);
});
