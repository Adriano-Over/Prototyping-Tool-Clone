import {apiFetch} from './api-client.js';

export function captureDesignElement(component,{crop=null,name=null}={}){
  const original=component?.view?.el;if(!original)throw Error('Select a visible frame or layer.');
  const document=original.ownerDocument,window=document.defaultView,clone=original.cloneNode(true),sources=[original,...original.querySelectorAll('*')],targets=[clone,...clone.querySelectorAll('*')];
  for(let index=0;index<sources.length;index++){
    const source=sources[index],target=targets[index],computed=window.getComputedStyle(source);
    for(const property of computed){let value=computed.getPropertyValue(property);value=value.replace(/url\(["']?https?:\/\/[^)#]+#([^\)"']+)["']?\)/g,'url(#$1)');target.style.setProperty(property,value);}
    for(const attribute of [...target.attributes])if(/^on/i.test(attribute.name)||attribute.name==='contenteditable'||attribute.name==='srcdoc'||attribute.name.startsWith('data-gjs'))target.removeAttribute(attribute.name);
    if(source.tagName==='INPUT')target.setAttribute('value',source.value);if(source.tagName==='TEXTAREA')target.textContent=source.value;
    if(source.tagName==='OPTION'&&source.selected)target.setAttribute('selected','selected');
  }
  clone.querySelectorAll('script,iframe,object,embed,base,meta,link,[data-forma-editor-overlay],[data-forma-region="slice"]').forEach(node=>node.remove());
  if(crop){
    const x=Math.max(0,Number(crop.x)||0),y=Math.max(0,Number(crop.y)||0),cropWidth=Math.max(1,Number(crop.width)||1),cropHeight=Math.max(1,Number(crop.height)||1);
    Object.assign(clone.style,{position:'absolute',left:-x+'px',top:-y+'px',right:'auto',bottom:'auto',margin:'0',width:cropWidth+'px',height:cropHeight+'px',overflow:'hidden',transform:'none',transformOrigin:'top left'});
    return {name:name||component.get('name')||'Slice',width:cropWidth,height:cropHeight,html:new XMLSerializer().serializeToString(clone)};
  }
  const computed=window.getComputedStyle(original),width=original.offsetWidth||parseFloat(computed.width)||original.getBoundingClientRect().width,height=original.offsetHeight||parseFloat(computed.height)||original.getBoundingClientRect().height;
  const [ox,oy]=computed.transformOrigin.split(' ').map(parseFloat),matrix=new DOMMatrix(computed.transform==='none'?undefined:computed.transform);
  const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>{const point=new DOMPoint(x-(ox||0),y-(oy||0)).matrixTransform(matrix);return {x:point.x+(ox||0),y:point.y+(oy||0)};});
  const left=Math.min(...corners.map(point=>point.x)),top=Math.min(...corners.map(point=>point.y)),right=Math.max(...corners.map(point=>point.x)),bottom=Math.max(...corners.map(point=>point.y));
  Object.assign(clone.style,{position:'absolute',left:-left+'px',top:-top+'px',right:'auto',bottom:'auto',margin:'0',width:width+'px',height:height+'px'});
  return {name:name||component.get('name')||component.getName(),width:Math.max(1,Math.ceil(right-left)),height:Math.max(1,Math.ceil(bottom-top)),html:new XMLSerializer().serializeToString(clone)};
}

export function installDesignExport(api){
  const button=document.createElement('button');button.textContent='Export PNG, SVG or PDF';document.querySelector('#file-menu').prepend(button);
  const dialog=document.createElement('dialog');dialog.className='workbench-dialog';dialog.style.cssText='width:min(580px,94vw);height:auto;max-height:90vh';
  dialog.innerHTML='<div class="wb-head"><h2>Export design</h2><button class="icon-btn" aria-label="Close design export">×</button></div><section class="wb-section"><div class="wb-form vertical"><label>Format<select id="design-export-format"><option value="png">PNG image</option><option value="svg">SVG</option><option value="pdf">PDF document</option></select></label><label>Include<select id="design-export-scope"><option value="selection">Selected layer or frame</option><option value="page">Current page</option><option value="pages">Frames across all pages</option></select></label><label>Image scale<select id="design-export-scale"><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label><label><input type="checkbox" id="design-export-transparent" checked>Transparent background</label></div><p id="design-export-note">PNG and PDF use the installed browser rendering engine.</p><button id="design-export-start" class="primary-btn">Export</button><p id="design-export-status" role="status"></p></section>';
  document.body.append(dialog);button.onclick=()=>{document.querySelector('#file-menu').hidden=true;dialog.showModal();};dialog.querySelector('[aria-label="Close design export"]').onclick=()=>dialog.close();
  const get=id=>dialog.querySelector('#'+id);
  get('design-export-format').onchange=()=>{get('design-export-note').textContent=get('design-export-format').value==='svg'?'SVG preserves browser layout using embedded HTML. Some vector editors do not support this SVG feature.':'PNG and PDF use the installed browser rendering engine.';};
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  async function collect(scope){
    api.history.flush();const selected=api.selected,page=api.editor.Pages.getSelected();
    try{
      if(scope==='selection'){
        if(selected?.getAttributes?.()['data-forma-region']==='slice'){
          const style=selected.getStyle?.()||{};
          return [captureDesignElement(api.editor.getWrapper(),{crop:{x:parseFloat(style.left),y:parseFloat(style.top),width:parseFloat(style.width),height:parseFloat(style.height)},name:selected.get('name')||'Slice'})];
        }
        return [captureDesignElement(selected)];
      }
      if(scope==='page')return [captureDesignElement(api.editor.getWrapper())];
      const result=[];for(const item of api.editor.Pages.getAll()){
        api.editor.Pages.select(item);await nextFrame();const roots=api.editor.getWrapper().components().models.filter(node=>node.get('type')!=='text');
        for(const root of roots.length?roots:[api.editor.getWrapper()])result.push(captureDesignElement(root));
      }return result;
    }finally{if(page)api.editor.Pages.select(page);if(selected)api.editor.select(selected);api.renderPages();api.renderLayers();api.syncInspector();}
  }
  get('design-export-start').onclick=async()=>{
    get('design-export-start').disabled=true;get('design-export-status').textContent='Rendering design…';
    try{
      const format=get('design-export-format').value,documents=await collect(get('design-export-scope').value),response=await apiFetch('/api/render',{method:'POST',body:JSON.stringify({format,documents,projectId:api.getProjectId(),scale:Number(get('design-export-scale').value),transparent:get('design-export-transparent').checked})});
      if(!response.ok)throw Error((await response.json()).error||'Export failed.');
      const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=(response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)||[])[1]||'design.'+format;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);get('design-export-status').textContent='Export downloaded.';
    }catch(error){get('design-export-status').textContent=error.message;}finally{get('design-export-start').disabled=false;}
  };
  return {collect};
}
