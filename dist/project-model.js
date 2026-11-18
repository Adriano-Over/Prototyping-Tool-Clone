export const FORMA_PROJECT_FORMAT = 'forma-project';
export const FORMA_SCHEMA_VERSION = 3;

export const DEFAULT_VARIABLES = Object.freeze({
  mode: 'light',
  modes: {
    light: {'color.primary':'#188466','color.canvas':'#f0f1f0','color.surface':'#ffffff','color.text':'#202625','spacing.md':'16px','radius.md':'8px'},
    dark: {'color.primary':'#42b99a','color.canvas':'#151918','color.surface':'#222826','color.text':'#f1f5f3','spacing.md':'16px','radius.md':'8px'},
  },
});

import { normalizeInteractions } from './prototype-model.js';

const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const nowIso = now => typeof now === 'string' ? now : (now instanceof Date ? now : new Date()).toISOString();

export function emptyFormaState() {
  return {
    components: [],
    textStyles: [],
    variables: copy(DEFAULT_VARIABLES),
    comments: {},
    prototype: {},
    layoutMetadata: {},
    scene: null,
    importSources: [],
  };
}

function normalizeForma(value = {}) {
  const defaults = emptyFormaState();
  return {
    components: Array.isArray(value.components) ? copy(value.components) : defaults.components,
    textStyles: Array.isArray(value.textStyles) ? copy(value.textStyles) : defaults.textStyles,
    variables: value.variables && typeof value.variables === 'object' ? copy(value.variables) : defaults.variables,
    comments: value.comments && typeof value.comments === 'object' ? copy(value.comments) : defaults.comments,
    prototype: value.prototype && typeof value.prototype === 'object' ? Object.fromEntries(Object.entries(copy(value.prototype)).map(([id, interactions]) => [id, normalizeInteractions(interactions)])) : defaults.prototype,
    layoutMetadata: value.layoutMetadata && typeof value.layoutMetadata === 'object' ? copy(value.layoutMetadata) : defaults.layoutMetadata,
    scene: value.scene && typeof value.scene === 'object' && !Array.isArray(value.scene) ? copy(value.scene) : defaults.scene,
    importSources: Array.isArray(value.importSources) ? copy(value.importSources) : defaults.importSources,
  };
}

function legacyEditorData(value) {
  if (Array.isArray(value?.editor?.grapesjs?.pages)) return value.editor.grapesjs;
  if (Array.isArray(value?.data?.pages)) return value.data;
  if (Array.isArray(value?.pages)) return value;
  return null;
}

export function migrateProject(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('Project data is missing');
  if (input.format === FORMA_PROJECT_FORMAT && Number(input.schemaVersion) > FORMA_SCHEMA_VERSION) {
    throw new Error(`This project uses unsupported schema version ${input.schemaVersion}`);
  }
  const grapesjs = legacyEditorData(input);
  if (!grapesjs) throw new Error('Project does not contain GrapesJS pages');
  const timestamp = nowIso(options.now);
  const updatedAt = input.updatedAt || timestamp;
  const createdAt = input.createdAt || input.updatedAt || timestamp;
  return {
    format: FORMA_PROJECT_FORMAT,
    schemaVersion: FORMA_SCHEMA_VERSION,
    id: String(input.id || options.id || ''),
    name: String(input.name || options.name || 'Untitled project').slice(0, 120),
    createdAt,
    updatedAt,
    revision: Number.isInteger(input.revision) ? input.revision : 0,
    editor: { grapesjs: copy(grapesjs) },
    forma: normalizeForma(input.forma),
    assets: Array.isArray(input.assets) ? copy(input.assets) : [],
  };
}

export function createFormaProject({ id = '', name = 'Untitled project', createdAt, editor, forma, assets = [], now } = {}) {
  return migrateProject({
    format: FORMA_PROJECT_FORMAT,
    schemaVersion: FORMA_SCHEMA_VERSION,
    id,
    name,
    createdAt,
    updatedAt: nowIso(now),
    editor: { grapesjs: editor },
    forma,
    assets,
  }, { now });
}

export function isFormaProject(value) {
  return value?.format === FORMA_PROJECT_FORMAT && value?.schemaVersion === FORMA_SCHEMA_VERSION && Array.isArray(value?.editor?.grapesjs?.pages);
}

