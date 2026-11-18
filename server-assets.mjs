import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','application/vnd.forma.fig-source+gzip':'figsrc.gz'};
const clone=value=>JSON.parse(JSON.stringify(value));
const referencePattern=/(?<![\w:/.])(?:https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?)?\/api\/projects\/([a-z0-9-]+)\/assets\/(asset_[a-f0-9]{20})(?![\w-])/g;
function strings(value, visit) {
  if(typeof value==='string')return visit(value);
  if(Array.isArray(value))return value.map(item=>strings(item,visit));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,strings(item,visit)]));
  return value;
}
function replace(value, replacements) {
  return strings(value,text=>{for(const [from,to] of replacements)text=text.split(from).join(to);return text;});
}
function decodeAsset(source) {
  const match=source.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(;base64)?,(.*)$/s);
  if(!match||!extensions[match[1]])throw new Error('Unsupported embedded image');
  const bytes=match[2]?Buffer.from(match[3],'base64'):Buffer.from(decodeURIComponent(match[3]));
  const limit=match[1]==='application/vnd.forma.fig-source+gzip'?24*1024*1024:25*1024*1024;
  if(bytes.length>limit)throw new Error(`Project assets must be ${Math.floor(limit/1024/1024)} MB or smaller`);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {bytes,mime:match[1],sha256,id:'asset_'+sha256.slice(0,20),ext:extensions[match[1]]};
}
export function createAssetService({projectsRoot,writeAtomic}) {
  async function readAsset(projectId,assetId) {
    if(!/^[a-z0-9-]+$/.test(projectId)||!/^asset_[a-f0-9]{20}$/.test(assetId))throw new Error('Invalid asset reference');
    const root=await fs.realpath(projectsRoot);
    const directory=await fs.realpath(path.join(root,projectId,'assets'));
    if(!directory.startsWith(root+path.sep))throw new Error('Invalid asset directory');
    const name=(await fs.readdir(directory)).find(name=>new RegExp(`^${assetId}\\.(png|jpg|webp|gif|svg|figsrc\\.gz)$`).test(name));
    if(!name)throw new Error(`Missing asset ${assetId}. Restore the source project or its backup.`);
    const file=await fs.realpath(path.join(directory,name));
    if(!file.startsWith(directory+path.sep))throw new Error('Invalid asset path');
    const suffix=name.slice(assetId.length+1);
    const mime=Object.keys(extensions).find(key=>extensions[key]===suffix);
    const stat=await fs.stat(file);if(stat.size>(mime==='application/vnd.forma.fig-source+gzip'?24:25)*1024*1024)throw new Error('Project asset exceeds its size limit');
    return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
  }
  async function portable(input,projectId=input?.id||input?.project?.id) {
    let value=clone(input);const replacements=new Map(),references=new Map();
    strings(value,text=>{for(const match of text.matchAll(referencePattern))references.set(match[0],{projectId:match[1],assetId:match[2]});return text;});
    for(const [url,reference] of references)replacements.set(url,await readAsset(reference.projectId,reference.assetId));
    value=replace(value,replacements);
    // Include assets referenced only by a component template or an older snapshot.
    const project=value.format==='forma-project'?value:value.project;
    if(project?.assets)for(const asset of project.assets){
      if(!asset.dataUrl)asset.dataUrl=await readAsset(projectId,asset.id);
    }
    return value;
  }
  async function materialize(input,id) {
    let value=clone(input);const replacements=new Map(),sources=new Set();
    strings(value,text=>{
      if(text.startsWith('data:image/')||text.startsWith('data:application/vnd.forma.fig-source+gzip;'))sources.add(text);
      else for(const match of text.matchAll(/data:(?:image\/(?:png|jpeg|webp|gif|svg\+xml)|application\/vnd\.forma\.fig-source\+gzip)(?:;base64)?,[^\s"'<>)]*/g))sources.add(match[0]);
      return text;
    });
    const assets=new Map((value.assets||[]).map(asset=>[asset.id,asset]));
    for(const source of sources){
      const asset=decodeAsset(source),relativePath=`assets/${asset.id}.${asset.ext}`;
      await writeAtomic(path.join(projectsRoot,id,relativePath),asset.bytes);
      const previous=[...assets.values()].find(item=>item.dataUrl===source)||assets.get(asset.id)||{};
      assets.set(asset.id,{...previous,id:asset.id,relativePath,mime:asset.mime,sha256:asset.sha256,bytes:asset.bytes.length});
      replacements.set(source,`/api/projects/${id}/assets/${asset.id}`);
    }
    value=replace(value,replacements);
    value.assets=[...assets.values()].map(({dataUrl,...asset})=>asset);
    return value;
  }
  return {portable,materialize,readAsset};
}
