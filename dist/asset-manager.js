import { apiFetch } from './api-client.js';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']);
const assetUrl = (projectId, asset) => `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`;
const hasVectorTemplate = component => Boolean(component.get?.('formaVectorTemplate')?.svg);

export function createAssetManager({ projectState, getProjectId, saveProject, onToast } = {}) {
  async function importFile(file) {
    if (!file || !ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Choose a PNG, JPEG, WebP, GIF, or SVG image');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be 25 MB or smaller');
    if (!getProjectId()) await saveProject?.();
    const projectId=getProjectId();if(!projectId)throw new Error('Save the project before importing an image');
    const response=await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/assets`,{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
    const asset=await response.json();if(!response.ok)throw new Error(asset.error||'Image import failed');
    const assets=projectState.getAssets();if(!assets.some(item=>item.id===asset.id)){assets.push(asset);projectState.setAssets(assets);}
    return {asset,src:assetUrl(projectId,asset)};
  }

  function resolve(editor) {
    const projectId=getProjectId();if(!projectId)return;
    const visit=component=>{const assetId=component.get?.('assetId')||component.getAttributes?.()?.['data-forma-asset-id'];if(assetId&&!hasVectorTemplate(component)){const url=assetUrl(projectId,{id:assetId}),attrs=component.getAttributes?.()||{};component.addAttributes({src:url,'data-forma-asset-id':assetId});if(attrs['data-forma-image-fill']==='true')component.addStyle({'background-image':`url("${url}")`});}component.components?.().models.forEach(visit);};
    editor.Pages.getAll().forEach(page=>{const root=page.getMainComponent?.();if(root)visit(root);});
  }

  async function migrateDataUrls(editor) {
    const pending=[];
    // The variable service owns these live SVGs. Folder saves already
    // materialize any data URL and persist the template for later mode changes.
    const visit=component=>{const src=component.getAttributes?.()?.src;if(component.get?.('type')==='image'&&!hasVectorTemplate(component)&&typeof src==='string'&&/^data:image\//i.test(src))pending.push({component,src});component.components?.().models.forEach(visit);};
    editor.Pages.getAll().forEach(page=>{const root=page.getMainComponent?.();if(root)visit(root);});
    for(const {component,src} of pending){try{const blob=await (await fetch(src)).blob();const file=new File([blob],component.get('name')||'migrated-image',{type:blob.type});const {asset,src:url}=await importFile(file);component.set('assetId',asset.id,{silent:true});component.addAttributes({src:url,'data-forma-asset-id':asset.id});}catch(error){onToast?.(`An embedded image could not be migrated: ${error.message}`);}}
    return pending.length;
  }
  return { importFile, resolve, migrateDataUrls, assetUrl:(asset)=>assetUrl(getProjectId(),asset) };
}

