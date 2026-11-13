export function setRotation(transform, degrees) {
  const source=String(transform||'').trim();
  const rotation=`rotate(${Number(degrees)||0}deg)`;
  if (/rotate\([^)]*\)/i.test(source)) return source.replace(/rotate\([^)]*\)/i,rotation);
  return [source,rotation].filter(Boolean).join(' ');
}

export function getRotation(transform) {
  return Number(String(transform||'').match(/rotate\(\s*(-?[\d.]+)/i)?.[1]||0);
}

export function toggleComponentVisibility(component) {
  if (!component?.getStyle || !component?.addStyle) return false;
  const style=component.getStyle()||{};
  const hidden=component.get('formaHidden')===true;
  if (!hidden) {
    component.set({formaHidden:true,formaPreviousDisplay:style.display??''});
    component.addStyle({display:'none'});
    return false;
  }
  const previous=component.get('formaPreviousDisplay');
  component.addStyle({display:previous||''});
  component.unset?.('formaHidden');
  component.unset?.('formaPreviousDisplay');
  return true;
}

export function isComponentVisible(component) {
  return component?.get?.('formaHidden')!==true;
}
