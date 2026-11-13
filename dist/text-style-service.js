const TEXT_PROPERTIES = Object.freeze([
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-transform', 'text-align', 'text-decoration', 'color',
]);

const copy = value => JSON.parse(JSON.stringify(value));

export function captureTextStyle(component) {
  if (component?.get?.('type') !== 'text') throw new Error('Select a text layer to save a text style.');
  const current = component.getStyle?.() || {};
  const style = Object.fromEntries(TEXT_PROPERTIES
    .filter(property => current[property] !== undefined && current[property] !== '')
    .map(property => [property, String(current[property])]));
  if (!Object.keys(style).length) throw new Error('The selected text layer has no typography settings to save.');
  return style;
}

export function applyTextStyle(component, style) {
  if (component?.get?.('type') !== 'text') throw new Error('Select a text layer to apply a text style.');
  if (!style || typeof style !== 'object') throw new Error('The text style is invalid.');
  const before = { ...(component.getStyle?.() || {}) };
  const next = { ...before };
  TEXT_PROPERTIES.forEach(property => delete next[property]);
  component.setStyle({ ...next, ...copy(style) });
  return before;
}

export function createTextStyleService({ projectState, getSelected, makeId = () => globalThis.crypto.randomUUID() } = {}) {
  const list = () => projectState?.getTextStyles?.() || [];
  function create(name, component = getSelected?.()) {
    const label = String(name || '').trim().slice(0, 80);
    if (!label) throw new Error('Enter a name for the text style.');
    if (list().some(item => item.name.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new Error(`A text style named “${label}” already exists.`);
    }
    const item = { id: makeId(), name: label, style: captureTextStyle(component) };
    return copy(item);
  }
  function save(name, component = getSelected?.()) {
    const item = create(name, component);
    projectState.setTextStyles([...list(), item]);
    return item;
  }
  function apply(id, component = getSelected?.()) {
    if (component?.get?.('type') !== 'text') throw new Error('Select a text layer to apply a text style.');
    const item = list().find(style => style.id === id);
    if (!item) throw new Error('That text style no longer exists.');
    const before = applyTextStyle(component, item.style);
    return { before, applied: copy(item.style) };
  }
  function remove(id) {
    const previous = list();
    if (!previous.some(item => item.id === id)) throw new Error('That text style no longer exists.');
    projectState.setTextStyles(previous.filter(item => item.id !== id));
    return previous;
  }
  return { list, create, save, apply, remove };
}

export { TEXT_PROPERTIES };
