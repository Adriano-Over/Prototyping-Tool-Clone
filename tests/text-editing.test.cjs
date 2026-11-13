const test = require('node:test');
const assert = require('node:assert/strict');

function mountedTextElement(editor, { connected = false } = {}) {
  const selectedRanges = [];
  const selection = {
    removeAllRanges() { selectedRanges.length = 0; },
    addRange(range) { selectedRanges.push(range); },
  };
  const document = {
    defaultView: {
      MouseEvent: class MouseEvent {
        constructor(type, init) { this.type = type; Object.assign(this, init); }
      },
      getSelection: () => selection,
    },
    createRange() {
      return {
        selectNodeContents(target) { this.target = target; },
        collapse(toStart) { this.collapsedToStart = toStart; },
      };
    },
  };
  const element = {
    isConnected: connected,
    ownerDocument: document,
    isContentEditable: true,
    focusCalled: false,
    dispatchEvent(event) {
      assert.equal(event.type, 'dblclick');
      editor.editing = editor.component;
    },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 24, height: 34 }),
    focus() { this.focusCalled = true; },
  };
  return { element, selectedRanges };
}

test('text insertion waits for its mounted view, starts editing, and focuses the text layer', async () => {
  const { beginTextEditing } = await import('../dist/text-editing.js');
  const editor = { editing: null, getEditing() { return this.editing; } };
  const { element, selectedRanges } = mountedTextElement(editor);
  const component = { view: { get el() { return element; } } };
  editor.component = component;
  let frames = 0;
  const started = await beginTextEditing({
    component,
    editor,
    requestFrame: callback => setImmediate(() => {
      frames += 1;
      if (frames === 2) element.isConnected = true;
      callback();
    }),
  });

  assert.equal(started, true);
  assert.equal(frames, 3);
  assert.equal(element.focusCalled, true);
  assert.equal(selectedRanges.length, 1);
  assert.equal(selectedRanges[0].target, element);
  assert.equal(selectedRanges[0].collapsedToStart, false);
});

test('text insertion requests GrapesJS text-view focus before the synthetic double-click fallback', async () => {
  const { beginTextEditing } = await import('../dist/text-editing.js');
  const editor = { editing: null, getEditing() { return this.editing; } };
  const { element, selectedRanges } = mountedTextElement(editor, { connected: true });
  const component = {
    view: { get el() { return element; } },
    trigger(eventName) {
      assert.equal(eventName, 'focus');
      editor.editing = this;
    },
  };

  const started = await beginTextEditing({
    component,
    editor,
    requestFrame: callback => setImmediate(callback),
  });

  assert.equal(started, true);
  assert.equal(element.focusCalled, true);
  assert.equal(selectedRanges.length, 1);
  assert.equal(selectedRanges[0].target, element);
});

test('text insertion reports failure instead of leaving focus in another inspector control', async () => {
  const { beginTextEditing } = await import('../dist/text-editing.js');
  const editor = { getEditing: () => null };
  const { element } = mountedTextElement(editor, { connected: false });
  const component = { view: { el: element } };
  let failures = 0;
  let frames = 0;
  const started = await beginTextEditing({
    component,
    editor,
    maxFrames: 3,
    requestFrame: callback => setImmediate(() => { frames += 1; callback(); }),
    onFailure: () => { failures += 1; },
  });

  assert.equal(started, false);
  assert.equal(frames, 3);
  assert.equal(failures, 1);
  assert.equal(element.focusCalled, false);
});
