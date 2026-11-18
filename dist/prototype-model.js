export function normalizeInteractions(value) {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return items.filter(item => item && typeof item === 'object').map((item, index) => {
    const actions = Array.isArray(item.actions) ? item.actions : item.action ? [Object.fromEntries(['action','target','variable','value'].filter(key => item[key] !== undefined).map(key => [key, item[key]]))] : [];
    return { ...(actions[0] || {}), ...item, id: item.id || `interaction-${index + 1}`, trigger: item.trigger || 'click', actions: actions.map(action => ({ ...action })) };
  });
}

export function writeInteractions(prototype, nodeId, interactions) {
  if (!nodeId) return prototype;
  const next = { ...prototype };
  const normalized = normalizeInteractions(interactions);
  if (normalized.length) next[nodeId] = normalized;
  else delete next[nodeId];
  return next;
}
