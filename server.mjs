import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createAssetService } from './server-assets.mjs';
import { createWorkspaceService } from './workspace-service.mjs';
import { createRenderService } from './render-service.mjs';
import { importFigProject } from './fig-import.mjs';
import { embeddedFontCss, readBundledDesignFonts } from './server-fonts.mjs';
import { bundledFontStylesheet, fontCssWithUrl, inlineBundledFontStylesheet } from './dist/bundled-fonts.js';

const root = path.resolve('dist');
const projectsRoot = path.resolve('GrapesJS', 'projects');
const exportsRoot = path.resolve('GrapesJS', 'exports');
const port = Math.max(1, Math.min(65535, Number(process.argv[2] || process.env.PORT || 5173)));
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ttf':'font/ttf','.zip':'application/zip'};
await fsp.mkdir(projectsRoot, { recursive: true });
await fsp.mkdir(exportsRoot, { recursive: true });
const boundedPath=(directory,id)=>{const target=path.resolve(directory,id);if(!id||!/^[a-z0-9-]+$/.test(id)||!target.startsWith(directory+path.sep))throw new Error('Invalid project path');return target;};
const projectDir = id => boundedPath(projectsRoot,id);
const projectFile = id => path.join(projectDir(id),'project.json');
const legacyProjectFile = id => path.join(projectsRoot,id+'.json');
const versionsDir = id => path.join(projectDir(id),'versions');
const versionIndexFile = id => path.join(versionsDir(id),'index.json');
const sessionToken=crypto.randomBytes(32).toString('hex');
const writeQueues=new Map();
let projectMutation=Promise.resolve();
function mutateProject(work){const next=projectMutation.catch(()=>{}).then(work);projectMutation=next;return next;}

async function writeAtomic(file, data) {
  const previous=writeQueues.get(file)||Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    await fsp.mkdir(path.dirname(file),{recursive:true});
    const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{await fsp.writeFile(temp,data);await fsp.rename(temp,file);}finally{await fsp.unlink(temp).catch(()=>{});}
  });
  writeQueues.set(file,next);try{await next;}finally{if(writeQueues.get(file)===next)writeQueues.delete(file);}
}
const assetService=createAssetService({projectsRoot,writeAtomic});
async function readProjectFile(id) {
  for(const file of [projectFile(id),legacyProjectFile(id)]){try{return JSON.parse(await fsp.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}}
  const error=new Error('Project not found');error.code='ENOENT';throw error;
}

const sendJson = (res, status, value) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
};

const safeId = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const safeOpaqueId = value => String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,120);
const editorData = value => value?.editor?.grapesjs || value?.data || value;
const emptyForma = () => ({components:[],variables:{mode:'light',modes:{light:{},dark:{}}},comments:{},prototype:{},layoutMetadata:{},scene:null,importSources:[]});

function normalizeProject(value, id, name) {
  const data = editorData(value);
  if (!Array.isArray(data?.pages) || !data.pages.length) throw new Error('Invalid GrapesJS project');
  if (value?.format === 'forma-project' && Number(value.schemaVersion) > 3) throw new Error(`Unsupported project schema ${value.schemaVersion}`);
  const timestamp = new Date().toISOString();
  const forma=value?.forma&&typeof value.forma==='object'?value.forma:emptyForma();
  return {
    format:'forma-project', schemaVersion:3, id,
    name:String(name || value?.name || 'Untitled project').slice(0,120),
    createdAt:value?.createdAt || value?.updatedAt || timestamp,
    updatedAt:timestamp,
    editor:{grapesjs:data},
    forma:{...emptyForma(),...forma,scene:forma.scene&&typeof forma.scene==='object'&&!Array.isArray(forma.scene)?forma.scene:null,importSources:Array.isArray(forma.importSources)?forma.importSources:[]},
    assets:Array.isArray(value?.assets) ? value.assets : [],
  };
}

async function readBody(req) {
  return JSON.parse((await readBytes(req,256_000_000)).toString('utf8')||'{}');
}

async function readBytes(req, limit = 30_000_000) {
  const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>limit)throw new Error('Uploaded file is too large');chunks.push(chunk);}return Buffer.concat(chunks);
}

async function projectList() {
  const entries = await fsp.readdir(projectsRoot, { withFileTypes: true });
  const ids=new Set(entries.filter(entry=>entry.isDirectory()).map(entry=>entry.name));
  entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).forEach(entry=>ids.add(entry.name.slice(0,-5)));
  const projects = [];
  for (const id of ids) {
    try {
      const fullPath = fs.existsSync(projectFile(id))?projectFile(id):legacyProjectFile(id);
      const value = JSON.parse(await fsp.readFile(fullPath, 'utf8'));
      const stat = await fsp.stat(fullPath);
      const data=editorData(value);
      projects.push({ id, name:value.name || id, updatedAt:value.updatedAt || stat.mtime.toISOString(), pages:Array.isArray(data?.pages) ? data.pages.length : 0 });
    } catch {}
  }
  return projects.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

const workspaceService=await createWorkspaceService({directory:path.resolve('GrapesJS','workspace'),writeAtomic,readBody,sendJson});
const renderService=createRenderService({assetService,root,zipFiles});
const crcTable = Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32 = buffer => {let crc=0xffffffff;for(const byte of buffer)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
const u16 = value => {const b=Buffer.alloc(2);b.writeUInt16LE(value&0xffff);return b;};
const u32 = value => {const b=Buffer.alloc(4);b.writeUInt32LE(value>>>0);return b;};
function zipFiles(files) {
  const locals=[],centrals=[];let offset=0;const now=new Date();
  const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
  const dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const file of files){const name=Buffer.from(file.name.replace(/\\/g,'/'));const data=Buffer.isBuffer(file.data)?file.data:Buffer.from(file.data);const crc=crc32(data);const local=Buffer.concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);locals.push(local);centrals.push(Buffer.concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));offset+=local.length;}
  const central=Buffer.concat(centrals);return Buffer.concat([...locals,central,u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(offset),u16(0)]);
}

function collectTokens(value, result={colors:new Set(),fonts:new Set(),fontSizes:new Set(),spacing:new Set(),radii:new Set(),shadows:new Set()}) {
  if(Array.isArray(value)){value.forEach(item=>collectTokens(item,result));return result;}
  if(!value||typeof value!=='object')return result;
  for(const [key,item] of Object.entries(value)){
    if(typeof item==='string'){
      const lower=key.toLowerCase();
      for(const match of item.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi))result.colors.add(match[0]);
      if(lower.includes('font-family'))result.fonts.add(item);
      if(lower.includes('font-size'))result.fontSizes.add(item);
      if(['left','top','right','bottom','width','height','padding','margin','gap'].some(term=>lower.includes(term))&&/^-?[\d.]+(?:px|rem|em|%)$/.test(item))result.spacing.add(item);
      if(lower.includes('radius'))result.radii.add(item);
      if(lower.includes('shadow'))result.shadows.add(item);
    } else collectTokens(item,result);
  }
  return result;
}

function collectDataAssets(value, found=new Map()) {
  if(Array.isArray(value)){value.forEach(item=>collectDataAssets(item,found));return found;}
  if(!value||typeof value!=='object')return found;
  for(const item of Object.values(value)){
    if(typeof item==='string'){
      const sources=item.startsWith('data:image/')?[item]:[...item.matchAll(/data:image\/(?:png|jpeg|webp|gif|svg\+xml)(?:;base64)?,[^\s"'<>)]*/g)].map(match=>match[0]);
      for(const source of sources){const match=source.match(/^data:([^;,]+)(;base64)?,(.*)$/s);if(!match)continue;
      const bytes=match[2]?Buffer.from(match[3],'base64'):Buffer.from(decodeURIComponent(match[3]));const hash=crypto.createHash('sha256').update(bytes).digest('hex');const ext=({'image/svg+xml':'svg','image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[match[1]]||'bin';const file=`${hash}.${ext}`;const asset=found.get(file)||{mime:match[1],bytes,sources:new Set()};asset.sources.add(source);found.set(file,asset);}
    }else collectDataAssets(item,found);
  }
  return found;
}
function rewriteBundleAssets(value,assets){
  if(typeof value==='string'){for(const [file,asset] of assets)for(const source of asset.sources)value=value.split(source).join('assets/'+file);return value;}
  if(Array.isArray(value))return value.map(item=>rewriteBundleAssets(item,assets));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewriteBundleAssets(item,assets)]));
  return value;
}

function flattenComponents(value, output=[],parent=null,page=null) {
  if(Array.isArray(value)){value.forEach(item=>flattenComponents(item,output,parent,page));return output;}
  if(!value||typeof value!=='object')return output;
  const name=value.name||value.type||value.tagName;
  if(name){const id=value.componentId||value.id||`node-${output.length+1}`;output.push({id,parent,page,name,type:value.type||value.tagName||'component',content:typeof value.content==='string'?value.content.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():undefined,style:value.style||{},attributes:value.attributes||{}});parent=id;}
  const children=value.components||value.component||value.frames;if(children)flattenComponents(children,output,parent,page);
  return output;
}

async function createAiBundle(value) {
  if(!value.project?.pages?.length||typeof value.html!=='string'||typeof value.css!=='string')throw new Error('Incomplete project export');
  value=await assetService.portable(value,value.id);
  const id=safeId(value.id||value.name)||'untitled-project';const name=String(value.name||'Untitled project').slice(0,120);const createdAt=new Date().toISOString();
  const folder=boundedPath(exportsRoot,id);await fsp.rm(folder,{recursive:true,force:true});await fsp.mkdir(path.join(folder,'assets'),{recursive:true});
  const tokensRaw=collectTokens(value.project);const tokens=Object.fromEntries(Object.entries(tokensRaw).map(([key,set])=>[key,[...set].sort()]));
  const assets=collectDataAssets(value);value=rewriteBundleAssets(value,assets);
  const nodes=[];(value.project.pages||[]).forEach((page,index)=>flattenComponents(page.frames||page.component||page.components,nodes,null,page.name||page.id||`Page ${index+1}`));
  const assetIndex=[];for(const [file,asset] of assets){await fsp.writeFile(path.join(folder,'assets',file),asset.bytes);assetIndex.push({file,mime:asset.mime,bytes:asset.bytes.length,sha256:file.split('.')[0]});}
  const manifest={format:'forma-ai-recreation-bundle',version:2,name,id,createdAt,source:'GrapesJS 0.23.6 + Forma Workbench',purpose:'Framework-neutral source of truth for recreating this design in any programming language or UI framework.',canvas:{pages:value.project.pages.length},counts:{components:nodes.length,assets:assetIndex.length},files:{instructions:'AI-RECREATION.md',preview:'preview.html',html:'document.html',css:'styles.css',project:'project.grapesjs.json',components:'component-tree.json',tokens:'design-tokens.json',workbench:'workbench-data.json',assets:'assets/index.json'}};
  const bundledFonts = await readBundledDesignFonts(root, `${value.html}\n${value.css}`);
  const fontLicenses = { 'Oswald-Variable.ttf': 'LICENSE.Oswald.txt', 'HappyMonkey-Regular.ttf': 'LICENSE.HappyMonkey.txt', 'RobotoMono-Variable.ttf': 'LICENSE.RobotoMono.txt' };
  const fontFiles = [];
  const fontCss = bundledFonts.map(font => fontCssWithUrl(font, `assets/fonts/${font.file}`)).join('\n');
  await fsp.mkdir(path.join(folder,'assets','fonts'),{recursive:true});
  for (const { file, bytes } of bundledFonts) {
    fontFiles.push({ file, bytes });
    const license = fontLicenses[file];
    if (license) fontFiles.push({ file: license, bytes: await fsp.readFile(path.join(root, 'vendor', license)) });
    assetIndex.push({ file: `fonts/${file}`, mime: 'font/ttf', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12) });
  }
  for (const { file, bytes } of fontFiles) await fsp.writeFile(path.join(folder, 'assets', 'fonts', file), bytes);
  manifest.counts.assets=assetIndex.length;manifest.files.fonts='fonts.css';
  const previewBody=/^\s*<body[\s>]/i.test(value.html)?value.html:`<body>${value.html}</body>`;
  const preview=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name.replace(/[&<>]/g,'')}</title><style>${fontCss}${value.css}</style></head>${previewBody}</html>`;
  const instructions=`# AI recreation instructions: ${name}\n\nThis bundle is a framework-neutral source of truth. Recreate the project in the language or framework requested by the user while preserving its rendered appearance and behavior.\n\n## Source priority\n\n1. Open \`preview.html\` to see the canonical rendered output.\n2. Use \`component-tree.json\` for hierarchy, names, text, attributes, bounds, and per-node styles.\n3. Use \`design-tokens.json\` for the exact visual vocabulary.\n4. Use \`styles.css\` and \`document.html\` for browser-level implementation details.\n5. Use \`project.grapesjs.json\` when a lower-level value is missing elsewhere.\n\n## Required fidelity\n\n- Preserve every page, visible component, text string, hierarchy, size, position, spacing, color, border, radius, shadow, opacity, and typography value.\n- Preserve layer order and clipping. Treat absolute pixel coordinates as intentional unless the target platform requires a responsive translation.\n- Preserve the initial viewport and canvas dimensions described in the component tree.\n- Reuse the files in \`assets/\` where possible. Embedded source values remain in the GrapesJS project as a fallback.\n- Do not invent content, interactions, routes, states, or design changes.\n- Translate implementation patterns into native idioms for the requested language while keeping the output visually equivalent.\n\n## Agent workflow\n\n1. Inventory pages and components from \`component-tree.json\`.\n2. Establish global tokens before implementing components.\n3. Rebuild the component hierarchy and content.\n4. Implement layout from parent to child using the recorded bounds and styles.\n5. Add assets and typography.\n6. Render at the reference dimensions and compare with \`preview.html\`.\n7. Correct visual differences until component geometry, colors, and text match.\n8. Report any target-platform limitation explicitly; do not silently approximate it.\n\n## Acceptance checklist\n\n- Every page and component exists.\n- Text content and capitalization match exactly.\n- Geometry and layer order match.\n- Colors, typography, strokes, radii, effects, and opacity match.\n- Assets load locally from this bundle.\n- The target project runs with documented commands and has no missing placeholders.\n`;
  const workbenchInstructions=`\n## Forma Workbench data\n\nRead \`workbench-data.json\` for explicit design variables and modes, reusable local components, comments and annotations, prototype metadata, and named version snapshots. Preserve these behaviors and product notes when the target language supports them.\n`;
  const readme=`# ${name} — AI recreation bundle\n\nGive this entire folder or ZIP file to an AI coding agent together with the language or framework you want. Tell it to follow \`AI-RECREATION.md\`.\n\nStart with \`preview.html\` for the visual reference and \`manifest.json\` for the file map. The design source, instructions, styles, component data, Workbench metadata, embedded images, and Inter font are included locally.\n`;
  const files=[['manifest.json',JSON.stringify(manifest,null,2)],['README.md',readme],['AI-RECREATION.md',instructions+workbenchInstructions],['project.grapesjs.json',JSON.stringify(value.project,null,2)],['component-tree.json',JSON.stringify({project:name,generatedAt:createdAt,nodes},null,2)],['design-tokens.json',JSON.stringify(tokens,null,2)],['workbench-data.json',JSON.stringify(value.workbench||{},null,2)],['document.html',value.html],['styles.css',value.css],['fonts.css',fontCss],['preview.html',preview],['assets/index.json',JSON.stringify(assetIndex,null,2)]];
  for(const [file,data] of files){const target=path.join(folder,file);await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.writeFile(target,data,'utf8');}
  const zipEntries=files.map(([file,data])=>({name:`${id}-ai-recreation/${file}`,data}));for(const [file,asset] of assets)zipEntries.push({name:`${id}-ai-recreation/assets/${file}`,data:asset.bytes});for (const { file, bytes } of fontFiles) zipEntries.push({name:`${id}-ai-recreation/assets/fonts/${file}`,data:bytes});
  const zipPath=path.join(exportsRoot,`${id}-ai-recreation.zip`);await fsp.writeFile(zipPath,zipFiles(zipEntries));
  return {id,name,createdAt,folder,zip:zipPath,download:`/api/exports/${encodeURIComponent(id)}/download`,files:files.map(([file])=>file),assets:assetIndex.length,components:nodes.length};
}

const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]);
    if(!hosts.has(req.headers.host))return sendJson(res,403,{error:'Invalid local service host'});
    const origin=`http://${req.headers.host}`;
    if(req.headers.origin&&req.headers.origin!==origin)return sendJson(res,403,{error:'Cross-origin requests are not allowed'});
    const url = new URL(req.url, 'http://127.0.0.1');
    if(url.pathname.startsWith('/api/')){
      const readOnly=['GET','HEAD'].includes(req.method);
      if(req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site'])&& !(readOnly&&req.headers['sec-fetch-dest']==='image'))return sendJson(res,403,{error:'Cross-origin requests are not allowed'});
      if(!readOnly&&req.headers['x-forma-token']!==sessionToken)return sendJson(res,403,{error:'Local session expired. Retry the operation.'});
      if(!readOnly&&!url.pathname.match(/\/assets$/)&&url.pathname!=='/api/import/fig'&&String(req.headers['content-type']||'').split(';')[0]!=='application/json')return sendJson(res,415,{error:'Expected application/json'});
    }
    if(url.pathname==='/api/session'&&req.method==='GET')return sendJson(res,200,{token:sessionToken});
    if(url.pathname.startsWith('/api/workspace/'))return await workspaceService.handle(req,res,url);
    if(url.pathname==='/api/render'&&req.method==='POST'){
      try{const value=await renderService.render(await readBody(req));res.writeHead(200,{'Content-Type':value.mime,'Content-Disposition':`attachment; filename="design.${value.extension}"`,'Content-Length':value.bytes.length});return res.end(value.bytes);}catch(error){return sendJson(res,400,{error:error.message});}
    }
    if(url.pathname==='/api/portable'&&req.method==='POST'){
      const value=await assetService.portable(await readBody(req));
      if(typeof value.html==='string'&&value.html.includes(bundledFontStylesheet)){
        const fonts = await readBundledDesignFonts(root, value.html);
        value.html = inlineBundledFontStylesheet(value.html, embeddedFontCss(fonts));
      }
      return sendJson(res,200,value);
    }
    if (url.pathname === '/api/projects' && req.method === 'GET') return sendJson(res, 200, { folder:projectsRoot, projects:await projectList() });
    if (url.pathname === '/api/import/fig' && req.method === 'POST') {
      try {
        const bytes=await readBytes(req,200*1024*1024);
        let filename='Imported Figma design';
        try { filename=decodeURIComponent(String(req.headers['x-file-name']||filename)); } catch {}
        return sendJson(res,200,importFigProject(bytes,filename));
      } catch(error) {
        return sendJson(res,400,{error:error.message||'This Figma file could not be imported.'});
      }
    }
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      return await mutateProject(async()=>{
      const value = await readBody(req);
      const data=editorData(value);
      if (!data?.pages?.length) return sendJson(res, 400, { error:'Invalid GrapesJS project' });
      let id = safeId(value.id || value.name) || 'untitled-project';
      if (!value.id) {
        let candidate = id, number = 2;
        while (fs.existsSync(projectFile(candidate)) || fs.existsSync(legacyProjectFile(candidate))) {const suffix='-'+number++;candidate=id.slice(0,80-suffix.length)+suffix;}
        id = candidate;
      }
      let existing;try{existing=await readProjectFile(id);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(existing&&Number(value.baseRevision)!==Number(existing.revision||0))return sendJson(res,409,{error:'This project changed on disk. Reopen it before saving. Your browser recovery copy has been preserved.',code:'REVISION_CONFLICT'});
      const saved = await assetService.materialize(normalizeProject(value,id,value.name),id);
      saved.revision=Number(existing?.revision||0)+1;
      await writeAtomic(projectFile(id),JSON.stringify(saved,null,2));
      return sendJson(res, 200, { id, name:saved.name, updatedAt:saved.updatedAt, revision:saved.revision, folder:projectsRoot });
      });
    }
    const assetMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/assets(?:\/([^/]+))?$/);
    if(assetMatch&&req.method==='POST'&&!assetMatch[2]){
      return await mutateProject(async()=>{
      const id=safeId(decodeURIComponent(assetMatch[1]));if(!id)return sendJson(res,400,{error:'Invalid project id'});
      await readProjectFile(id);const mime=String(req.headers['content-type']||'').split(';')[0];const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'})[mime];if(!ext)return sendJson(res,415,{error:'Unsupported image type'});
      const bytes=await readBytes(req);const sha256=crypto.createHash('sha256').update(bytes).digest('hex');const assetId='asset_'+sha256.slice(0,20);const relativePath=`assets/${assetId}.${ext}`;const target=path.join(projectDir(id),relativePath);if(!fs.existsSync(target))await writeAtomic(target,bytes);
      return sendJson(res,200,{id:assetId,relativePath,mime,sha256,bytes:bytes.length,name:decodeURIComponent(String(req.headers['x-file-name']||'image'))});
      });
    }
    if(assetMatch&&req.method==='GET'&&assetMatch[2]){
      const id=safeId(decodeURIComponent(assetMatch[1])),assetId=safeOpaqueId(decodeURIComponent(assetMatch[2]));try{const data=await assetService.readAsset(id,assetId),match=data.match(/^data:([^;]+);base64,(.*)$/s),bytes=Buffer.from(match[2],'base64');if(match[1]==='image/svg+xml')res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'");res.writeHead(200,{'Content-Type':match[1],'Content-Length':bytes.length,'Cache-Control':'private, max-age=31536000, immutable'});res.end(bytes);return;}catch{return sendJson(res,404,{error:'Asset file is missing or invalid'});}
    }
    const versionMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/versions(?:\/([^/]+))?$/);
    if(versionMatch&&req.method==='GET'){
      const id=safeId(decodeURIComponent(versionMatch[1])),versionId=versionMatch[2]&&safeOpaqueId(decodeURIComponent(versionMatch[2]));if(versionId){try{return sendJson(res,200,JSON.parse(await fsp.readFile(path.join(versionsDir(id),versionId+'.json'),'utf8')));}catch(error){return sendJson(res,error.code==='ENOENT'?404:500,{error:'Version could not be opened'});}}
      try{return sendJson(res,200,JSON.parse(await fsp.readFile(versionIndexFile(id),'utf8')));}catch(error){if(error.code==='ENOENT')return sendJson(res,200,{versions:[]});throw error;}
    }
    if(versionMatch&&req.method==='POST'&&!versionMatch[2]){
      return await mutateProject(async()=>{
      const id=safeId(decodeURIComponent(versionMatch[1]));const value=await readBody(req);const project=normalizeProject(value.project||value,id,value.project?.name||value.name);const versionId=`version_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;const record={id:versionId,name:String(value.name||'Version').slice(0,120),createdAt:new Date().toISOString(),schemaVersion:3,file:versionId+'.json'};await writeAtomic(path.join(versionsDir(id),record.file),JSON.stringify(project,null,2));let index={versions:[]};try{index=JSON.parse(await fsp.readFile(versionIndexFile(id),'utf8'));}catch{}index.versions.unshift(record);await writeAtomic(versionIndexFile(id),JSON.stringify(index,null,2));return sendJson(res,200,record);
      });
    }
    if(versionMatch&&req.method==='DELETE'&&versionMatch[2]){
      return await mutateProject(async()=>{
      const id=safeId(decodeURIComponent(versionMatch[1])),versionId=safeOpaqueId(decodeURIComponent(versionMatch[2]));let index={versions:[]};try{index=JSON.parse(await fsp.readFile(versionIndexFile(id),'utf8'));}catch{}const record=index.versions.find(item=>item.id===versionId);if(!record)return sendJson(res,404,{error:'Version not found'});await fsp.unlink(path.join(versionsDir(id),record.file)).catch(()=>{});index.versions=index.versions.filter(item=>item.id!==versionId);await writeAtomic(versionIndexFile(id),JSON.stringify(index,null,2));return sendJson(res,200,{id:versionId,deleted:true});
      });
    }
    if (url.pathname.startsWith('/api/projects/') && req.method === 'DELETE') {
      return await mutateProject(async()=>{
      const id = safeId(decodeURIComponent(url.pathname.slice('/api/projects/'.length)));
      if (!id) return sendJson(res, 400, { error:'Invalid project id' });
      try {
        let found=false;if(fs.existsSync(projectDir(id))){await fsp.rm(projectDir(id),{recursive:true});found=true;}if(fs.existsSync(legacyProjectFile(id))){await fsp.unlink(legacyProjectFile(id));found=true;}if(!found){const error=new Error('Missing');error.code='ENOENT';throw error;}
        return sendJson(res, 200, { id, deleted:true });
      } catch (error) {
        return sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error:'Project could not be deleted' });
      }
      });
    }
    if (url.pathname === '/api/exports' && req.method === 'POST') {const value=await readBody(req);return await mutateProject(async()=>sendJson(res,200,await createAiBundle(value)));}
    if (url.pathname.startsWith('/api/exports/') && url.pathname.endsWith('/download') && req.method === 'GET') {
      const id=safeId(decodeURIComponent(url.pathname.slice('/api/exports/'.length,-'/download'.length)));
      const file=path.join(exportsRoot,`${id}-ai-recreation.zip`);
      try{const stat=await fsp.stat(file);res.writeHead(200,{'Content-Type':'application/zip','Content-Length':stat.size,'Content-Disposition':`attachment; filename="${id}-ai-recreation.zip"`});fs.createReadStream(file).pipe(res);return;}
      catch{return sendJson(res,404,{error:'Export not found'});}
    }
    if (url.pathname.startsWith('/api/projects/') && req.method === 'GET') {
      const id = safeId(decodeURIComponent(url.pathname.slice('/api/projects/'.length)));
      if (!id) return sendJson(res, 400, { error:'Invalid project id' });
      try { return sendJson(res, 200, await readProjectFile(id)); }
      catch (error) { return sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error:'Project could not be opened' }); }
    }
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + requested);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}).end(data);
    });
  } catch (error) { sendJson(res, error.status||500, { error:error.message || 'Unexpected server error' }); }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${port}`);
  console.log('Projects: ' + projectsRoot);
  console.log('AI exports: ' + exportsRoot);
});
