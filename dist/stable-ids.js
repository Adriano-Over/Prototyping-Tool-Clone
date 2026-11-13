const VALID_ID = /^node_[A-Za-z0-9-]{8,}$/;

export function createFormaNodeId() {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `node_${uuid}`;
}

const childrenOf = node => {
  const collection = typeof node?.components === 'function' ? node.components() : null;
  if (collection?.models) return collection.models;
  return Array.isArray(node?.components) ? node.components : [];
};
const readId = node => node?.get ? node.get('formaNodeId') : node?.formaNodeId;
const writeId = (node, id) => node?.set ? node.set('formaNodeId', id, { silent: true }) : (node.formaNodeId = id);

export function walkFormaNodes(root, visit) {
  if (!root) return;
  visit(root);
  childrenOf(root).forEach(child => walkFormaNodes(child, visit));
}

export function ensureStableNodeIds(roots, { createId = createFormaNodeId, onRepair } = {}) {
  const list = Array.isArray(roots) ? roots : [roots];
  const seen = new Set();
  let assigned = 0, repaired = 0;
  list.forEach(root => walkFormaNodes(root, node => {
    const current = readId(node);
    if (VALID_ID.test(current || '') && !seen.has(current)) { seen.add(current); return; }
    let next;
    do { next = createId(); } while (!VALID_ID.test(next) || seen.has(next));
    writeId(node, next);
    seen.add(next);
    if (current) { repaired++; onRepair?.({ previous: current, next }); }
    else assigned++;
  }));
  return { assigned, repaired, total: seen.size };
}

export function renewStableNodeIds(root, { createId = createFormaNodeId } = {}) {
  let count = 0;
  walkFormaNodes(root, node => { writeId(node, createId()); count++; });
  return count;
}

export function getFormaNodeId(node) { return readId(node) || ''; }
