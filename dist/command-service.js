const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export function createCommandService({ onChange, onError, history } = {}) {
  const undoStack = [];
  const redoStack = [];
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener({ canUndo: !!undoStack.length, canRedo: !!redoStack.length }));

  function execute(command) {
    if (!command?.id || typeof command.apply !== 'function' || typeof command.revert !== 'function') throw new Error('Invalid Forma command');
    try {
      if(history){const result=command.apply();history.schedule();onChange?.(command.id);return result;}
      const result = command.apply();
      undoStack.push({ command, result });
      redoStack.length = 0;
      onChange?.(command.id);
      notify();
      return result;
    } catch (error) { onError?.(error, command.id); throw error; }
  }

  function undo() {
    if(history)return history.undo();
    const entry = undoStack.pop(); if (!entry) return false;
    entry.command.revert(entry.result); redoStack.push(entry); onChange?.(`undo:${entry.command.id}`); notify(); return true;
  }
  function redo() {
    if(history)return history.redo();
    const entry = redoStack.pop(); if (!entry) return false;
    entry.result = entry.command.apply(); undoStack.push(entry); onChange?.(`redo:${entry.command.id}`); notify(); return true;
  }
  function reset() { if(history)history.reset();undoStack.length=0;redoStack.length=0;notify(); }
  return { execute, undo, redo, reset, canUndo:()=>history?history.canUndo():!!undoStack.length, canRedo:()=>history?history.canRedo():!!redoStack.length, subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);} };
}

export function setProjectSectionCommand(projectState, section, nextValue, id = `set-${section}`) {
  const getter = `get${section[0].toUpperCase()}${section.slice(1)}`;
  const setter = `set${section[0].toUpperCase()}${section.slice(1)}`;
  if (typeof projectState?.[getter] !== 'function' || typeof projectState?.[setter] !== 'function') throw new Error(`Unknown project section ${section}`);
  const next = copy(nextValue);
  return {
    id,
    apply() { const previous=projectState[getter]();projectState[setter](next);return previous; },
    revert(previous) { projectState[setter](previous); },
  };
}

