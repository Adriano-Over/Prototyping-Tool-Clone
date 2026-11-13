function number(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function maskClipStyle(maskStyle = {}, targetStyle = {}, isEllipse = false) {
  const maskX = number(maskStyle.left);
  const maskY = number(maskStyle.top);
  const maskWidth = Math.max(1, number(maskStyle.width));
  const maskHeight = Math.max(1, number(maskStyle.height));
  const targetX = number(targetStyle.left);
  const targetY = number(targetStyle.top);
  const targetWidth = Math.max(1, number(targetStyle.width));
  const targetHeight = Math.max(1, number(targetStyle.height));

  if (isEllipse) {
    return `ellipse(${maskWidth / 2}px ${maskHeight / 2}px at ${maskX - targetX + maskWidth / 2}px ${maskY - targetY + maskHeight / 2}px)`;
  }

  const top = Math.max(0, maskY - targetY);
  const right = Math.max(0, targetX + targetWidth - (maskX + maskWidth));
  const bottom = Math.max(0, targetY + targetHeight - (maskY + maskHeight));
  const left = Math.max(0, maskX - targetX);
  const radius = Math.max(0, number(maskStyle['border-radius']));
  return `inset(${top}px ${right}px ${bottom}px ${left}px${radius ? ` round ${radius}px` : ''})`;
}

export function maskPresentation(maskStyle = {}, computedOpacity = '1') {
  return {
    originalOpacity: String(maskStyle.opacity ?? computedOpacity ?? '1'),
    hiddenStyle: { opacity: '0' },
  };
}
