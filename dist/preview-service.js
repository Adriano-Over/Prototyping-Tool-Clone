export function isSafePrototypeUrl(value) {
  try { const url=new URL(String(value||''),globalThis.location?.href||'http://localhost/');return ['http:','https:'].includes(url.protocol); } catch { return false; }
}
export function preparePreviewDocument(html) {
  const scrolling='<style id="forma-preview-scrolling">html{height:100%!important;min-height:100%;overflow-x:hidden!important;overflow-y:auto!important}body{height:auto!important;min-height:100%;overflow-x:hidden!important;overflow-y:visible!important}.forma-preview-stage{height:auto!important;min-height:100vh}</style>';
  return String(html).replace(/<\/head>/i,`${scrolling}</head>`);
}
export function fontBytesToDataUri(bytes) {
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  let binary='';
  for(let offset=0;offset<data.length;offset+=0x8000)binary+=String.fromCharCode(...data.subarray(offset,offset+0x8000));
  return `data:font/ttf;base64,${btoa(binary)}`;
}
export function inlinePreviewInterFont(html,dataUri) {
  const source=String(html),link=/<link\b(?=[^>]*\bhref=["']\/vendor\/inter\.css["'])[^>]*>/i;
  if(!dataUri||!link.test(source))return source;
  const font=`<style id="forma-preview-inter-font">@font-face{font-family:Inter;src:url("${dataUri}") format("truetype");font-weight:100 900;font-style:normal;font-display:swap}</style>`;
  return source.replace(link,font);
}
export function createPreviewService({dialog,content,title,buildDocument,width=1366,height=940}) {
  let observer,interFontPromise;
  const interFont=()=>{
    if(!interFontPromise)interFontPromise=fetch('/vendor/Inter-Variable.ttf',{cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error(`Inter font request failed (${response.status})`);return response.arrayBuffer();}).then(fontBytesToDataUri).catch(()=>null);
    return interFontPromise;
  };
  const close=()=>{observer?.disconnect();observer=undefined;dialog?.close?.();};
  const open=async()=>{if(!dialog||!content)return;title.textContent='Design preview';content.replaceChildren();content.style.position='relative';content.style.overflow='hidden';const frame=document.createElement('iframe');frame.title='Design preview';frame.setAttribute('sandbox','allow-scripts allow-modals allow-forms allow-popups');frame.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px;max-width:none;border:0;transform-origin:top left;background:#f0f1f0`;const fit=()=>{const scale=Math.min(content.clientWidth/width,content.clientHeight/height,1);frame.style.transform=`translate(${Math.max(0,(content.clientWidth-width*scale)/2)}px,${Math.max(0,(content.clientHeight-height*scale)/2)}px) scale(${scale})`;};const [html,font]=await Promise.all([buildDocument(),interFont()]);frame.srcdoc=preparePreviewDocument(inlinePreviewInterFont(html,font));content.append(frame);dialog.showModal();requestAnimationFrame(fit);observer?.disconnect();observer=new ResizeObserver(fit);observer.observe(content);return frame;};
  return {open,close};
}
