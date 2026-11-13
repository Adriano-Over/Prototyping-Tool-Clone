export function createToolState({onChange}={}) {
  let persistent='select',temporary='',interaction=null,mode='design';
  const current=()=>temporary||persistent;
  const emit=()=>onChange?.({persistent,temporary,current:current(),interaction});
  return {
    current,
    setPersistent(tool){persistent=tool||'select';emit();return current();},
    beginTemporary(tool){temporary=tool||'';emit();return current();},
    endTemporary(tool){if(!tool||temporary===tool)temporary='';emit();return current();},
    beginInteraction(value){interaction=value;emit();},
    endInteraction(){const value=interaction;interaction=null;emit();return value;},
    resetInteraction(){interaction=null;temporary='';emit();},
    setMode(value){mode=['draw','design','motion','dev'].includes(value)?value:'design';emit();return mode;},
    mode(){return mode;},
    snapshot(){return {persistent,temporary,current:current(),interaction,mode};},
  };
}

export function toolForShortcut(key, shiftKey = false) {
  const value = String(key || '').toLowerCase();
  if (value === 'l') return shiftKey ? 'arrow' : 'line';
  if (value === 'p') return shiftKey ? 'pencil' : 'pen';
  if (value === 's') return shiftKey ? 'section' : 'slice';
  return ({v:'select',h:'pan',k:'scale',f:'frame',r:'rectangle',o:'ellipse',t:'text'})[value] || '';
}
