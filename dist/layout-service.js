const copy=value=>JSON.parse(JSON.stringify(value??{}));

export function captureLayout(component) {
  const style=copy(component?.getStyle?.());
  const children=(component?.components?.()?.models||[]).map(child=>({id:child.get?.('formaNodeId')||child.cid,style:copy(child.getStyle?.())}));
  return {style,children};
}
function restoreStyle(component,style){if(component?.setStyle)component.setStyle(copy(style));else component?.addStyle?.(copy(style));}
const positive=value=>Math.max(0,Number(value)||0);
export function sizingStyle({widthMode,heightMode,width,height,minWidth,maxWidth,minHeight,maxHeight,parentDirection='row'}={}){
  const style={};
  for(const [axis,mode,value] of [['width',widthMode,width],['height',heightMode,height]]){
    if(!mode)continue;
    if(mode==='hug')style[axis]='max-content';
    else if(mode==='fill'){style[axis]='100%';if((axis==='width')===(parentDirection==='row')){style['flex-grow']='1';style['flex-basis']='0px';style[axis]='auto';}style['min-'+axis]='0px';}
    else if(mode==='fixed'&&Number.isFinite(Number(value)))style[axis]=positive(value)+'px';
  }
  if(widthMode!=='fill'&&heightMode!=='fill')style['flex-grow']='0';
  for(const [property,value] of [['min-width',minWidth],['max-width',maxWidth],['min-height',minHeight],['max-height',maxHeight]])if(value!==undefined&&value!=='')style[property]=positive(value)+'px';
  return style;
}
export function autoLayoutStyle(options={}){
  const style={display:'flex',position:'relative','flex-direction':options.direction==='column'?'column':'row',gap:positive(options.gap)+'px',padding:positive(options.padding)+'px','align-items':options.align||'flex-start','justify-content':options.justify||'flex-start','flex-wrap':options.wrap===false?'nowrap':'wrap',...sizingStyle(options)};
  for(const side of ['Top','Right','Bottom','Left'])if(options['padding'+side]!==undefined)style['padding-'+side.toLowerCase()]=positive(options['padding'+side])+'px';
  if(options.rowGap!==undefined)style['row-gap']=positive(options.rowGap)+'px';if(options.columnGap!==undefined)style['column-gap']=positive(options.columnGap)+'px';return style;
}
export function autoLayoutCommand(component,projectState,options={}) {
  const nodeId=component?.get?.('formaNodeId');if(!component||!nodeId)throw new Error('Auto layout needs a selected saved layer');
  const next=autoLayoutStyle({...options,parentDirection:component.parent?.()?.getStyle?.()['flex-direction']||'row'});
  return {id:'apply-auto-layout',apply(){const before=captureLayout(component),metadata=projectState.getLayoutMetadata();for(const child of component.components().models)if(!metadata[child.get?.('formaNodeId')]?.constraints)child.addStyle({position:'relative',left:'auto',top:'auto',right:'auto',bottom:'auto'});component.addStyle(next);projectState.setLayoutMetadata({...metadata,[nodeId]:{...(metadata[nodeId]||{}),autoLayout:{before:metadata[nodeId]?.autoLayout?.before||before,options:copy(options)}}});return {before,metadata};},revert(snapshot){restoreStyle(component,snapshot.before.style);for(const entry of snapshot.before.children){const child=component.components().models.find(item=>(item.get?.('formaNodeId')||item.cid)===entry.id);if(child)restoreStyle(child,entry.style);}projectState.setLayoutMetadata(snapshot.metadata);}};
}
export function constraintStyle(child,parent,{horizontal='left',vertical='top'}={}){
  if(parent.width<=0||parent.height<=0)throw Error('The parent frame needs a size before adding constraints.');
  const style={position:'absolute',left:child.x+'px',top:child.y+'px',right:'auto',bottom:'auto',width:child.width+'px',height:child.height+'px'};
  if(horizontal==='right'){style.left='auto';style.right=(parent.width-child.x-child.width)+'px';}
  if(horizontal==='stretch'){style.right=(parent.width-child.x-child.width)+'px';style.width='auto';}
  if(horizontal==='center'){const offset=child.x-parent.width/2;style.left=offset<0?`calc(50% - ${Math.abs(offset)}px)`:offset>0?`calc(50% + ${offset}px)`:'50%';}
  if(horizontal==='scale'){style.left=(child.x/parent.width*100)+'%';style.width=(child.width/parent.width*100)+'%';}
  if(vertical==='bottom'){style.top='auto';style.bottom=(parent.height-child.y-child.height)+'px';}
  if(vertical==='stretch'){style.bottom=(parent.height-child.y-child.height)+'px';style.height='auto';}
  if(vertical==='center'){const offset=child.y-parent.height/2;style.top=offset<0?`calc(50% - ${Math.abs(offset)}px)`:offset>0?`calc(50% + ${offset}px)`:'50%';}
  if(vertical==='scale'){style.top=(child.y/parent.height*100)+'%';style.height=(child.height/parent.height*100)+'%';}
  return style;
}
export function constraintGeometry(element,parentElement,style={},parentStyle={}){
  const number=value=>{const parsed=parseFloat(value);return Number.isFinite(parsed)?parsed:0;};
  const rect=element?.getBoundingClientRect?.(),parentRect=parentElement?.getBoundingClientRect?.();
  const parentOuterWidth=Number(parentElement?.offsetWidth)||number(parentStyle.width),parentOuterHeight=Number(parentElement?.offsetHeight)||number(parentStyle.height);
  const parentWidth=Number(parentElement?.clientWidth)||Math.max(0,parentOuterWidth-(Number(parentElement?.clientLeft)||0)*2),parentHeight=Number(parentElement?.clientHeight)||Math.max(0,parentOuterHeight-(Number(parentElement?.clientTop)||0)*2);
  const scaleX=parentOuterWidth>0&&parentRect?.width?parentRect.width/parentOuterWidth:1,scaleY=parentOuterHeight>0&&parentRect?.height?parentRect.height/parentOuterHeight:1;
  const computed=element?.ownerDocument?.defaultView?.getComputedStyle?.(element),computedParent=parentElement?.ownerDocument?.defaultView?.getComputedStyle?.(parentElement);
  const relativeX=rect&&parentRect?(rect.left-parentRect.left)/scaleX-(Number(parentElement?.clientLeft)||0):undefined,relativeY=rect&&parentRect?(rect.top-parentRect.top)/scaleY-(Number(parentElement?.clientTop)||0):undefined;
  const styleLeft=number(style.left),styleTop=number(style.top),cssWidth=number(computed?.width)||number(style.width),cssHeight=number(computed?.height)||number(style.height);
  const x=Number.isFinite(relativeX)?relativeX:Number(element?.offsetLeft??styleLeft),y=Number.isFinite(relativeY)?relativeY:Number(element?.offsetTop??styleTop);
  const width=cssWidth||Number(element?.offsetWidth)||number(style.width),height=cssHeight||Number(element?.offsetHeight)||number(style.height);
  return {child:{x,y,width,height},parent:{width:parentWidth||number(computedParent?.width)||parentOuterWidth,height:parentHeight||number(computedParent?.height)||parentOuterHeight}};
}
export function constraintCommand(component,projectState,options){
  const parent=component?.parent?.(),id=component?.get?.('formaNodeId');if(!parent||!id)throw Error('Select a saved layer inside a frame.');
  const el=component.view?.el,parentEl=parent.view?.el,style=component.getStyle(),parentStyle=parent.getStyle();
  const geometry=constraintGeometry(el,parentEl,style,parentStyle);
  const next=constraintStyle(geometry.child,geometry.parent,options);
  return {id:'set-constraints',apply(){const before=copy(component.getStyle()),metadata=projectState.getLayoutMetadata();component.addStyle(next);projectState.setLayoutMetadata({...metadata,[id]:{...(metadata[id]||{}),constraints:copy(options)}});return {before,metadata};},revert(snapshot){restoreStyle(component,snapshot.before);projectState.setLayoutMetadata(snapshot.metadata);}};
}
export function sizingCommand(component,projectState,options){
  const id=component?.get?.('formaNodeId');if(!id)throw Error('Select a saved layer.');const style=sizingStyle({...options,parentDirection:component.parent?.()?.getStyle?.()['flex-direction']||'row'});
  return {id:'set-sizing',apply(){const before=copy(component.getStyle()),metadata=projectState.getLayoutMetadata();component.addStyle(style);projectState.setLayoutMetadata({...metadata,[id]:{...(metadata[id]||{}),sizing:copy(options)}});return {before,metadata};},revert(snapshot){restoreStyle(component,snapshot.before);projectState.setLayoutMetadata(snapshot.metadata);}};
}
export function removeAutoLayoutCommand(component,projectState) {
  const nodeId=component?.get?.('formaNodeId'),metadata=projectState.getLayoutMetadata(),saved=metadata[nodeId]?.autoLayout?.before;if(!saved)throw new Error('This layer has no Forma auto layout to remove');
  return {id:'remove-auto-layout',apply(){const current=captureLayout(component),previous=copy(metadata);restoreStyle(component,saved.style);for(const entry of saved.children){const child=component.components().models.find(item=>(item.get?.('formaNodeId')||item.cid)===entry.id);if(child)restoreStyle(child,entry.style);}const next=copy(metadata);if(next[nodeId]){delete next[nodeId].autoLayout;if(!Object.keys(next[nodeId]).length)delete next[nodeId];}projectState.setLayoutMetadata(next);return {current,previous};},revert(snapshot){restoreStyle(component,snapshot.current.style);for(const entry of snapshot.current.children){const child=component.components().models.find(item=>(item.get?.('formaNodeId')||item.cid)===entry.id);if(child)restoreStyle(child,entry.style);}projectState.setLayoutMetadata(snapshot.previous);}};
}
export function gridMetadataCommand(component,projectState,grid) {
  const nodeId=component?.get?.('formaNodeId');if(!nodeId)throw new Error('Grid needs a selected saved layer');
  const before=projectState.getLayoutMetadata(),next=copy(before);next[nodeId]={...(next[nodeId]||{})};if(grid)next[nodeId].grid={columns:Math.max(1,Math.min(24,Number(grid.columns)||12)),gutter:Math.max(0,Number(grid.gutter)||0),margin:Math.max(0,Number(grid.margin)||0),maxWidth:Math.max(0,Number(grid.maxWidth)||0),alignment:grid.alignment==='center'?'center':'stretch'};else{delete next[nodeId].grid;if(!Object.keys(next[nodeId]).length)delete next[nodeId];}
  return {id:grid?'apply-layout-grid':'remove-layout-grid',apply(){projectState.setLayoutMetadata(next);return before;},revert(previous){projectState.setLayoutMetadata(previous);}};
}
export function createGridOverlay({getSelected,projectState}) {
  let overlay;const remove=()=>{overlay?.remove();overlay=undefined;};
  const refresh=()=>{remove();const component=getSelected?.(),id=component?.get?.('formaNodeId'),grid=projectState.getLayoutMetadata()?.[id]?.grid,el=component?.view?.el;if(!grid||!el?.ownerDocument)return;const rect=el.getBoundingClientRect(),margin=Math.max(0,Number(grid.margin)||0),maxWidth=Math.max(0,Number(grid.maxWidth)||0),width=maxWidth?`min(calc(100% - ${margin*2}px), ${maxWidth}px)`:`calc(100% - ${margin*2}px)`,left=grid.alignment==='center'?'50%':`${margin}px`,transform=grid.alignment==='center'?'translateX(-50%)':'none';overlay=el.ownerDocument.createElement('div');overlay.dataset.formaEditorOverlay='grid';overlay.style.cssText=`position:fixed;pointer-events:none;z-index:2147483646;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;--columns:${grid.columns};--gutter:${grid.gutter}px;--grid-margin:${margin}px;--grid-max-width:${maxWidth}px;`;const columns=el.ownerDocument.createElement('div');columns.style.cssText=`position:absolute;top:0;bottom:0;left:${left};transform:${transform};width:${width};background:repeating-linear-gradient(90deg,rgba(148,112,239,.14) 0,rgba(148,112,239,.14) calc((100% - (var(--columns) - 1)*var(--gutter))/var(--columns)),transparent calc((100% - (var(--columns) - 1)*var(--gutter))/var(--columns)),transparent calc((100% - (var(--columns) - 1)*var(--gutter))/var(--columns) + var(--gutter)))`;overlay.append(columns);el.ownerDocument.body.append(overlay);};
  return {refresh,remove};
}
