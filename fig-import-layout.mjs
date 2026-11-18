import { autoLayoutStyle } from './dist/layout-service.js';

const number = value => Number.isFinite(Number(value)) ? Number(value) : undefined;
const align = value => ({
  MIN: 'flex-start', START: 'flex-start', MAX: 'flex-end', END: 'flex-end',
  CENTER: 'center', SPACE_BETWEEN: 'space-between', BASELINE: 'baseline', STRETCH: 'stretch',
})[String(value || '').toUpperCase()] || null;
const sizing = value => ({
  FIXED: 'fixed', HUG_CONTENTS: 'hug', RESIZE_TO_FIT: 'hug', RESIZE_TO_FIT_WITH_IMPLICIT_SIZE: 'hug',
  FILL: 'fill', FILL_CONTAINER: 'fill',
})[String(value || '').toUpperCase()] || null;

export function normalizeFigStackLayout(node) {
  const mode = String(node?.stackMode || '').toUpperCase();
  if (!['HORIZONTAL', 'VERTICAL'].includes(mode)) return null;
  const horizontal = mode === 'HORIZONTAL';
  const uniformHorizontal = number(node.stackHorizontalPadding) ?? 0;
  const uniformVertical = number(node.stackVerticalPadding) ?? 0;
  const values = {
    direction: horizontal ? 'row' : 'column',
    gap: number(node.stackSpacing) ?? 0,
    paddingTop: number(node.stackPaddingTop) ?? uniformVertical,
    paddingRight: number(node.stackPaddingRight) ?? uniformHorizontal,
    paddingBottom: number(node.stackPaddingBottom) ?? uniformVertical,
    paddingLeft: number(node.stackPaddingLeft) ?? uniformHorizontal,
    justify: align(node.stackPrimaryAlignItems) || 'flex-start',
    align: align(node.stackCounterAlignItems) || 'flex-start',
    wrap: String(node.stackWrap || '').toUpperCase() === 'WRAP',
    ...(number(node.stackCounterSpacing) !== undefined ? { rowGap: horizontal ? number(node.stackCounterSpacing) : number(node.stackSpacing), columnGap: horizontal ? number(node.stackSpacing) : number(node.stackCounterSpacing) } : {}),
    widthMode: sizing(horizontal ? node.stackPrimarySizing : node.stackCounterSizing) || 'fixed',
    heightMode: sizing(horizontal ? node.stackCounterSizing : node.stackPrimarySizing) || 'fixed',
    source: {
      mode,
      primarySizing: node.stackPrimarySizing ?? null,
      counterSizing: node.stackCounterSizing ?? null,
      primaryAlign: node.stackPrimaryAlignItems ?? null,
      counterAlign: node.stackCounterAlignItems ?? null,
      spacing: node.stackSpacing ?? null,
      counterSpacing: node.stackCounterSpacing ?? null,
      wrap: node.stackWrap ?? null,
    },
  };
  for (const [key, value] of Object.entries({ width: number(node.size?.x), height: number(node.size?.y), minWidth: number(node.minSize?.x), maxWidth: number(node.maxSize?.x), minHeight: number(node.minSize?.y), maxHeight: number(node.maxSize?.y) })) if (value !== undefined) values[key] = value;
  return values;
}

export function figStackStyle(layout) {
  if (!layout) return {};
  const style = autoLayoutStyle(layout);
  delete style.position;
  return style;
}

export function figStackChildStyle(node, parentLayout) {
  if (!parentLayout) return {};
  const positioning = String(node?.stackPositioning || '').toUpperCase();
  if (['ABSOLUTE', 'ABSOLUTE_POSITION'].includes(positioning)) return {};
  const style = { position: 'relative', left: 'auto', top: 'auto', right: 'auto', bottom: 'auto' };
  const self = align(node?.stackChildAlignSelf);
  if (self && self !== 'stretch') style['align-self'] = self;
  const ownLayout = normalizeFigStackLayout(node);
  const primary = ownLayout ? null : sizing(node?.stackPrimarySizing);
  const counter = ownLayout ? null : sizing(node?.stackCounterSizing);
  const primaryAxis = parentLayout.direction === 'row' ? 'width' : 'height';
  const counterAxis = primaryAxis === 'width' ? 'height' : 'width';
  const crossPadding = counterAxis === 'width'
    ? (parentLayout.paddingLeft || 0) + (parentLayout.paddingRight || 0)
    : (parentLayout.paddingTop || 0) + (parentLayout.paddingBottom || 0);
  const crossSize = node?.size?.[counterAxis === 'width' ? 'x' : 'y'];
  const availableCross = parentLayout[counterAxis] - crossPadding;
  // Nested stacks can carry a legacy STRETCH flag even when their saved
  // bounds are smaller than their parent (for example a centered variant).
  const stretch = self === 'stretch' && (!ownLayout || !Number.isFinite(availableCross) ||
    !Number.isFinite(crossSize) || Math.abs(crossSize - availableCross) < 0.01);
  if (primary === 'fill') {
    style[primaryAxis] = 'auto';
    style['flex-grow'] = '1';
    style['flex-basis'] = '0px';
    style[`min-${primaryAxis}`] = '0px';
  } else if (primary === 'hug') style[primaryAxis] = 'max-content';
  if (stretch || counter === 'fill') {
    style[counterAxis] = 'auto';
    style['align-self'] = 'stretch';
  } else if (counter === 'hug') style[counterAxis] = 'max-content';
  return style;
}
