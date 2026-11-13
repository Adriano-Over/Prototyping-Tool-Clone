import crypto from 'node:crypto';
import { parseFig, nodeId, resolveVectorNodePaths } from 'openfig-core';

const MAX_NODES = 250_000;
const colorCss = color => {
  if (!color) return null;
  const channel = value => Math.max(0, Math.min(255, Math.round(Number(value || 0) * 255)));
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${Math.max(0, Math.min(1, Number(color.a ?? 1)))})`;
};
const hashKey = value => {
  if (!value) return '';
  if (typeof value === 'string') return value.toLowerCase();
  return Buffer.from(value).toString('hex').toLowerCase();
};
const safeName = value => String(value || 'Untitled').replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
const cssId = (prefix, value) => `${prefix}-${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)}`;

function paintCss(paints, images, imageFills) {
  const visible = (paints || []).filter(paint => paint?.visible !== false && Number(paint?.opacity ?? 1) > 0);
  const paint = visible[0];
  if (!paint) return null;
  if (paint.type === 'SOLID') return { color: colorCss(paint.color), opacity: Number(paint.opacity ?? 1) };
  if (paint.type === 'IMAGE') {
    const hash = hashKey(paint.image?.hash || paint.imageThumbnail?.hash);
    const image = images.get(hash);
    if (!image) return null;
    imageFills.push({ dataUrl: image.dataUrl, mode: paint.imageScaleMode || 'FILL' });
    return { image: image.dataUrl, mode: paint.imageScaleMode || 'FILL', opacity: Number(paint.opacity ?? 1) };
  }
  if (['GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'].includes(paint.type) && paint.stops?.length) {
    const stops = paint.stops.map(stop => `${colorCss(stop.color)} ${Math.max(0, Math.min(1, Number(stop.position))) * 100}%`).join(', ');
    const direction = paint.type === 'GRADIENT_LINEAR' ? '135deg' : 'circle';
    return { gradient: paint.type === 'GRADIENT_LINEAR' ? `linear-gradient(${direction}, ${stops})` : `radial-gradient(${stops})`, opacity: Number(paint.opacity ?? 1) };
  }
  return null;
}

function svgForVector(doc, node) {
  const width = Math.max(1, Number(node.size?.x || 1));
  const height = Math.max(1, Number(node.size?.y || 1));
  const paths = resolveVectorNodePaths(doc, node);
  const serialize = entry => {
    const paint = (entry.paints || []).find(item => item?.visible !== false);
    if (!entry.svgPath) return '';
    const fill = paint?.type === 'SOLID' ? colorCss(paint.color) : 'none';
    const stroke = entry === paths.stroke ? (paint?.type === 'SOLID' ? colorCss(paint.color) : '#000000') : 'none';
    const strokeWidth = entry === paths.stroke ? Math.max(0.1, Number(node.strokeWeight || 1)) : 0;
    return `<path d="${entry.svgPath.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  };
  const body = [...(paths.fill || []).map(serialize), ...(paths.stroke || []).map(serialize)].join('');
  if (!body) return null;
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`).toString('base64')}`;
}

export function importFigProject(bytes, filename = 'Imported Figma design') {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32) throw new Error('This file is empty or too small to be a Figma design file.');
  if (bytes.length > 200 * 1024 * 1024) throw new Error('Figma files must be 200 MB or smaller.');
  const doc = parseFig(new Uint8Array(bytes));
  if (doc.header?.prelude !== 'fig-kiwi') throw new Error('This is not a Figma Design .fig file.');
  if (doc.nodes.length > MAX_NODES) throw new Error('This design has more than 250,000 layers, which exceeds Forma’s import limit.');

  const images = new Map();
  for (const [key, data] of doc.images) {
    const imageBytes = Buffer.from(data);
    let mime = 'image/png';
    if (imageBytes[0] === 0xff && imageBytes[1] === 0xd8) mime = 'image/jpeg';
    else if (imageBytes.toString('ascii', 0, 4) === 'RIFF' && imageBytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
    else if (imageBytes.toString('ascii', 0, 3) === 'GIF') mime = 'image/gif';
    else if (imageBytes.toString('ascii', 1, 4) === 'PNG') mime = 'image/png';
    const normalizedKey = String(key).replace(/\.[^.]+$/, '').toLowerCase();
    images.set(normalizedKey, { dataUrl: `data:${mime};base64,${imageBytes.toString('base64')}`, bytes: imageBytes.length });
  }

  const unsupported = new Set();
  let converted = 0;
  const pages = doc.nodes.filter(node => node.type === 'CANVAS' && node.phase !== 'REMOVED' && !/^internal only/i.test(node.name || ''));
  if (!pages.length) throw new Error('No editable Figma pages were found in this file.');

  const makeNode = (node, parentId, rootOrigin = { x: 0, y: 0 }) => {
    const id = nodeId(node);
    if (!id || node.phase === 'REMOVED') return null;
    const componentId = cssId('fig', id);
    const type = node.type;
    const supported = new Set(['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SYMBOL', 'RECTANGLE', 'ROUNDED_RECTANGLE', 'ELLIPSE', 'STAR', 'POLYGON', 'LINE', 'VECTOR', 'TEXT', 'BOOLEAN_OPERATION', 'SLICE']);
    if (!supported.has(type)) unsupported.add(type || 'unknown');
    const component = { type: type === 'TEXT' ? 'text' : 'default', name: safeName(node.name), resizable: true, attributes: { id: componentId, 'data-figma-node-id': id } };
    const style = { position: 'absolute' };
    const transform = node.transform || {};
    const x = Number(transform.m02 || 0) - (parentId === null ? rootOrigin.x : 0);
    const y = Number(transform.m12 || 0) - (parentId === null ? rootOrigin.y : 0);
    if (Number.isFinite(x)) style.left = `${x}px`;
    if (Number.isFinite(y)) style.top = `${y}px`;
    if (Number.isFinite(node.size?.x)) style.width = `${Math.max(0, node.size.x)}px`;
    if (Number.isFinite(node.size?.y)) style.height = `${Math.max(0, node.size.y)}px`;
    if (node.visible === false) style.display = 'none';
    if (Number.isFinite(node.opacity) && node.opacity < 1) style.opacity = String(Math.max(0, node.opacity));
    const angle = Math.atan2(Number(transform.m10 || 0), Number(transform.m00 || 1)) * 180 / Math.PI;
    if (Math.abs(angle) > 0.01) style.transform = `rotate(${angle}deg)`;
    if (['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SYMBOL'].includes(type) && node.frameMaskDisabled !== true) style.overflow = 'hidden';
    const radius = node.cornerRadius ?? node.rectangleTopLeftCornerRadius;
    if (Number.isFinite(radius) && radius > 0) style['border-radius'] = `${radius}px`;

    const imageFills = [];
    const fill = paintCss(node.fillPaints, images, imageFills);
    if (fill?.color) style[type === 'TEXT' ? 'color' : 'background-color'] = fill.color;
    if (fill?.gradient) style['background-image'] = fill.gradient;
    if (fill?.image) {
      style['background-image'] = `url("${fill.image}")`;
      style['background-size'] = fill.mode === 'FIT' ? 'contain' : fill.mode === 'TILE' ? 'auto' : 'cover';
      style['background-position'] = 'center';
      style['background-repeat'] = fill.mode === 'TILE' ? 'repeat' : 'no-repeat';
    }
    if (fill?.opacity < 1) style['background-blend-mode'] = 'normal';
    const stroke = paintCss(node.strokePaints, images, []);
    if (stroke?.color && Number(node.strokeWeight) > 0) style.border = `${Number(node.strokeWeight)}px solid ${stroke.color}`;
    const shadows = (node.effects || []).filter(effect => effect?.visible !== false && ['DROP_SHADOW', 'INNER_SHADOW'].includes(effect.type)).map(effect => `${effect.type === 'INNER_SHADOW' ? 'inset ' : ''}${Number(effect.offset?.x || 0)}px ${Number(effect.offset?.y || 0)}px ${Math.max(0, Number(effect.radius || 0))}px ${Number(effect.spread || 0)}px ${colorCss(effect.color) || 'rgba(0,0,0,.25)'}`);
    if (shadows.length) style['box-shadow'] = shadows.join(', ');
    const foregroundBlur = (node.effects || []).find(effect => effect?.visible !== false && effect.type === 'FOREGROUND_BLUR');
    const backgroundBlur = (node.effects || []).find(effect => effect?.visible !== false && effect.type === 'BACKGROUND_BLUR');
    if (foregroundBlur) style.filter = `blur(${Math.max(0, Number(foregroundBlur.radius || 0))}px)`;
    if (backgroundBlur) style['backdrop-filter'] = `blur(${Math.max(0, Number(backgroundBlur.radius || 0))}px)`;
    if (type === 'TEXT') {
      component.content = String(node.textData?.characters || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      style['font-size'] = `${Math.max(1, Number(node.fontSize || 14))}px`;
      if (node.fontName?.family) style['font-family'] = `"${String(node.fontName.family).replaceAll('"', '')}", sans-serif`;
      if (node.fontName?.style) {
        const styleName = String(node.fontName.style).toLowerCase();
        if (styleName.includes('bold') || styleName.includes('semibold')) style['font-weight'] = styleName.includes('semi') ? '600' : '700';
        if (styleName.includes('italic')) style['font-style'] = 'italic';
      }
      if (node.textAlignHorizontal) style['text-align'] = String(node.textAlignHorizontal).toLowerCase();
      if (node.lineHeight?.units === 'PIXELS' && node.lineHeight.value > 0) style['line-height'] = `${node.lineHeight.value}px`;
      else if (node.lineHeight?.value > 0 && node.lineHeight.value < 4) style['line-height'] = String(node.lineHeight.value);
      if (node.textTracking) style['letter-spacing'] = `${Number(node.textTracking) * 100}%`;
    }
    if (type === 'VECTOR') {
      const svg = svgForVector(doc, node);
      if (svg) {
        component.type = 'image';
        component.attributes.src = svg;
        component.attributes.alt = node.name || 'Vector';
        delete component.content;
        delete style['background-color'];
        delete style['background-image'];
        delete style['color'];
      }
    }
    if (imageFills.some(item => item.dataUrl)) {
      component.attributes['data-figma-image-fill'] = 'true';
    }
    component.style = style;
    const children = (doc.childrenMap.get(id) || []).filter(child => child.phase !== 'REMOVED').map(child => makeNode(child, id)).filter(Boolean);
    if (children.length) component.components = children;
    converted++;
    return component;
  };

  const importedPages = pages.map((page, index) => {
    const pageId = nodeId(page);
    const pageChildren = (doc.childrenMap.get(pageId) || []).filter(node => node.phase !== 'REMOVED');
    const render = index === 0 ? doc.meta?.client_meta?.render_coordinates || {} : {};
    const bounds = pageChildren.map(node => {
      const x = Number(node.transform?.m02 || 0), y = Number(node.transform?.m12 || 0);
      return { left: x, top: y, right: x + Number(node.size?.x || 0), bottom: y + Number(node.size?.y || 0) };
    });
    const contentLeft = bounds.length ? Math.min(...bounds.map(bound => bound.left)) : 0;
    const contentTop = bounds.length ? Math.min(...bounds.map(bound => bound.top)) : 0;
    const contentRight = bounds.length ? Math.max(...bounds.map(bound => bound.right)) : 1440;
    const contentBottom = bounds.length ? Math.max(...bounds.map(bound => bound.bottom)) : 1100;
    const origin = Number.isFinite(render.x) && Number.isFinite(render.y) ? { x: render.x, y: render.y } : { x: contentLeft, y: contentTop };
    const width = Math.max(1, Number(render.width || contentRight - contentLeft));
    const height = Math.max(1, Number(render.height || contentBottom - contentTop));
    const wrapperId = cssId('fig-page', pageId);
    const children = pageChildren.map(node => makeNode(node, null, origin)).filter(Boolean);
    const bg = doc.meta?.client_meta?.background_color;
    const pageStyle = { width: `${width}px`, height: `${height}px`, position: 'relative', overflow: 'hidden' };
    if (bg) pageStyle['background-color'] = colorCss(bg);
    const component = { type: 'wrapper', attributes: { id: wrapperId }, style: pageStyle, components: children };
    return { name: safeName(page.name || `Page ${index + 1}`), frames: [{ component }] };
  });

  return {
    format: 'forma-project', schemaVersion: 2, name: safeName(doc.meta?.file_name || filename.replace(/\.fig$/i, '')),
    editor: { grapesjs: { pages: importedPages, styles: [], assets: [] } },
    forma: { components: [], variables: { mode: 'light', modes: { light: {}, dark: {} } }, comments: {}, prototype: {}, layoutMetadata: {} },
    assets: [], importSummary: { nodes: converted, pages: importedPages.length, images: images.size, unsupportedTypes: [...unsupported].sort(), figVersion: doc.header.version },
  };
}
