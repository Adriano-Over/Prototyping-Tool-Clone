import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import { embeddedFontCss, readBundledDesignFonts } from './server-fonts.mjs';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const CSP="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'";
export async function findRenderBrowser(){
  const candidates=[process.env.FORMA_BROWSER,path.join(process.env.ProgramFiles||'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles||'C:/Program Files','Microsoft/Edge/Application/msedge.exe')].filter(Boolean);
  for(const candidate of candidates)try{await fs.access(candidate);return candidate;}catch{}
  throw Error('PNG and PDF export require Microsoft Edge or Chrome. Set FORMA_BROWSER to its executable path if it is installed elsewhere.');
}
function launch(executable,args){return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',data=>{error=(error+data.toString()).slice(-4000);});
  const timer=setTimeout(()=>{if(process.platform==='win32')spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');reject(Error('Design export timed out. Try fewer frames or a lower scale.'));},45000);timer.unref();
  child.once('error',reason=>{clearTimeout(timer);reject(reason);});child.once('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error('The rendering engine could not export this design. '+error.slice(-200)));});
});}
export function validateRenderRequest(value){
  if(!['png','pdf','svg'].includes(value.format)||!Array.isArray(value.documents)||!value.documents.length||value.documents.length>100)throw Error('Choose PNG, SVG or PDF and 1–100 frames.');
  const scale=Number(value.scale||1);if(![1,2,3,4].includes(scale))throw Error('Choose a 1×, 2×, 3× or 4× export scale.');
  for(const document of value.documents)if(typeof document.html!=='string'||document.html.length>50_000_000||!Number.isFinite(document.width)||!Number.isFinite(document.height)||document.width<1||document.height<1||document.width*scale>16384||document.height*scale>16384||document.width*document.height*scale*scale>64_000_000)throw Error('The exported image must fit within 16,384 pixels per side and 64 megapixels.');
  return {...value,scale};
}
export function createRenderService({assetService,root,zipFiles}){
  let queue=Promise.resolve(),waiting=0;
  async function render(input){
    const request=validateRenderRequest(input);if(waiting>=4)throw Error('The export queue is full. Try again shortly.');waiting++;
    const work=queue.catch(()=>{}).then(()=>produce(request));queue=work;try{return await work;}finally{waiting--;}
  }
  async function produce(request){
    const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'forma-render-'));
    try{
      const fonts = await readBundledDesignFonts(root, request.documents.map(({ html }) => html).join('\n'));
      const fontCss=`${embeddedFontCss(fonts)}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{margin:0;padding:0;background:${request.transparent?'transparent':'#ffffff'};overflow:hidden}`;
      const documents=[];for(const document of request.documents){const value=await assetService.portable({html:document.html,id:request.projectId});if(/(?:src=["']https?:|url\(["']?https?:)/i.test(value.html))throw Error('Import linked external images into the project before exporting.');documents.push({...document,html:value.html});}
      if(request.format==='svg'){
        const files=documents.map((document,index)=>({name:`${index+1}-${String(document.name||'frame').replace(/[^a-z0-9_-]+/gi,'-')}.svg`,data:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}"><title>${escape(document.name||'Design')}</title><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${fontCss}</style>${document.html}</div></foreignObject></svg>`)}));
        return files.length===1?{mime:'image/svg+xml',extension:'svg',bytes:files[0].data}:{mime:'application/zip',extension:'zip',bytes:zipFiles(files)};
      }
      const browser=await findRenderBrowser(),profile=path.join(temporary,'profile');
      const common=['--headless=new','--disable-gpu','--disable-gpu-compositing','--disable-features=Vulkan,UseSkiaRenderer','--no-sandbox','--no-first-run','--disable-background-networking','--disable-sync','--disable-extensions','--disable-component-update','--no-default-browser-check','--hide-scrollbars','--host-resolver-rules=MAP * ~NOTFOUND','--no-proxy-server',`--user-data-dir=${profile}`,'--virtual-time-budget=3000','--run-all-compositor-stages-before-draw'];
      const documentHtml=(body,css='')=>`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>${fontCss}${css}</style></head><body>${body}</body></html>`;
      if(request.format==='pdf'){
        const css=documents.map((document,index)=>`@page frame${index}{size:${document.width}px ${document.height}px;margin:0}.export-page-${index}{page:frame${index};position:relative;width:${document.width}px;height:${document.height}px;overflow:hidden;break-after:page}.export-page-${index}:last-child{break-after:auto}`).join('');
        const input=path.join(temporary,'design.html'),output=path.join(temporary,'design.pdf');await fs.writeFile(input,documentHtml(documents.map((document,index)=>`<section class="export-page-${index}">${document.html}</section>`).join(''),css));
        await launch(browser,[...common,'--no-pdf-header-footer',`--print-to-pdf=${output}`,pathToFileURL(input).href]);let bytes;try{bytes=await fs.readFile(output);}catch{throw Error('The rendering browser closed without producing a PDF. Install Google Chrome or set FORMA_BROWSER to its executable path.');}if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('The rendering engine produced an invalid PDF.');return {mime:'application/pdf',extension:'pdf',bytes};
      }
      const files=[];
      for(const [index,document] of documents.entries()){
        const input=path.join(temporary,`frame-${index}.html`),output=path.join(temporary,`frame-${index}.png`);await fs.writeFile(input,documentHtml(document.html,`html,body{width:${document.width}px;height:${document.height}px}`));
        await launch(browser,[...common,`--force-device-scale-factor=${request.scale}`,`--window-size=${Math.ceil(document.width)},${Math.ceil(document.height)}`,`--default-background-color=${request.transparent?'00000000':'ffffffff'}`,`--screenshot=${output}`,pathToFileURL(input).href]);
        let bytes;try{bytes=await fs.readFile(output);}catch{throw Error('The rendering browser closed without producing a PNG. Install Google Chrome or set FORMA_BROWSER to its executable path.');}if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('The rendering engine produced an invalid PNG.');files.push({name:`${index+1}-${String(document.name||'frame').replace(/[^a-z0-9_-]+/gi,'-')}.png`,data:bytes});
      }
      return files.length===1?{mime:'image/png',extension:'png',bytes:files[0].data}:{mime:'application/zip',extension:'zip',bytes:zipFiles(files)};
    }finally{if(path.dirname(path.resolve(temporary))===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('forma-render-'))await fs.rm(temporary,{recursive:true,force:true}).catch(()=>{});}
  }
  return {render};
}
