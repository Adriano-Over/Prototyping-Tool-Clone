const test=require('node:test');
const assert=require('node:assert/strict');

test('motion keyframes are sorted, bounded, and serializable as Web Animations frames',async()=>{
  const {normalizeMotionFrames,upsertMotionFrame,motionWebKeyframes}=await import('../dist/motion-model.js');
  const frames=upsertMotionFrame([{time:2,opacity:-1},{time:.25,opacity:.2}],.75,.8);
  assert.deepEqual(frames,[{time:.25,opacity:.2},{time:.75,opacity:.8},{time:1,opacity:0}]);
  assert.deepEqual(motionWebKeyframes(frames),[
    {opacity:.2,offset:.25},{opacity:.8,offset:.75},{opacity:0,offset:1},
  ]);
  assert.deepEqual(normalizeMotionFrames('bad'),[]);
});

test('adding a keyframe at the same playhead replaces it',async()=>{
  const {upsertMotionFrame}=await import('../dist/motion-model.js');
  assert.deepEqual(upsertMotionFrame([{time:.5,opacity:.2}],.502,.9),[{time:.502,opacity:.9}]);
});

test('multiple motion tracks interpolate together with duration and easing settings',async()=>{
  const {normalizeMotionData,upsertMotionTrack,motionDataWebKeyframes}=await import('../dist/motion-model.js');
  let data=normalizeMotionData({duration:2400,easing:'ease-out',tracks:{}});
  data=upsertMotionTrack(data,'opacity',0,0);
  data=upsertMotionTrack(data,'opacity',1,1);
  data=upsertMotionTrack(data,'x',0,-20);
  data=upsertMotionTrack(data,'x',1,80);
  assert.equal(data.duration,2400);
  assert.equal(data.easing,'ease-out');
  assert.deepEqual(motionDataWebKeyframes(data),[
    {offset:0,opacity:0,translate:'-20px 0px'},
    {offset:1,opacity:1,translate:'80px 0px'},
  ]);
});

test('legacy opacity keyframes migrate into the multi-track format',async()=>{
  const {normalizeMotionData}=await import('../dist/motion-model.js');
  assert.deepEqual(normalizeMotionData([{time:.5,opacity:.3}]).tracks.opacity,[{time:.5,value:.3}]);
});
