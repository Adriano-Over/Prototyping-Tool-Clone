export const MIN_ZOOM = 1;
export const MAX_ZOOM = 25600;
const MAX_FIT_ZOOM = MAX_ZOOM;
export const ZOOM_BUTTON_RATIO = 1.5;
export const WHEEL_ZOOM_SENSITIVITY = 0.002;

export function parseZoomInput(input) {
  const value=String(input??'').trim().toLowerCase();if(!value)return null;
  const multiplier=value.endsWith('x');const normalized=value.replace(/%|x$/g,'');const number=Number(normalized);
  if(!Number.isFinite(number)||number<=0)return null;
  return multiplier?number*100:number;
}

export function nextZoomPreset(value,direction) {
  const current=Number(value)||100;
  return Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,current*(direction>0?ZOOM_BUTTON_RATIO:1/ZOOM_BUTTON_RATIO)));
}

export function normalizeWheelDelta(event, viewportHeight=800, lineHeight=16) {
  const multiplier=event?.deltaMode===1?lineHeight:event?.deltaMode===2?viewportHeight:1;
  return Number(event?.deltaY||0)*multiplier;
}

export function zoomFromWheel(current,deltaY,sensitivity=WHEEL_ZOOM_SENSITIVITY) {
  const zoom=Number(current)*Math.exp(-Number(deltaY)*sensitivity);
  return Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom));
}

export function panByScreenDelta(coords,delta) {
  return {x:(Number(coords?.x)||0)+Number(delta?.x||0),y:(Number(coords?.y)||0)+Number(delta?.y||0)};
}

export function coordsAfterAnchoredZoom(coords,anchor,viewport,oldZoom,nextZoom) {
  const oldScale=Number(oldZoom)/100,nextScale=Number(nextZoom)/100;
  if(!(oldScale>0)||!(nextScale>0))throw new RangeError('zoom must be positive');
  const offset={x:anchor.x-(viewport.left+viewport.width/2),y:anchor.y-(viewport.top+viewport.height/2)},ratio=nextScale/oldScale;
  return {x:offset.x+(Number(coords?.x||0)-offset.x)*ratio,y:offset.y+(Number(coords?.y||0)-offset.y)*ratio};
}

export function visibleCanvasCenter(viewport,coords,zoom) {
  const scale=Number(zoom)/100;if(!(scale>0))throw new RangeError('zoom must be positive');
  return {x:Number(viewport.width)/2-(Number(coords?.x)||0)/scale,y:Number(viewport.height)/2-(Number(coords?.y)||0)/scale};
}

export function coordsAfterViewportResize(coords,oldSize,nextSize,zoom) {
  const scale=Number(zoom)/100;
  return {x:(Number(coords?.x)||0)+(Number(nextSize.width)-Number(oldSize.width))*scale/2,y:(Number(coords?.y)||0)+(Number(nextSize.height)-Number(oldSize.height))*scale/2};
}

export function formatZoomPercent(zoom) { return `${Math.round(Number(zoom))}%`; }

export function calculateCenterDelta(viewportRect, frameRect) {
  return {x:(viewportRect.left+viewportRect.width/2)-(frameRect.left+frameRect.width/2),y:(viewportRect.top+viewportRect.height/2)-(frameRect.top+frameRect.height/2)};
}

export function calculateCenteredCoords(coords, viewportRect, frameRect) {
  const delta=calculateCenterDelta(viewportRect,frameRect);
  return {x:(Number(coords?.x)||0)+delta.x,y:(Number(coords?.y)||0)+delta.y};
}

export function calculateFitZoom(viewport, frame, gap = 32) {
  const availableWidth = Math.max(1, Number(viewport?.width) - gap * 2);
  const availableHeight = Math.max(1, Number(viewport?.height) - gap * 2);
  const frameWidth = Math.max(1, Number(frame?.width));
  const frameHeight = Math.max(1, Number(frame?.height));
  const ratio = Math.min(availableWidth / frameWidth, availableHeight / frameHeight);
  return Math.max(MIN_ZOOM, Math.min(MAX_FIT_ZOOM, ratio * 100));
}

export function canvasRectToViewport(rect, iframe, scale) {
  return {left:iframe.left+rect.left*scale,top:iframe.top+rect.top*scale,width:rect.width*scale,height:rect.height*scale};
}

function fitViewport(rect, dock) {
  if(!dock?.width||!dock.height||dock.top<=rect.top+rect.height/2||dock.top>=rect.top+rect.height)return rect;
  return {left:rect.left,top:rect.top,width:rect.width,height:dock.top-rect.top};
}

export function createZoomController({ editor, panel, canvas, readout, getFrame, getFrameSize }) {
  let value = Number(editor.Canvas.getZoom?.()) || 75;
  let mode = 'fit';
  let resizeFrame = 0;
  let resizeObserver;

  const clamp = next => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(next)));
  const updateReadout = () => {
    const label=formatZoomPercent(value).slice(0,-1);
    if (readout) {
      if('value' in readout)readout.value=`${label}%`;else readout.textContent=`${label}%`;
      readout.setAttribute('aria-label', `Zoom ${label} percent`);
      readout.title = 'Enter a zoom from 1% to 25,600%';
    }
  };
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const getCanvasFrame=()=>editor.Canvas.getFrameEl?.()||canvas?.querySelector?.('iframe');
  const viewportBounds=target=>{
    const targetBox=target?.getBoundingClientRect?.(),iframe=getCanvasFrame(),iframeBox=iframe?.getBoundingClientRect?.();
    if(!targetBox)return iframeBox;
    if(!iframeBox||target.ownerDocument!==iframe?.contentDocument)return targetBox;
    const scale=(Number(editor.Canvas.getZoom?.())||value)/100;
    return canvasRectToViewport(targetBox,iframeBox,scale);
  };
  const activeFrameBounds=()=>viewportBounds(getFrame?.());
  const viewportSize=()=>({width:canvas?.clientWidth||0,height:canvas?.clientHeight||0});
  const fitBounds=()=>{
    const rect=canvas?.getBoundingClientRect?.();
    return rect?fitViewport(rect,panel?.querySelector?.('.tool-dock')?.getBoundingClientRect()):null;
  };
  const centerBounds=()=>mode==='fit'?fitBounds():canvas?.getBoundingClientRect?.();
  let lastViewportSize=viewportSize();
  const centerActiveFrame = () => {
    const viewport=centerBounds(),frame=activeFrameBounds();if(!viewport||!frame)return {x:0,y:0,distance:0};
    const delta=calculateCenterDelta(viewport,frame),coords=calculateCenteredCoords(editor.Canvas.getCoords?.(),viewport,frame);
    if(Math.abs(delta.x)>.5||Math.abs(delta.y)>.5)editor.Canvas.setCoords(coords.x,coords.y);
    return {...delta,distance:Math.hypot(delta.x,delta.y)};
  };
  const getCenterErrorPx=()=>{const viewport=centerBounds(),frame=activeFrameBounds();if(!viewport||!frame)return{x:0,y:0,distance:0};const delta=calculateCenterDelta(viewport,frame);return{...delta,distance:Math.hypot(delta.x,delta.y)};};
  const settleCenter=async()=>{await nextFrame();centerActiveFrame();await nextFrame();const error=getCenterErrorPx();if(error.distance>1){centerActiveFrame();console.debug('Forma zoom center correction',error);}updateReadout();return value;};
  const setZoom = (next, { manual = true } = {}) => {
    if (manual) mode = 'manual';
    const target=clamp(next),rect=canvas?.getBoundingClientRect?.();
    if(rect&&value>0){const coords=editor.Canvas.getCoords?.()||{x:0,y:0},center={x:rect.left+rect.width/2,y:rect.top+rect.height/2},nextCoords=coordsAfterAnchoredZoom(coords,center,rect,value,target);value=target;editor.Canvas.setZoom(value);editor.Canvas.setCoords(nextCoords.x,nextCoords.y);updateReadout();void settleCenter();return value;}
    value=target;editor.Canvas.setZoom(value);updateReadout();return value;
  };
  const zoomBy = direction => setZoom(nextZoomPreset(value,direction));
  const zoomAt = (next,point) => {
    const view=canvas?.getBoundingClientRect?.();if(!view){setZoom(next);return;}
    const anchor={x:Number(point?.x??(view.left+view.width/2)),y:Number(point?.y??(view.top+view.height/2))},coords=editor.Canvas.getCoords?.()||{x:0,y:0},target=clamp(next),nextCoords=coordsAfterAnchoredZoom(coords,anchor,view,value,target);
    mode='manual';value=target;editor.Canvas.setZoom(value);editor.Canvas.setCoords(nextCoords.x,nextCoords.y);updateReadout();
  };
  const fit = () => {
    mode = 'fit';
    const element = getFrame?.();
    const canvasBox = fitBounds();
    const frameBox = element?.getBoundingClientRect();
    if (!canvasBox || !frameBox) return;
    const viewport = { width: canvasBox.width, height: canvasBox.height };
    const measured = getFrameSize?.(element);
    const size = {
      width: Number(measured?.width) || frameBox.width,
      height: Number(measured?.height) || frameBox.height,
    };
    const fitGap = 36;
    const target = calculateFitZoom(viewport, size, fitGap);
    // Use the same measured frame dimensions for both zoom and centering.
    // GrapesJS fitViewport can fit the iframe viewport instead of a tall
    // nested frame, leaving the page visibly cropped at Fit page zoom.
    editor.Canvas.setZoom(target);
    value=Number(editor.Canvas.getZoom?.())||target;
    lastViewportSize=viewportSize();
    updateReadout();
    settleCenter();
  };
  const fitSelection = getSelection => {
    const selection=typeof getSelection==='function'?getSelection():null,element=selection?.view?.el,view=fitBounds();
    if(!element||!view)return false;
    const box=viewportBounds(element);
    if(!box?.width||!box.height)return false;
    const factor=value/100,available={width:view.width,height:view.height};
    const target=calculateFitZoom(available,{width:box.width/factor,height:box.height/factor},36);
    mode='manual';editor.Canvas.setZoom(target);value=target;updateReadout();
    requestAnimationFrame(()=>{
      const next=viewportBounds(element),liveView=fitBounds();
      if(next&&liveView){
        const coords=calculateCenteredCoords(editor.Canvas.getCoords?.(),liveView,next);
        editor.Canvas.setCoords(coords.x,coords.y);
      }
      updateReadout();
    });
    return true;
  };
  const refitIfNeeded = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(()=>{
      const next=viewportSize();
      if(mode==='fit')fit();
      else if(next&&lastViewportSize){const coords=editor.Canvas.getCoords?.()||{x:0,y:0},nextCoords=coordsAfterViewportResize(coords,lastViewportSize,next,value);editor.Canvas.setCoords(nextCoords.x,nextCoords.y);updateReadout();}
      lastViewportSize=next;
    });
  };

  document.getElementById('zoom-in')?.addEventListener('click', () => zoomBy(1));
  document.getElementById('zoom-out')?.addEventListener('click', () => zoomBy(-1));
  const commitInput=()=>{const parsed=parseZoomInput(readout?.value);if(parsed===null)updateReadout();else setZoom(parsed);};
  readout?.addEventListener('change',commitInput);
  readout?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commitInput();readout.blur();}if(event.key==='Escape'){updateReadout();readout.blur();}});
  let wheelDelta=0,wheelAnchor=null,wheelFrame=0;
  const handleWheel=(event,offset={x:0,y:0})=>{
    event.preventDefault();event.stopImmediatePropagation();
    if(event.ctrlKey||event.metaKey){wheelDelta+=normalizeWheelDelta(event,canvas.clientHeight);wheelAnchor={x:event.clientX+offset.x,y:event.clientY+offset.y};if(!wheelFrame)wheelFrame=requestAnimationFrame(()=>{wheelFrame=0;const delta=wheelDelta,anchor=wheelAnchor;wheelDelta=0;wheelAnchor=null;zoomAt(zoomFromWheel(value,delta),anchor);});}
    else {const coords=editor.Canvas.getCoords?.()||{x:0,y:0},factor=event.deltaMode===1?16:event.deltaMode===2?(canvas.clientHeight||800):1;editor.Canvas.setCoords(coords.x-event.deltaX*factor,coords.y-event.deltaY*factor);mode='manual';}
  };
  canvas?.addEventListener('wheel',event=>handleWheel(event),{passive:false,capture:true});
  canvas?.addEventListener('pointerdown',event=>{if(event.button===0)mode='manual';},{capture:true});
  editor.on?.('canvas:frame:load',({window:frameWindow})=>{
    const frame=frameWindow?.frameElement,offset=()=>{const rect=frame?.getBoundingClientRect?.();return{x:rect?.left||0,y:rect?.top||0};};
    frameWindow?.document?.addEventListener('pointerdown',event=>{if(event.button===0)mode='manual';},{capture:true});
    frameWindow?.document?.addEventListener('wheel',event=>handleWheel(event,offset()),{passive:false,capture:true});
    const pointers=new Map();let pinchDistance=0;
    frameWindow?.document?.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2){event.preventDefault();const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);mode='manual';}},{capture:true});
    frameWindow?.document?.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId)||pointers.size!==2)return;event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>0&&pinchDistance>0){const rect=frame?.getBoundingClientRect?.(),base=pinchDistance;pinchDistance=distance;const anchor={x:(a.x+b.x)/2+(rect?.left||0),y:(a.y+b.y)/2+(rect?.top||0)};zoomAt(value*(distance/base),anchor);}},{passive:false,capture:true});
    const clearPointer=event=>{pointers.delete(event.pointerId);if(pointers.size<2)pinchDistance=0;};['pointerup','pointercancel'].forEach(name=>frameWindow?.document?.addEventListener(name,clearPointer,{capture:true}));
  });

  if (panel && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(refitIfNeeded);
    resizeObserver.observe(panel);if(canvas)resizeObserver.observe(canvas);
  }
  window.addEventListener('resize', refitIfNeeded);
  updateReadout();

  return {
    fit,
    fitSelection,
    setZoom,
    zoomBy,
    zoomAt,
    getCanvasCenter() { return visibleCanvasCenter(viewportSize(),editor.Canvas.getCoords?.()||{x:0,y:0},value); },
    manualPan() { mode='manual'; },
    centerActiveFrame,
    getCenterErrorPx,
    pageChanged: refitIfNeeded,
    get value() { return value; },
    get mode() { return mode; },
    destroy() {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', refitIfNeeded);
      cancelAnimationFrame(resizeFrame);
    },
  };
}
