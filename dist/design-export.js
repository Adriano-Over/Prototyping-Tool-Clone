import {apiFetch} from './api-client.js';
import {getFormaNodeId, walkFormaNodes} from './stable-ids.js';
import {rasterizeExportVectors} from './vector-export-coverage.js';

const editorClasses = ['gjs-selected', 'gjs-selected-parent', 'gjs-hovered', 'gjs-dashed', 'gjs-freezed'];

function withoutEditorClasses(element, descendants, capture) {
  const ancestors = [];
  for (let parent = element.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
  const changed = [element, ...descendants, ...ancestors]
    .filter(node => editorClasses.some(name => node.classList?.contains(name)))
    .map(node => [node, node.getAttribute('class')]);
  try {
    for (const [node] of changed) node.classList.remove(...editorClasses);
    return capture();
  } finally {
    for (const [node, value] of changed) node.setAttribute('class', value);
  }
}

export function captureDesignElement(component,{crop=null,name=null,sampleVectorEdges=false}={}){
  const original=component?.view?.el;if(!original)throw Error('Select a visible frame or layer.');
  return withoutEditorClasses(original, original.querySelectorAll('*'), () => captureArtwork(component, original, crop, name, sampleVectorEdges));
}

function captureArtwork(component, original, crop, name, sampleVectorEdges) {
  const document=original.ownerDocument,window=document.defaultView,clone=original.cloneNode(true),sources=[original,...original.querySelectorAll('*')],targets=[clone,...clone.querySelectorAll('*')];
  for(let index=0;index<sources.length;index++){
    const source=sources[index],target=targets[index],computed=window.getComputedStyle(source);
    const vectorViewport=source.matches('[data-forma-vector-paint]')||source.firstElementChild?.matches('[data-forma-vector-paint]');
    const authoredGeometry=vectorViewport&&computed.position==='absolute'?source.computedStyleMap?.():null;
    for(const property of computed){
      // Imported paths already carry the source coordinates in their SVG d
      // attribute. Chromium serializes the computed d with fewer digits.
      if(property==='d'&&source.hasAttribute('d')&&source.closest('[data-forma-vector-paint]'))continue;
      let value=computed.getPropertyValue(property);
      if(authoredGeometry&&['width','height','transform'].includes(property)){
        // Preserve percentage SVG viewports and the exact transform rather
        // than freezing them at the rounded sizes reported by getComputedStyle.
        const authored=authoredGeometry.get(property);
        const matrix=property==='transform'&&authored?.length===1?authored[0].matrix:null;
        if(matrix?.is2D)value=`matrix(${[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].join(',')})`;
        else if(authored?.unit==='px'||authored?.unit==='percent')value=authored.toString();
      }
      value=value.replace(/url\(["']?https?:\/\/[^)#]+#([^\)"']+)["']?\)/g,'url(#$1)');target.style.setProperty(property,value);
    }
    for(const attribute of [...target.attributes])if(/^on/i.test(attribute.name)||attribute.name==='contenteditable'||attribute.name==='srcdoc'||attribute.name.startsWith('data-gjs'))target.removeAttribute(attribute.name);
    if(source.tagName==='INPUT')target.setAttribute('value',source.value);if(source.tagName==='TEXTAREA')target.textContent=source.value;
    if(source.tagName==='OPTION'&&source.selected)target.setAttribute('selected','selected');
  }
  clone.querySelectorAll('script,iframe,object,embed,base,meta,link,[data-forma-editor-overlay],[data-forma-region="slice"]').forEach(node=>node.remove());
  if(crop){
    const x=Math.max(0,Number(crop.x)||0),y=Math.max(0,Number(crop.y)||0),cropWidth=Math.max(1,Number(crop.width)||1),cropHeight=Math.max(1,Number(crop.height)||1);
    Object.assign(clone.style,{position:'absolute',left:-x+'px',top:-y+'px',right:'auto',bottom:'auto',margin:'0',width:cropWidth+'px',height:cropHeight+'px',overflow:'hidden',transform:'none',transformOrigin:'top left',translate:'none'});
    return {name:name||component.get('name')||'Slice',width:cropWidth,height:cropHeight,html:new XMLSerializer().serializeToString(clone)};
  }
  const computed=window.getComputedStyle(original),width=original.offsetWidth||parseFloat(computed.width)||original.getBoundingClientRect().width,height=original.offsetHeight||parseFloat(computed.height)||original.getBoundingClientRect().height;
  const [ox,oy]=computed.transformOrigin.split(' ').map(parseFloat),matrix=new DOMMatrix(computed.transform==='none'?undefined:computed.transform);
  const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>{const point=new DOMPoint(x-(ox||0),y-(oy||0)).matrixTransform(matrix);return {x:point.x+(ox||0),y:point.y+(oy||0)};});
  const left=Math.min(...corners.map(point=>point.x)),top=Math.min(...corners.map(point=>point.y)),right=Math.max(...corners.map(point=>point.x)),bottom=Math.max(...corners.map(point=>point.y));
  if(sampleVectorEdges)rasterizeExportVectors(original,clone,width,height);
  Object.assign(clone.style,{position:'absolute',left:-left+'px',top:-top+'px',right:'auto',bottom:'auto',margin:'0',width:width+'px',height:height+'px',translate:'none'});
  return {name:name||component.get('name')||component.getName(),width:Math.max(1,Math.ceil(right-left)),height:Math.max(1,Math.ceil(bottom-top)),html:new XMLSerializer().serializeToString(clone)};
}

const pageKey = page => page?.getId?.() ?? page?.id ?? page;

export function rememberExportTarget(api) {
  const {editor} = api;
  const layer = editor.getSelected?.() || api.selected;
  let presets = [];
  try {
    const value = JSON.parse(layer?.getAttributes?.()['data-figma-export-settings'] || '[]');
    if (Array.isArray(value)) presets = value;
  } catch { /* Old projects can contain an invalid preset. */ }
  return {
    projectId: api.getProjectId(), pageKey: pageKey(editor.Pages.getSelected()), layer,
    nodeId: getFormaNodeId(layer), name: layer?.get?.('name') || layer?.getName?.(), presets,
  };
}

function findExportLayer(root, target) {
  let match;
  walkFormaNodes(root, node => {
    if (target.nodeId ? getFormaNodeId(node) === target.nodeId : node === target.layer) match = node;
  });
  return match;
}

const afterCanvasMount = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function collectExportDocuments(api, scope, target, capture = captureDesignElement, waitForCanvas = afterCanvasMount) {
  if (api.getProjectId() !== target.projectId) throw Error('The project changed. Close and reopen Export.');
  const {editor} = api;
  const original = rememberExportTarget(api);
  let moved = false;
  async function mount(page) {
    if (pageKey(editor.Pages.getSelected()) === pageKey(page)) return;
    moved = true;
    editor.Pages.select(page);
    await waitForCanvas();
  }
  try {
    if (scope !== 'pages') {
      const page = editor.Pages.getAll().find(item => pageKey(item) === target.pageKey);
      if (!page) throw Error('The export page is no longer available.');
      await mount(page);
      const root = editor.getWrapper();
      if (scope === 'page') return [capture(root)];
      const layer = findExportLayer(root, target);
      if (!layer) throw Error('The selected layer is no longer available. Close and reopen Export.');
      if (layer.getAttributes?.()['data-forma-region'] === 'slice') {
        const style = layer.getStyle?.() || {};
        return [capture(root, {crop: {x:parseFloat(style.left),y:parseFloat(style.top),width:parseFloat(style.width),height:parseFloat(style.height)},name:target.name || 'Slice'})];
      }
      return [capture(layer, {name:target.name})];
    }
    const documents = [];
    for (const page of editor.Pages.getAll()) {
      await mount(page);
      const root = editor.getWrapper();
      const frames = root.components().models.filter(node => node.get('type') !== 'text');
      for (const frame of frames.length ? frames : [root]) documents.push(capture(frame));
    }
    return documents;
  } finally {
    if (moved && api.getProjectId() === original.projectId) {
      const page = editor.Pages.getAll().find(item => pageKey(item) === original.pageKey);
      if (page) {
        await mount(page);
        const layer = findExportLayer(editor.getWrapper(), original);
        if (layer) editor.select(layer);
        api.renderPages(); api.renderLayers(); api.syncInspector();
      }
    }
  }
}

export function installDesignExport(api){
  const button=document.createElement('button');button.textContent='Export PNG, SVG or PDF';document.querySelector('#file-menu').prepend(button);
  const dialog=document.createElement('dialog');dialog.className='workbench-dialog';dialog.style.cssText='width:min(580px,94vw);height:auto;max-height:90vh';
  dialog.innerHTML='<div class="wb-head"><h2>Export design</h2><button class="icon-btn" aria-label="Close design export">×</button></div><section class="wb-section"><div class="wb-form vertical"><label id="design-export-preset-row" hidden>Figma export preset<select id="design-export-preset"><option value="">Manual export settings</option></select></label><label>Format<select id="design-export-format"><option value="png">PNG image</option><option value="svg">SVG</option><option value="pdf">PDF document</option></select></label><label>Include<select id="design-export-scope"><option value="selection">Selected layer or frame</option><option value="page">Current page</option><option value="pages">Frames across all pages</option></select></label><label>Image scale<select id="design-export-scale"><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label><label><input type="checkbox" id="design-export-transparent" checked>Transparent background</label></div><p id="design-export-note">PNG and PDF use the installed browser rendering engine.</p><button id="design-export-start" class="primary-btn">Export</button><p id="design-export-status" role="status"></p></section>';
  let target;
  document.body.append(dialog);
  button.onclick=()=>{
    target = rememberExportTarget(api);
    document.querySelector('#file-menu').hidden=true;
    get('design-export-scope').options[0].textContent = target.name ? `Selected layer or frame (${target.name})` : 'Selected layer or frame';
    get('design-export-status').textContent = '';
    syncFigmaPresets();
    dialog.showModal();
  };
  dialog.querySelector('[aria-label="Close design export"]').onclick=()=>dialog.close();
  const get=id=>dialog.querySelector('#'+id);
  const supportedFormats={PNG:'png',SVG:'svg',PDF:'pdf'};
  function syncFigmaPresets(){
    const row=get('design-export-preset-row'),select=get('design-export-preset'),settings=target.presets;
    row.hidden=!settings.length;
    select.replaceChildren(new Option('Manual export settings',''));
    settings.forEach((setting,index)=>{
      const format=supportedFormats[String(setting.imageType||'').toUpperCase()];
      const scale=setting.constraint?.type==='CONTENT_SCALE'?Number(setting.constraint.value)||1:1;
      const option=new Option(`${setting.imageType||'Unknown'} · ${scale}×${setting.suffix?` · ${setting.suffix}`:''}${format?'':' (unsupported format)'}`,String(index));
      option.disabled=!format||![1,2,3,4].includes(scale);select.add(option);
    });
  }
  get('design-export-preset').onchange=()=>{
    const preset = get('design-export-preset').value;
    const setting = preset === '' ? null : target.presets[Number(preset)];
    if(!setting)return;
    const format=supportedFormats[String(setting.imageType||'').toUpperCase()];
    if(!format)return;
    get('design-export-scope').value='selection';get('design-export-format').value=format;
    const scale=setting.constraint?.type==='CONTENT_SCALE'?Number(setting.constraint.value)||1:1;
    get('design-export-scale').value=String([1,2,3,4].includes(scale)?scale:1);
    get('design-export-note').textContent=`Using imported Figma preset${setting.suffix?` with suffix “${setting.suffix}”`:''}. The selected layer is exported at its own bounds.`;
  };
  get('design-export-scope').onchange=()=>{if(get('design-export-scope').value!=='selection')get('design-export-preset').value='';};
  get('design-export-format').onchange=()=>{get('design-export-note').textContent=get('design-export-format').value==='svg'?'SVG preserves browser layout using embedded HTML. Some vector editors do not support this SVG feature.':'PNG and PDF use the installed browser rendering engine.';};
  const collect = (scope, exportTarget = rememberExportTarget(api), sampleVectorEdges = false) =>
    collectExportDocuments(api, scope, exportTarget, (layer, options) => captureDesignElement(layer, {...options, sampleVectorEdges}));
  get('design-export-start').onclick=async()=>{
    get('design-export-start').disabled=true;get('design-export-status').textContent='Rendering design…';
    try{
      const exportTarget = target, scope = get('design-export-scope').value, format = get('design-export-format').value;
      const preset = get('design-export-preset').value, setting = preset === '' ? null : exportTarget.presets[Number(preset)];
      const scale = Number(get('design-export-scale').value), transparent = get('design-export-transparent').checked;
      const documents = await collect(scope, exportTarget, format === 'png' && scale === 1);
      const response=await apiFetch('/api/render',{method:'POST',body:JSON.stringify({format,documents,projectId:exportTarget.projectId,scale,transparent})});
      if(!response.ok)throw Error((await response.json()).error||'Export failed.');
      const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;
      const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
      const base = String(documents[0].name || 'design').replace(/[\\/:*?"<>|]+/g,'-').trim() || 'design';
      const suffix = setting?.suffix ? `_${String(setting.suffix).replace(/[\\/:*?"<>|]+/g,'-')}` : '';
      anchor.download = scope==='selection' && !filename?.endsWith('.zip') ? `${base}${suffix}.${format}` : filename || `design.${format}`;
      anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);get('design-export-status').textContent='Export downloaded.';
    }catch(error){get('design-export-status').textContent=error.message;}finally{get('design-export-start').disabled=false;}
  };
  return {collect};
}
