import { createFormaProject, emptyFormaState, migrateProject } from './project-model.js';

const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const LEGACY_KEYS = {
  components: 'forma-components-v1',
  variables: 'forma-tokens-v1',
  comments: 'forma-comments-v1',
  prototype: 'forma-prototypes-v1',
};

export function createProjectState({ getEditor, getId, getName, onChange } = {}) {
  let createdAt = new Date().toISOString();
  let forma = emptyFormaState();
  let assets = [];
  const listeners = new Set();

  const notify = (section, persistent = false) => {
    const detail = { section, persistent, projectId: getId?.() || '' };
    listeners.forEach(listener => listener(detail));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('forma:project-state-change', { detail }));
    if (persistent) onChange?.(detail);
  };

  function load(project) {
    const normalized = migrateProject(project, { id: getId?.(), name: getName?.() });
    createdAt = normalized.createdAt;
    forma = copy(normalized.forma);
    assets = copy(normalized.assets);
    notify('project', false);
    return normalized;
  }

  function reset() {
    createdAt = new Date().toISOString();
    forma = emptyFormaState();
    assets = [];
    notify('project', false);
  }

  function serialize() {
    return createFormaProject({
      id: getId?.() || '',
      name: getName?.() || 'Untitled project',
      createdAt,
      editor: getEditor?.()?.getProjectData?.(),
      forma,
      assets,
    });
  }

  function getSection(section) { return copy(forma[section]); }
  function setSection(section, value, options = {}) {
    if (!(section in forma)) throw new Error(`Unknown Forma project section: ${section}`);
    forma[section] = copy(value);
    notify(section, options.persistent !== false);
    return getSection(section);
  }

  function importLegacyWorkbench(storage = globalThis.localStorage) {
    if (!storage) return false;
    const projectId = getId?.() || 'draft';
    const marker = `forma-workbench-migrated-v2:${projectId}`;
    if (storage.getItem(marker)) return false;
    let changed = false;
    for (const [section, key] of Object.entries(LEGACY_KEYS)) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw);
        const current = forma[section];
        const empty = Array.isArray(current) ? !current.length : !Object.keys(current || {}).length;
        if (empty && value && (Array.isArray(value) ? value.length : Object.keys(value).length)) {
          forma[section] = value;
          changed = true;
        }
        storage.removeItem(key);
      } catch {}
    }
    storage.setItem(marker, '1');
    if (changed) notify('legacy-workbench-migration', true);
    return changed;
  }

  return {
    load, reset, serialize,
    getComponents: () => getSection('components'),
    setComponents: value => setSection('components', value),
    getTextStyles: () => getSection('textStyles'),
    setTextStyles: value => setSection('textStyles', value),
    getVariables: () => getSection('variables'),
    setVariables: value => setSection('variables', value),
    getComments: () => getSection('comments'),
    setComments: value => setSection('comments', value),
    getPrototype: () => getSection('prototype'),
    setPrototype: value => setSection('prototype', value),
    getLayoutMetadata: () => getSection('layoutMetadata'),
    setLayoutMetadata: value => setSection('layoutMetadata', value),
    getScene: () => getSection('scene'),
    setScene: value => setSection('scene', value),
    getImportSources: () => getSection('importSources'),
    setImportSources: value => setSection('importSources', value),
    getAssets: () => copy(assets),
    setAssets: value => { assets = copy(value || []); notify('assets', true); },
    exportData: () => copy(forma),
    importLegacyWorkbench,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

