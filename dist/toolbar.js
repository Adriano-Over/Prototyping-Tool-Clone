const groups = [
  ['move', 'Move', [
    ['select', 'Move', 'mouse-pointer-2', 'V'], ['pan', 'Hand', 'hand', 'H'], ['scale', 'Scale', 'move', 'K'],
  ]],
  ['region', 'Region', [
    ['frame', 'Frame', 'frame', 'F'], ['section', 'Section', 'section', 'Shift+S'], ['slice', 'Slice', 'slice', 'S'],
    ['frame-preset:1440x900', 'Desktop · 1440 × 900', 'frame'], ['frame-preset:390x844', 'Phone · 390 × 844', 'frame'],
    ['frame-preset:768x1024', 'Tablet · 768 × 1024', 'frame'],
  ]],
  ['shape', 'Shape', [
    ['rectangle', 'Rectangle', 'square', 'R'], ['line', 'Line', 'line', 'L'], ['arrow', 'Arrow', 'arrow-right', 'Shift+L'],
    ['ellipse', 'Ellipse', 'circle', 'O'], ['polygon', 'Polygon', 'hexagon'], ['star', 'Star', 'star'],
    ['image', 'Image / video…', 'media', 'Ctrl+Shift+K'],
  ]],
  ['path', 'Path', [
    ['pen', 'Pen', 'nib', 'P'], ['pencil', 'Pencil', 'pencil', 'Shift+P'],
  ]],
  ['text', 'Text', [
    ['text', 'Text', 'type', 'T'], ['text-on-path', 'Text on path', 'text-path'],
    ['insert-input', 'Email input field', 'input-field'],
  ]],
];

const workspaceModes = [
  ['design', 'Design', 'frame'], ['draw', 'Draw', 'draw-mode'],
  ['motion', 'Motion', 'diamond'], ['dev', 'Dev Mode', 'code'],
];

export function createToolbar(dock, {icon, selectTool, runAction, selectMode, showActions}) {
  const doc = dock.ownerDocument;
  const win = doc.defaultView;
  let openMenu;
  let focusControl;
  const groupsToSync = [];

  function button(label, glyph, className) {
    const control = doc.createElement('button');
    control.type = 'button';
    control.className = className;
    control.setAttribute('aria-label', label);
    control.innerHTML = icon(glyph);
    return control;
  }

  function registerControl(control) {
    control.dataset.toolbarControl = '';
    control.tabIndex = focusControl ? -1 : 0;
    focusControl ||= control;
  }

  function closeMenus({restoreFocus = false} = {}) {
    if(!openMenu)return;
    const {popup, trigger} = openMenu;
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    openMenu = undefined;
    if(restoreFocus)trigger.focus();
  }

  function makeMenu(group, trigger, id, label) {
    const popup = doc.createElement('div');
    popup.id = `toolbar-${id}-menu`;
    popup.className = 'tool-menu';
    popup.setAttribute('role', 'menu');
    popup.setAttribute('aria-label', label);
    popup.hidden = true;
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', popup.id);
    group.append(popup);
    const items = () => [...popup.querySelectorAll('button')];

    function show(preferLast = false) {
      if(openMenu?.popup===popup){closeMenus();return;}
      closeMenus();
      popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      popup.style.removeProperty('--menu-offset');
      const dockBox = dock.getBoundingClientRect();
      popup.style.maxWidth = `${Math.min(dockBox.width,win.innerWidth-24)}px`;
      const menuBox = popup.getBoundingClientRect();
      const left = Math.max(12,dockBox.left);
      const right = Math.min(win.innerWidth-12,dockBox.right);
      const delta = Math.max(left-menuBox.left, Math.min(0,right-menuBox.right));
      popup.style.setProperty('--menu-offset', `${delta}px`);
      openMenu = {popup, trigger};
      const buttons = items();
      const checked = buttons.find(item=>item.getAttribute('aria-checked')==='true');
      (preferLast ? buttons.at(-1) : checked || buttons[0])?.focus();
    }

    trigger.addEventListener('click',()=>show());
    trigger.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp'].includes(event.key))return;
      event.preventDefault();
      event.stopPropagation();
      show(event.key==='ArrowUp');
    });
    popup.addEventListener('keydown',event=>{
      if(event.key==='Tab'){closeMenus({restoreFocus:true});return;}
      if(event.key==='Escape'){
        event.preventDefault();
        event.stopPropagation();
        closeMenus({restoreFocus:true});
        return;
      }
      const buttons=items(), index=buttons.indexOf(doc.activeElement);
      const next={ArrowDown:(index+1)%buttons.length,ArrowUp:(index+buttons.length-1)%buttons.length,Home:0,End:buttons.length-1}[event.key];
      if(next===undefined)return;
      event.preventDefault();
      event.stopPropagation();
      buttons[next]?.focus();
    });
    return popup;
  }

  function addOption(menu, choice, persistent, activate) {
    const [id,label,glyph,shortcut] = choice;
    const item = button(label, glyph, 'tool-menu-option');
    item.dataset.toolChoice = id;
    item.setAttribute('role', persistent ? 'menuitemradio' : 'menuitem');
    if(persistent)item.setAttribute('aria-checked','false');
    item.tabIndex = -1;
    const name = doc.createElement('span');
    name.textContent = label;
    item.append(name);
    if(shortcut){
      const key = doc.createElement('kbd');
      key.textContent = shortcut;
      item.setAttribute('aria-keyshortcuts',shortcut.replace('Ctrl','Control'));
      item.append(key);
    }
    item.addEventListener('click',()=>{
      closeMenus({restoreFocus:true});
      activate();
    });
    menu.append(item);
    return item;
  }

  const strip = doc.createElement('div');
  strip.className = 'tool-strip';
  const primary = doc.createElement('div');
  primary.className = 'tool-strip-primary';
  primary.setAttribute('role','group');
  primary.setAttribute('aria-label','Canvas tools');
  strip.append(primary);
  for(const [id,label,choices] of groups){
    const group = doc.createElement('div');
    group.className = 'tool-group';
    const main = button(label, choices[0][2], 'tool-group-main');
    const more = button(`More ${label.toLowerCase()} tools`,'chevron-down','tool-group-menu');
    registerControl(main);
    registerControl(more);
    group.append(main,more);
    const menu = makeMenu(group,more,id,`${label} tools`);
    const state = {main,choices,current:choices[0],items:new Map()};
    for(const choice of choices){
      const tool = choice[0];
      const persistent = !tool.startsWith('frame-preset:') && tool !== 'insert-input';
      const option = addOption(menu,choice,persistent,()=>persistent ? selectTool(tool) : runAction(tool,choice[1]));
      if(persistent)state.items.set(tool,option);
    }
    main.addEventListener('click',()=>{closeMenus();selectTool(state.current[0]);});
    groupsToSync.push(state);
    primary.append(group);
  }

  const utilities = doc.createElement('div');
  utilities.className = 'tool-strip-utilities';
  utilities.setAttribute('role','group');
  utilities.setAttribute('aria-label','Comments and actions');
  const comment = button('Comment','message-circle','tool-group-main');
  comment.addEventListener('click',()=>selectTool('comment'));
  const actions = button('Actions and resources','shapes','tool-group-main');
  actions.addEventListener('click',()=>{closeMenus();showActions();});
  registerControl(comment);
  registerControl(actions);
  utilities.append(comment,actions);
  strip.append(utilities);

  const modes = doc.createElement('div');
  modes.className = 'tool-mode';
  const modeTrigger = button('Workspace mode','frame','tool-mode-trigger');
  registerControl(modeTrigger);
  modes.append(modeTrigger);
  const modeMenu = makeMenu(modes,modeTrigger,'workspace','Workspace mode');
  const modeOptions = new Map(workspaceModes.map(mode=>[mode[0],addOption(modeMenu,mode,true,()=>selectMode(mode[0]))]));
  const modeLabel = doc.createElement('span');
  modeLabel.className = 'tool-mode-label';
  const modeIcon = doc.createElement('span');
  modeIcon.className = 'tool-mode-icon';
  const modeChevron = doc.createElement('span');
  modeChevron.className = 'tool-mode-chevron';
  modeChevron.innerHTML = icon('chevron-down',12);
  modeTrigger.replaceChildren(modeIcon,modeLabel,modeChevron);
  dock.replaceChildren(strip,modes);

  dock.addEventListener('focusin',event=>{
    if(!event.target.matches('[data-toolbar-control]'))return;
    focusControl.tabIndex=-1;
    focusControl=event.target;
    focusControl.tabIndex=0;
  });
  dock.addEventListener('keydown',event=>{
    if(!event.target.matches('[data-toolbar-control]'))return;
    const controls=[...dock.querySelectorAll('[data-toolbar-control]')];
    const index=controls.indexOf(event.target);
    const next={ArrowRight:(index+1)%controls.length,ArrowLeft:(index+controls.length-1)%controls.length,Home:0,End:controls.length-1}[event.key];
    if(next===undefined)return;
    event.preventDefault();
    event.stopPropagation();
    closeMenus();
    controls[next]?.focus();
  });
  doc.addEventListener('pointerdown',event=>{if(!dock.contains(event.target))closeMenus();});
  win.addEventListener('resize',()=>closeMenus());

  let renderedMode;
  return {
    closeMenus,
    sync({current,persistent,mode}){
      for(const state of groupsToSync){
        const recent = state.choices.find(([tool])=>tool===persistent);
        if(recent)state.current=recent;
        const chosen = state.choices.find(([tool])=>tool===current) || state.current;
        const [id,label,glyph,shortcut] = chosen;
        if(state.main.dataset.toolId!==id){
          state.main.dataset.toolId=id;
          state.main.innerHTML=icon(glyph);
          state.main.setAttribute('aria-label',label);
          state.main.title=shortcut ? `${label} (${shortcut})` : label;
        }
        state.main.setAttribute('aria-pressed',String(state.items.has(current)));
        for(const [tool,item] of state.items)item.setAttribute('aria-checked',String(tool===id));
      }
      comment.setAttribute('aria-pressed',String(current==='comment'));
      if(renderedMode===mode)return;
      renderedMode=mode;
      const [,label,glyph]=workspaceModes.find(choice=>choice[0]===mode)||workspaceModes[0];
      modeIcon.innerHTML=icon(glyph);
      modeLabel.textContent=label;
      modeTrigger.setAttribute('aria-label',`Workspace mode: ${label}`);
      modeTrigger.title=`Workspace mode: ${label}`;
      for(const [id,item] of modeOptions)item.setAttribute('aria-checked',String(id===mode));
    },
  };
}
