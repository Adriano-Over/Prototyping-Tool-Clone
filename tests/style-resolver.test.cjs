const test = require('node:test');
const assert = require('node:assert/strict');
let resolver;
test.before(async () => {
  resolver = (await import('../dist/style-resolver.js')).default;
});

test('resolves a linear gradient and keeps every stop editable', () => {
  const input = 'linear-gradient(135deg, #FF7A59 0%, #9046FF 50%, #304FFE 100%)';
  const parsed = resolver.parseGradient(input);
  assert.equal(parsed.type, 'linear');
  assert.equal(parsed.heading, '135deg');
  assert.deepEqual(parsed.stops.map(({color,position}) => [color,position]), [
    ['#FF7A59','0%'], ['#9046FF','50%'], ['#304FFE','100%']
  ]);
  assert.equal(resolver.setStop(input,1,'#00AA88'), 'linear-gradient(135deg, #FF7A59 0%, #00AA88 50%, #304FFE 100%)');
});

test('parses nested color functions without splitting their commas', () => {
  const parsed = resolver.parseGradient('radial-gradient(circle, rgba(255, 0, 0, .5) 0%, #fff 100%)');
  assert.equal(parsed.type, 'radial');
  assert.deepEqual(parsed.stops.map(stop => [stop.color,stop.position]), [['rgba(255, 0, 0, .5)','0%'],['#fff','100%']]);
});

test('resolves layered fills and actual shadow and blur declarations', () => {
  const result = resolver.resolve({
    'background-image':'linear-gradient(135deg, #FF7A59 0%, #304FFE 100%), url("texture.png")',
    'box-shadow':'0 12px 32px 0 rgba(0,0,0,0.25), inset 0 1px 0 #fff',
    'backdrop-filter':'blur(20px) saturate(130%)', opacity:'0.8'
  });
  assert.equal(result.fillType, 'linear-gradient');
  assert.equal(result.backgroundImage.endsWith('url("texture.png")'), true);
  assert.equal(result.boxShadow.length, 2);
  assert.equal(result.backdropFilter, 'blur(20px) saturate(130%)');
  assert.equal(result.opacity, '0.8');
});
