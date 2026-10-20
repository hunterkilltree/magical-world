import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TIER_ORDER, PROFILES, isTier, pixelRatioFor, pickTier, createGovernor, createFaultGuard, createSafeRunner, safeGet, safeSet
} from '../../src/game/quality.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const FIELDS = ['pixelRatio', 'maxPixels', 'shadow', 'lights', 'glow', 'dust', 'density', 'sprites', 'fx'];

// frames of `ms` for `seconds`; returns the tier changes
function feed(gov, ms, seconds) {
  const changes = [];
  for (let t = 0; t < seconds * 1000; t += ms) { const c = gov.sample(ms); if (c) changes.push(c); }
  return changes;
}

test('four tiers, each no heavier than the next, and high is the look the game shipped with', () => {
  assert.deepEqual(TIER_ORDER, ['minimal', 'low', 'medium', 'high']);
  for (let i = 1; i < TIER_ORDER.length; i++) {
    const a = PROFILES[TIER_ORDER[i - 1]], b = PROFILES[TIER_ORDER[i]];
    for (const f of FIELDS) assert.ok(a[f] <= b[f], `${TIER_ORDER[i - 1]}.${f} <= ${TIER_ORDER[i]}.${f}`);
    assert.ok(!a.bloom || b.bloom, 'bloom never switches off going up');
  }
  const H = PROFILES.high;
  assert.deepEqual([H.pixelRatio, H.shadow, H.glow, H.dust, H.density, H.sprites, H.bloom], [1.75, 2048, 6000, 2500, 0.6, 3600, true]);
  assert.ok(isTier('low') && !isTier('ultra') && !isTier(undefined));
});

test('the render ratio follows the tier cap, the screen and the pixel budget, and never drops below half', () => {
  const H = PROFILES.high;
  assert.equal(pixelRatioFor(H, 1440, 900, 2), 1.75, 'a laptop keeps the old ratio');
  assert.equal(pixelRatioFor(H, 1920, 1080, 1), 1, 'a 1080p screen at 1:1');
  const r4k = pixelRatioFor(H, 3840, 2160, 2);
  assert.ok(r4k * r4k * 3840 * 2160 <= H.maxPixels * 1.001, 'a 4K screen stays inside the budget');
  for (const t of TIER_ORDER) assert.ok(pixelRatioFor(PROFILES[t], 1920, 1080, 2) >= 0.5, t);
  assert.ok(pixelRatioFor(PROFILES.minimal, 1920, 1080, 1) < pixelRatioFor(PROFILES.low, 1920, 1080, 1));
});

test('the starting tier: a chosen tier wins, weak or soft devices start low, a strong desktop starts high', () => {
  assert.deepEqual(pickTier({ param: 'low', cores: 16 }), { tier: 'low', max: 'low', auto: false, why: 'chosen' });
  assert.equal(pickTier({ stored: 'high', phone: true }).tier, 'high', 'what the player saved is kept');
  assert.equal(pickTier({ param: 'nonsense', stored: 'medium' }).tier, 'medium', 'a bad value is ignored');
  assert.equal(pickTier({ gpu: 'Google SwiftShader' }).tier, 'minimal');
  assert.equal(pickTier({ gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)', cores: 32, deviceMemory: 8 }).max, 'minimal');
  assert.equal(pickTier({ cores: 2 }).max, 'low');
  assert.equal(pickTier({ deviceMemory: 2 }).tier, 'low');
  assert.equal(pickTier({ cores: 4, deviceMemory: 8 }).max, 'medium');
  assert.equal(pickTier({ gpu: 'ANGLE (Intel, Intel(R) HD Graphics 4000)' }).max, 'low');
  assert.equal(pickTier({ maxFragUniforms: 221 }).max, 'low');
  const strong = pickTier({ cores: 16, deviceMemory: 8, gpu: 'ANGLE (NVIDIA GeForce RTX 3060)' });
  assert.deepEqual([strong.tier, strong.max, strong.auto], ['high', 'high', true]);
  assert.equal(pickTier({}).tier, 'high', 'with nothing known a desktop starts at the shipped look');
  const iris = pickTier({ cores: 8, deviceMemory: 8, gpu: 'Intel(R) Iris(R) Xe Graphics' });
  assert.deepEqual([iris.tier, iris.max], ['medium', 'high'], 'shared graphics start soft but may climb');
});

test('a phone starts at low (medium if it is strong) and never aims above medium', () => {
  const p = pickTier({ phone: true });
  assert.deepEqual([p.tier, p.max, p.auto], ['low', 'medium', true]);
  assert.equal(pickTier({ phone: true, deviceMemory: 8, cores: 8 }).tier, 'medium');
  assert.equal(pickTier({ phone: true, deviceMemory: 4, cores: 8 }).tier, 'low');
  assert.equal(pickTier({ phone: true, gpu: 'Mali-T720' }).max, 'low');
});

test('the governor holds steady at the display rate and leaves a chosen tier alone', () => {
  const g = createGovernor({ tier: 'high' });
  assert.deepEqual(feed(g, 16.7, 120), []);
  assert.equal(g.tier, 'high');
  const locked = createGovernor({ tier: 'high', auto: false });
  assert.deepEqual(feed(locked, 80, 60), []);
  assert.equal(locked.tier, 'high');
});

test('slow frames walk the tier down one step at a time, to minimal and no further', () => {
  const g = createGovernor({ tier: 'high' });
  const changes = feed(g, 33.3, 300);
  assert.deepEqual(changes.map((c) => c.to), ['medium', 'low', 'minimal']);
  assert.ok(changes.every((c) => c.why === 'slow'));
  assert.equal(g.tier, 'minimal');
  assert.deepEqual(feed(g, 33.3, 120), [], 'nothing below minimal');
});

test('a very slow game, or a few long stalls, drops at once', () => {
  const slow = createGovernor({ tier: 'high' });
  const c = feed(slow, 90, 12);
  assert.equal(c[0]?.why, 'severe');
  const stalls = createGovernor({ tier: 'high' });
  const out = [];
  for (let i = 0; i < 120; i++) stalls.sample(16.7); // past the warm-up
  for (let i = 0; i < 3; i++) out.push(stalls.sample(500));
  for (let i = 0; i < 60; i++) out.push(stalls.sample(16.7));
  assert.ok(out.some((x) => x?.why === 'severe'), 'three half-second stalls in a window');
});

test('a hidden tab or a resume is not mistaken for a slow game', () => {
  const g = createGovernor({ tier: 'high' });
  feed(g, 16.7, 10);
  for (let i = 0; i < 20; i++) assert.equal(g.sample(4000), null);
  assert.deepEqual(feed(g, 16.7, 30), []);
  assert.equal(g.tier, 'high');
});

test('steady frames climb one tier after about twenty seconds, up to the ceiling and no further', () => {
  const g = createGovernor({ tier: 'low', max: 'medium' });
  assert.deepEqual(feed(g, 16.7, 12), [], 'not yet');
  const up = feed(g, 16.7, 40);
  assert.deepEqual(up.map((c) => [c.from, c.to, c.why]), [['low', 'medium', 'steady']]);
  assert.deepEqual(feed(g, 16.7, 120), [], 'medium is the ceiling');
});

test('a tier that proved too slow is never tried again', () => {
  const g = createGovernor({ tier: 'medium', max: 'high' });
  assert.equal(feed(g, 16.7, 60)[0].to, 'high');
  const down = feed(g, 35, 6);
  assert.deepEqual(down.map((c) => c.to), ['medium']);
  assert.equal(g.max, 'medium');
  assert.deepEqual(feed(g, 16.7, 300), [], 'high stays blocked');
  assert.equal(g.tier, 'medium');
});

test('picking a tier by hand ends the automatic changes', () => {
  const g = createGovernor({ tier: 'high' });
  g.force('low');
  assert.equal(g.tier, 'low');
  assert.equal(g.auto, false);
  assert.deepEqual(feed(g, 16.7, 120), []);
  g.setAuto(true);
  assert.equal(g.auto, true);
});

test('a frame that throws is retried, then lowers the quality, then stops with a card', () => {
  const f = createFaultGuard();
  assert.deepEqual([f.fault(new Error('a')), f.fault(new Error('b')), f.fault(new Error('c'))], ['retry', 'retry', 'degrade']);
  f.ok();
  assert.equal(f.fault(new Error('d')), 'retry', 'a good frame resets the run');
  assert.deepEqual([1, 2, 3, 4, 5].map(() => f.fault(new Error('e'))), ['retry', 'degrade', 'retry', 'retry', 'stop']);
  assert.equal(f.last.message, 'e');
  const noisy = createFaultGuard({ total: 10 });
  let verdict = '';
  for (let i = 0; i < 10; i++) { verdict = noisy.fault(new Error('x')); noisy.ok(); }
  assert.equal(verdict, 'stop', 'ten faults in all, even spread out');
});

test('an optional layer that keeps throwing is switched off, one that recovers is kept', () => {
  const seen = [];
  const safe = createSafeRunner({ limit: 3, onDisable: (name) => seen.push(name) });
  let calls = 0;
  const bad = () => { calls++; throw new Error('boom'); };
  assert.equal(safe.run('fx', bad), false);
  assert.equal(safe.run('fx', () => {}), true, 'a good run clears the strikes');
  for (let i = 0; i < 3; i++) safe.run('fx', bad);
  assert.equal(safe.disabled('fx'), true);
  assert.deepEqual(seen, ['fx']);
  assert.equal(safe.run('fx', bad), false);
  assert.equal(calls, 4, 'a disabled layer is not called again');
  assert.equal(safe.disabled('other'), false);
  safe.reset('fx');
  assert.equal(safe.run('fx', () => {}), true);
});

test('storage that throws, or is missing, gives null and false instead of an error', () => {
  const keep = globalThis.localStorage;
  try {
    delete globalThis.localStorage;
    assert.equal(safeGet('k'), null);
    assert.equal(safeSet('k', '1'), false);
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(safeGet('k'), null);
    assert.equal(safeSet('k', '1'), false);
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
    assert.equal(safeSet('k', 'low'), true);
    assert.equal(safeGet('k'), 'low');
  } finally {
    if (keep === undefined) delete globalThis.localStorage; else globalThis.localStorage = keep;
  }
});

test('the page cannot be blanked by startup: audio, the renderer and the app all guard themselves', () => {
  const audio = read('src/game/audio.js');
  assert.ok(!/localStorage/.test(audio.replace(/safeGet|safeSet/g, '')), 'audio.js reaches storage only through safeGet/safeSet');
  const render = read('src/game/render.js');
  assert.match(render, /webglcontextlost/, 'a lost context is handled');
  assert.match(render, /webglcontextrestored/);
  assert.match(render, /try\s*{[^}]*new THREE\.WebGLRenderer/s, 'the renderer is made inside a try');
  const main = read('src/game/main.js');
  assert.match(main, /createFaultGuard/);
  assert.match(main, /createGovernor/);
  assert.match(main, /showFatal/, 'a card replaces the game when it cannot run');
  assert.match(read('src/App.tsx'), /try\s*{\s*cleanup = initGame\(\)/, 'an error anywhere in the start-up shows the card too');
});

test('the menu and pause screens offer a Graphics choice', () => {
  const app = read('src/App.tsx');
  assert.equal((app.match(/className="roles quality"/g) ?? []).length, 2, 'one in the menu, one in the pause screen');
  const hud = read('src/game/hud.js');
  assert.match(hud, /onQuality/);
});
