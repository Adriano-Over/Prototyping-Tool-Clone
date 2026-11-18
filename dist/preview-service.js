import { bundledFontRules, bundledFontStylesheet, fontCssWithUrl, inlineBundledFontStylesheet } from './bundled-fonts.js';

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
export function createPreviewService({dialog,content,title,buildDocument,width=1366,height=940}) {
  let observer, stylesheetPromise;
  const fontUrls = new Map();
  const cachedFetch = async (url, read) => {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw Error(`Could not load local preview font (${response.status})`);
    return response[read]();
  };
  const previewFonts = async html => {
    try {
      stylesheetPromise ??= cachedFetch(bundledFontStylesheet, 'text');
      const rules = bundledFontRules(await stylesheetPromise, html);
      const css = await Promise.all(rules.map(entry => {
        if (!fontUrls.has(entry.file)) fontUrls.set(entry.file, cachedFetch(`/vendor/${entry.file}`, 'arrayBuffer').then(fontBytesToDataUri));
        return fontUrls.get(entry.file).then(url => fontCssWithUrl(entry, url));
      }));
      return inlineBundledFontStylesheet(html, css.join('\n'));
    } catch {
      stylesheetPromise = undefined;
      fontUrls.clear();
      return html;
    }
  };
  const close=()=>{observer?.disconnect();observer=undefined;dialog?.close?.();};
  const open=async()=>{if(!dialog||!content)return;title.textContent='Design preview';content.replaceChildren();content.style.position='relative';content.style.overflow='hidden';const frame=document.createElement('iframe');frame.title='Design preview';frame.setAttribute('sandbox','allow-scripts allow-modals allow-forms allow-popups');frame.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px;max-width:none;border:0;transform-origin:top left;background:#f0f1f0`;const fit=()=>{const scale=Math.min(content.clientWidth/width,content.clientHeight/height,1);frame.style.transform=`translate(${Math.max(0,(content.clientWidth-width*scale)/2)}px,${Math.max(0,(content.clientHeight-height*scale)/2)}px) scale(${scale})`;};const html=await buildDocument();frame.srcdoc=preparePreviewDocument(await previewFonts(html));content.append(frame);dialog.showModal();requestAnimationFrame(fit);observer?.disconnect();observer=new ResizeObserver(fit);observer.observe(content);return frame;};
  return {open,close};
}
