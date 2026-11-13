import { imageFitFromInspector, imageFitToInspector, imagePositionStyle } from './image-fit-model.js';

const resolver = window.FormaStyleResolver;

const protectedCss = '*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f0f1f0;background-image:radial-gradient(#cdd4ce .65px,transparent .65px);background-size:14px 14px}body{font-family:Inter,Arial,sans-serif}a{color:inherit}';
const byId = id => document.getElementById(id);
const px = value => { const number = parseFloat(value); return Number.isFinite(number) ? number : 0; };

function editorInstance() { return window.grapesjs?.editors?.[0]; }
function currentSelection(editor) { return editor?.getSelected() || editor?.getWrapper(); }
function styleFor(component) {
  const style = { ...(component?.getStyle?.() || {}) };
  const element = component?.view?.el;
  try {
    const computed = element?.ownerDocument?.defaultView?.getComputedStyle(element);
    if (computed) for (const property of ['background-color','background-image','box-shadow','text-shadow','backdrop-filter','-webkit-backdrop-filter','filter','opacity','border-color','border-width','border-style','stroke','stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin']) {
      if (!style[property]) style[property] = computed.getPropertyValue(property);
    }
  } catch {}
  return style;
}
function writeStyle(editor, change) {
  const component = currentSelection(editor);
  if (!component || component.get?.('locked')) return;
  component.addStyle(change);
}
function colorHex(value, fallback = '#ffffff') {
  if (/^#[\da-f]{6}$/i.test(value || '')) return value;
  if (/^#[\da-f]{3}$/i.test(value || '')) return '#' + value.slice(1).split('').map(part => part + part).join('');
  const rgb = String(value || '').match(/rgba?\((\d+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
  return rgb ? '#' + rgb.slice(1).map(part => Number(part).toString(16).padStart(2,'0')).join('') : fallback;
}
function colorWithAlpha(color, alpha) {
  return `rgba(${parseInt(color.slice(1,3),16)}, ${parseInt(color.slice(3,5),16)}, ${parseInt(color.slice(5,7),16)}, ${alpha})`;
}
function setFill(editor, color, alpha) {
  const image = styleFor(currentSelection(editor))['background-image'] || '';
  const gradient = resolver.parseGradient(image);
  if (gradient?.stops.length) {
    const index = gradient.stops.findIndex(stop => stop.color);
    const value = alpha === undefined ? color : colorWithAlpha(color, alpha);
    writeStyle(editor, {'background-image': resolver.setStop(image, index, value)});
  } else writeStyle(editor, {'background-color': alpha === undefined ? color : colorWithAlpha(color, alpha)});
}
function ensureInspectorRows() {
  const fillControl = document.querySelector('.color-control');
  if (fillControl && !byId('fill-details')) {
    const details = document.createElement('div'); details.id = 'fill-details'; details.className = 'style-details';
    fillControl.after(details);
  }
  const shadow = byId('shadow-toggle');
  if (shadow && !byId('effects-details')) {
    const details = document.createElement('div'); details.id = 'effects-details'; details.className = 'style-details';
    shadow.after(details);
  }
  const stroke=[...document.querySelectorAll('.inspector-section')].find(section=>section.querySelector('h3')?.textContent.trim()==='Stroke');
  if(stroke&&!byId('stroke-details')){const details=document.createElement('div');details.id='stroke-details';details.className='style-details';details.innerHTML='<label class="gradient-heading"><span>Line style</span><select id="stroke-line-style"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label><label class="gradient-heading"><span>Line cap</span><select id="stroke-line-cap"><option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option></select></label><label class="gradient-heading"><span>Line join</span><select id="stroke-line-join"><option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option></select></label><div id="stroke-side-widths" class="gradient-stops"><label class="gradient-heading"><span>Top width</span><input type="number" min="0" data-stroke-side="top"></label><label class="gradient-heading"><span>Right width</span><input type="number" min="0" data-stroke-side="right"></label><label class="gradient-heading"><span>Bottom width</span><input type="number" min="0" data-stroke-side="bottom"></label><label class="gradient-heading"><span>Left width</span><input type="number" min="0" data-stroke-side="left"></label></div>';stroke.append(details);}
  let css = byId('fidelity-inspector-style');
  if (!css) {
    css = document.createElement('style'); css.id = 'fidelity-inspector-style';
    css.textContent = '.style-details{font-size:10px;color:#68766c;line-height:1.5;white-space:pre-wrap;margin-top:9px}.style-meta{color:#58695e;font-weight:600;margin-bottom:5px}.style-source{display:block;width:100%;resize:vertical;border:1px solid #e3e8e4;border-radius:4px;padding:6px;font:10px/1.4 ui-monospace,monospace;color:#526057}.gradient-stops{display:grid;gap:4px;margin-top:7px}.gradient-stop{display:grid;grid-template-columns:1fr 30px 54px 22px;gap:6px;align-items:center;font-size:10px}.gradient-stop input[type=color]{width:27px;height:23px;padding:2px;border:1px solid #e5e9e5;border-radius:4px}.gradient-stop input[type=text]{width:54px;border:1px solid #e5e9e5;border-radius:4px;padding:4px;font-size:10px}.gradient-stop button,.gradient-add{border:1px solid #e5e9e5;background:#fff;border-radius:4px;color:#68766c;cursor:pointer;min-height:24px}.gradient-heading{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:center;margin-top:6px}.gradient-heading input{min-width:0;width:100%;border:1px solid #e5e9e5;border-radius:4px;padding:5px;font-size:10px}';
    document.head.append(css);
  }
}
function renderFill(editor, style) {
  const details = byId('fill-details'); if (!details) return;
  details.replaceChildren();
  const resolved = resolver.resolve(style);
  const label = document.createElement('div'); label.className = 'style-meta'; label.textContent = `${resolved.fillType.replace(/-/g,' ')}${resolved.gradient?.heading ? ` · ${resolved.gradient.heading}` : ''}`; details.append(label);
  renderImageFill(editor,style,resolved,details);
  if (resolved.backgroundImage) {
    const source = document.createElement('textarea'); source.className = 'style-source'; source.rows = 2; source.value = resolved.backgroundImage; source.setAttribute('aria-label','CSS background image');
    source.onchange = () => writeStyle(editor, {'background-image': source.value.trim() || 'none'}); details.append(source);
  }
  if (!resolved.gradient) return;
  const heading=document.createElement('label');heading.className='gradient-heading';heading.innerHTML='<span>Gradient direction</span><input type="text" aria-label="Gradient direction" placeholder="to right or 135deg">';heading.querySelector('input').value=resolved.gradient.heading||'';heading.querySelector('input').onchange=event=>writeStyle(editor,{'background-image':resolver.setHeading(resolved.backgroundImage,event.target.value)});details.append(heading);
  const list = document.createElement('div'); list.className = 'gradient-stops';
  resolved.gradient.stops.forEach((stop,index) => {
    if (!stop.color) return;
    const row = document.createElement('label'); row.className = 'gradient-stop';
    const title = document.createElement('span'); title.textContent = `Stop ${index+1}`; row.append(title);
    if (/^#[\da-f]{3,8}$/i.test(stop.color) || /^rgba?\(/i.test(stop.color)) {
      const color = document.createElement('input'); color.type = 'color'; color.value = colorHex(stop.color); color.setAttribute('aria-label',`Gradient stop ${index+1} color`);
      color.oninput = () => writeStyle(editor, {'background-image': resolver.setStop(resolved.backgroundImage,index,color.value)}); row.append(color);
    } else { const placeholder = document.createElement('span'); placeholder.textContent = stop.color; row.append(placeholder); }
    const position = document.createElement('input'); position.type = 'text'; position.value = stop.position; position.placeholder = 'auto'; position.setAttribute('aria-label',`Gradient stop ${index+1} position`);
    position.onchange = () => writeStyle(editor, {'background-image': resolver.setStop(resolved.backgroundImage,index,stop.color,position.value)}); row.append(position);const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='Remove gradient stop';remove.setAttribute('aria-label',`Remove gradient stop ${index+1}`);remove.disabled=resolved.gradient.stops.length<=2;remove.onclick=()=>writeStyle(editor,{'background-image':resolver.removeStop(resolved.backgroundImage,index)});row.append(remove);list.append(row);
  });
  details.append(list);const add=document.createElement('button');add.type='button';add.className='gradient-add';add.textContent='Add gradient stop';add.onclick=()=>writeStyle(editor,{'background-image':resolver.addStop(resolved.backgroundImage)});details.append(add);
}
function renderImageFill(editor,style,resolved,details){
  const component=currentSelection(editor),element=component?.view?.el,isElementImage=component?.get?.('type')==='image'||element?.tagName==='IMG',isBackgroundImage=resolved.fillType==='image';if(!isElementImage&&!isBackgroundImage)return;
  const currentFit=isElementImage?(style['object-fit']||'cover'):(style['background-size']||'cover'),currentPosition=isElementImage?(style['object-position']||'50% 50%'):(style['background-position']||'50% 50%'),parts=String(currentPosition).trim().split(/\s+/),fit=document.createElement('label');fit.className='gradient-heading';fit.innerHTML=`<span>${isElementImage?'Image crop':'Image fill'}</span><select aria-label="Image fit"><option value="cover">Crop to fill</option><option value="contain">Fit image</option><option value="fill">Stretch</option><option value="original">Original size</option></select>`;fit.querySelector('select').value=imageFitToInspector(currentFit,{elementImage:isElementImage});fit.querySelector('select').onchange=event=>{const value=imageFitFromInspector(event.target.value,{elementImage:isElementImage});writeStyle(editor,{[isElementImage?'object-fit':'background-size']:value});};details.append(fit);
  const position=document.createElement('div');position.className='gradient-stops';for(const [index,name] of ['Horizontal crop position','Vertical crop position'].entries()){const row=document.createElement('label');row.className='gradient-heading';row.innerHTML=`<span>${name}</span><input type="range" min="0" max="100" step="1" aria-label="${name}">`;const input=row.querySelector('input'),initial=Number.parseFloat(parts[index]);input.value=Number.isFinite(initial)?initial:50;input.oninput=()=>{const values=[...position.querySelectorAll('input')].map(item=>item.value);writeStyle(editor,imagePositionStyle(values[0],values[1],{elementImage:isElementImage}));};position.append(row);}details.append(position);
}
function renderStroke(editor,style){const details=byId('stroke-details'),component=currentSelection(editor),element=component?.view?.el;if(!details)return;const vector=element?.tagName?.toLowerCase()==='svg'||element?.namespaceURI==='http://www.w3.org/2000/svg';details.querySelector('#stroke-side-widths').hidden=vector;details.querySelector('#stroke-line-style').value=style['border-style']&&style['border-style']!=='none'?style['border-style']:(style['stroke-dasharray']&&style['stroke-dasharray']!=='none'?(style['stroke-dasharray'].includes(',')||style['stroke-dasharray'].includes(' ')?'dashed':'dotted'):'solid');details.querySelector('#stroke-line-cap').value=style['stroke-linecap']||'butt';details.querySelector('#stroke-line-join').value=style['stroke-linejoin']||'miter';for(const input of details.querySelectorAll('[data-stroke-side]'))input.value=parseFloat(style[`border-${input.dataset.strokeSide}-width`]||style['border-width'])||0;}
function writeStroke(editor,change){const component=currentSelection(editor);if(!component||component.get?.('locked'))return;const element=component.view?.el,isSvg=element?.tagName?.toLowerCase()==='svg'||element?.namespaceURI==='http://www.w3.org/2000/svg';component.addStyle(change);if(isSvg){const descendants=component.components?.()?.models||[];const apply=node=>{if(node.get?.('tagName')==='path'||node.get?.('tagName')==='line'||node.get?.('tagName')==='polygon'||node.get?.('tagName')==='polyline')node.addStyle(Object.fromEntries(Object.entries(change).filter(([key])=>['stroke','stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin'].includes(key))));(node.components?.()?.models||[]).forEach(apply);};descendants.forEach(apply);}}
function sync(editor) {
  ensureInspectorRows();
  const style = styleFor(currentSelection(editor)), resolved = resolver.resolve(style), image = resolved.backgroundImage;
  const gradient = resolved.gradient, firstStop = gradient?.stops.find(stop => stop.color);
  let bg = firstStop?.color || style['background-color'] || 'transparent';
  if (/^rgba\([^)]*,\s*0(?:\.0+)?\)$/i.test(bg)) bg = 'transparent';
  const fill = byId('prop-fill'), hex = byId('prop-fill-hex');
  if (fill) fill.value = colorHex(bg, bg === 'transparent' ? '#ffffff' : '#000000');
  if (hex) hex.value = (fill?.value || '#ffffff').slice(1).toUpperCase();
  const alpha = bg.match?.(/rgba?\((\d+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\)/i);
  const opacity = byId('prop-fill-alpha'); if (opacity) opacity.value = String(Math.round((alpha ? Number(alpha[4] ?? 1) : bg === 'transparent' && !image ? 0 : 1) * 100));
  renderFill(editor, style);
  renderStroke(editor,style);
  const effects = [];
  resolved.boxShadow.forEach((shadow,index) => effects.push(`Drop shadow ${index+1}: ${shadow}`));
  if (resolved.backdropFilter !== 'none') effects.push(`Background blur: ${resolved.backdropFilter}`);
  if (resolved.filter !== 'none') effects.push(`Filter: ${resolved.filter}`);
  if (px(style.opacity || '1') !== 1) effects.push(`Opacity: ${style.opacity}`);
  const effectDetails = byId('effects-details'); if (effectDetails) effectDetails.textContent = effects.length ? effects.join('\n') : 'No effects';
  const shadowLabel = document.querySelector('#shadow-toggle');
  if (shadowLabel) { shadowLabel.classList.toggle('active',resolved.boxShadow.length > 0); const text = shadowLabel.childNodes; for (const node of text) if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.textContent = resolved.boxShadow.length ? 'Drop shadow · applied' : 'Drop shadow'; }
}
function installInspector(editor) {
  if (!editor.formaCanonicalCssInstalled) {
    const originalGetCss = editor.getCss.bind(editor);
    editor.getCss = (...args) => `${originalGetCss(...args)}\n${protectedCss}`;
    editor.formaCanonicalCssInstalled = true;
  }
  const update = () => sync(editor);
  for (const event of ['load','component:selected','component:deselected','component:update','component:styleUpdate','update','undo','redo']) editor.on(event,update);
  setTimeout(update,0);
  const fill = byId('prop-fill'), hex = byId('prop-fill-hex'), alpha = byId('prop-fill-alpha');
  const apply = () => setFill(editor,fill?.value || '#ffffff',alpha ? Math.max(0,Math.min(100,Number(alpha.value)||0))/100 : undefined);
  if (fill) fill.oninput = () => setFill(editor,fill.value);
  if (hex) hex.oninput = () => { const value=hex.value.replace('#',''); if (/^[\da-f]{6}$/i.test(value)) { if(fill)fill.value='#'+value; setFill(editor,'#'+value); } };
  if (alpha) alpha.oninput = apply;
  const strokeColor=byId('prop-stroke'),strokeWidth=byId('prop-stroke-width'),selectedBorderStyle=()=>byId('stroke-line-style')?.value||'solid';if(strokeColor)strokeColor.oninput=()=>writeStroke(editor,{'border-color':strokeColor.value,stroke:strokeColor.value,'border-style':selectedBorderStyle()});if(strokeWidth)strokeWidth.oninput=()=>writeStroke(editor,{'border-width':`${Math.max(0,Number(strokeWidth.value)||0)}px`,'stroke-width':`${Math.max(0,Number(strokeWidth.value)||0)}px`,'border-style':selectedBorderStyle()});
  document.addEventListener('change',event=>{const target=event.target;if(target?.id==='stroke-line-style'){const component=currentSelection(editor),svg=component?.view?.el?.tagName?.toLowerCase()==='svg';if(svg)writeStroke(editor,{'stroke-dasharray':target.value==='dotted'?'1 3':target.value==='dashed'?'6 4':'none'});else writeStroke(editor,{'border-style':target.value});}if(target?.id==='stroke-line-cap')writeStroke(editor,{'stroke-linecap':target.value});if(target?.id==='stroke-line-join')writeStroke(editor,{'stroke-linejoin':target.value});if(target?.matches?.('[data-stroke-side]'))writeStroke(editor,{[`border-${target.dataset.strokeSide}-width`]:`${Math.max(0,Number(target.value)||0)}px`,'border-style':selectedBorderStyle()});});
  byId('clear-fill')?.addEventListener('click',()=>writeStyle(editor,{'background-color':'transparent','background-image':'none'}));
  document.querySelectorAll('#fill-palette .swatch').forEach(button=>button.onclick=()=>setFill(editor,button.style.backgroundColor.startsWith('rgb')?colorHex(button.style.backgroundColor):button.style.backgroundColor));
  const shadow=byId('shadow-toggle'); if(shadow)shadow.onclick=()=>{const style=styleFor(currentSelection(editor)),value=style['box-shadow']||'none';writeStyle(editor,{'box-shadow':value==='none'?'0 8px 24px #1b292225':'none'});};
}
document.addEventListener('DOMContentLoaded', () => {
  const start = () => { const editor=editorInstance(); if(!editor)return setTimeout(start,40); installInspector(editor); };
  start();
});
