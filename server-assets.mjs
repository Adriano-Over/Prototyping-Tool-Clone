import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'};
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
function decodeImage(source) {
  const match=source.match(/^data:(image\/[a-z+]+)(;base64)?,(.*)$/s);
  if(!match||!extensions[match[1]])throw new Error('Unsupported embedded image');
  const bytes=match[2]?Buffer.from(match[3],'base64'):Buffer.from(decodeURIComponent(match[3]));
  if(bytes.length>25*1024*1024)throw new Error('Image must be 25 MB or smaller');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {bytes,mime:match[1],sha256,id:'asset_'+sha256.slice(0,20),ext:extensions[match[1]]};
}
export function createAssetService({projectsRoot,writeAtomic}) {
  async function readAsset(projectId,assetId) {
    if(!/^[a-z0-9-]+$/.test(projectId)||!/^asset_[a-f0-9]{20}$/.test(assetId))throw new Error('Invalid asset reference');
    const root=await fs.realpath(projectsRoot);
    const directory=await fs.realpath(path.join(root,projectId,'assets'));
    if(!directory.startsWith(root+path.sep))throw new Error('Invalid asset directory');
    const name=(await fs.readdir(directory)).find(name=>new RegExp(`^${assetId}\\.(png|jpg|webp|gif|svg)$`).test(name));
    if(!name)throw new Error(`Missing image ${assetId}. Restore the source project or its backup.`);
    const file=await fs.realpath(path.join(directory,name));
    if(!file.startsWith(directory+path.sep))throw new Error('Invalid asset path');
    const mime=Object.keys(extensions).find(key=>extensions[key]===path.extname(file).slice(1));
    const stat=await fs.stat(file);if(stat.size>25*1024*1024)throw new Error('Image must be 25 MB or smaller');
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
      if(text.startsWith('data:image/'))sources.add(text);
      else for(const match of text.matchAll(/data:image\/(?:png|jpeg|webp|gif|svg\+xml)(?:;base64)?,[^\s"'<>)]*/g))sources.add(match[0]);
      return text;
    });
    const assets=new Map((value.assets||[]).map(asset=>[asset.id,asset]));
    for(const source of sources){
      const image=decodeImage(source),relativePath=`assets/${image.id}.${image.ext}`;
      await writeAtomic(path.join(projectsRoot,id,relativePath),image.bytes);
      const previous=[...assets.values()].find(asset=>asset.dataUrl===source)||assets.get(image.id)||{};
      assets.set(image.id,{...previous,id:image.id,relativePath,mime:image.mime,sha256:image.sha256,bytes:image.bytes.length});
      replacements.set(source,`/api/projects/${id}/assets/${image.id}`);
    }
    value=replace(value,replacements);
    value.assets=[...assets.values()].map(({dataUrl,...asset})=>asset);
    return value;
  }
  return {portable,materialize,readAsset};
}
