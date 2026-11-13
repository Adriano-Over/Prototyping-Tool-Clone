export function normalizeMotionFrames(value) {
  if (!Array.isArray(value)) return [];
  return value.map(frame => {
    const time = Number(frame?.time), opacity = Number(frame?.opacity ?? 1);
    return { time: Math.max(0, Math.min(1, Number.isFinite(time) ? time : 0)), opacity: Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1)) };
  }).sort((a, b) => a.time - b.time);
}

export function upsertMotionFrame(frames, time, opacity) {
  const normalized = normalizeMotionFrames(frames);
  const at = Math.max(0, Math.min(1, Number(time) || 0));
  const alpha = Math.max(0, Math.min(1, Number(opacity) || 0));
  const existing = normalized.findIndex(frame => Math.abs(frame.time - at) < 0.005);
  if (existing >= 0) normalized[existing] = { time: at, opacity: alpha };
  else normalized.push({ time: at, opacity: alpha });
  return normalizeMotionFrames(normalized);
}

export function motionWebKeyframes(frames) {
  return normalizeMotionFrames(frames).map(frame => ({ opacity: frame.opacity, offset: frame.time }));
}

export const MOTION_PROPERTIES = Object.freeze({ opacity: { min: 0, max: 1, step: 0.01 }, x: { min: -10000, max: 10000, step: 1 }, y: { min: -10000, max: 10000, step: 1 }, rotation: { min: -3600, max: 3600, step: 1 }, scale: { min: 0.01, max: 10, step: 0.01 } });
export const MOTION_EASINGS = Object.freeze(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);

export function normalizeMotionData(value) {
  const legacy = Array.isArray(value) ? value : null;
  const source = legacy ? { tracks: { opacity: legacy.map(frame => ({ time: frame?.time, value: frame?.opacity })) } } : value || {};
  const tracks = {};
  for (const [property, frames] of Object.entries(source.tracks || {})) {
    const limits = MOTION_PROPERTIES[property];
    if (!limits || !Array.isArray(frames)) continue;
    tracks[property] = frames.map(frame => ({ time: Math.max(0, Math.min(1, Number(frame?.time) || 0)), value: Math.max(limits.min, Math.min(limits.max, Number.isFinite(Number(frame?.value)) ? Number(frame.value) : limits.min)) })).sort((a, b) => a.time - b.time);
  }
  const duration = Math.max(100, Math.min(60000, Number(source.duration) || 1200));
  const easing = MOTION_EASINGS.includes(source.easing) ? source.easing : 'ease-in-out';
  return { tracks, duration, easing };
}

export function upsertMotionTrack(data, property, time, value) {
  const normalized = normalizeMotionData(data), limits = MOTION_PROPERTIES[property];
  if (!limits) return normalized;
  const at = Math.max(0, Math.min(1, Number(time) || 0)), amount = Math.max(limits.min, Math.min(limits.max, Number(value) || 0));
  const frames = normalized.tracks[property] || [], index = frames.findIndex(frame => Math.abs(frame.time - at) < 0.005);
  if (index < 0) frames.push({ time: at, value: amount }); else frames[index] = { time: at, value: amount };
  normalized.tracks[property] = frames.sort((a, b) => a.time - b.time);
  return normalized;
}

export function motionDataWebKeyframes(data, base = {}) {
  const normalized = normalizeMotionData(data), tracks = normalized.tracks;
  const times = [...new Set(Object.values(tracks).flatMap(frames => frames.map(frame => frame.time)).concat([0, 1]))].sort((a, b) => a - b);
  const sample = (frames, time) => {
    if (!frames?.length) return undefined;
    if (time <= frames[0].time) return frames[0].value;
    if (time >= frames.at(-1).time) return frames.at(-1).value;
    const right = frames.findIndex(frame => frame.time >= time), a = frames[right - 1], b = frames[right], ratio = (time - a.time) / Math.max(0.00001, b.time - a.time);
    return a.value + (b.value - a.value) * ratio;
  };
  return times.map(offset => {
    const frame = { offset };
    let x = 0, y = 0;
    for (const property of Object.keys(tracks)) {
      const value = sample(tracks[property], offset);
      if (value === undefined) continue;
      if (property === 'opacity') frame.opacity = value;
      if (property === 'x') x = value;
      if (property === 'y') y = value;
      if (property === 'rotation') frame.rotate = `${value}deg`;
      if (property === 'scale') frame.scale = String(value);
    }
    if (tracks.x || tracks.y) frame.translate = `${x}px ${y}px`;
    return frame;
  });
}
