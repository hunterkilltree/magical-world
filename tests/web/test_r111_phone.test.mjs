import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stickVector, mergeMove, aimPoint, detectTouch, isPhone, STICK_DEAD } from '../../src/game/touch.js';
import { TUNING } from '../../src/game/sim.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ~ ${b}`);

test('the move stick: a dead zone, screen-up is north (-z), and a drag past the rim is full speed', () => {
  assert.deepEqual(stickVector(3, 3, 50), { x: 0, z: 0, mag: 0 });
  assert.ok(STICK_DEAD > 0 && STICK_DEAD < 0.5);
  const right = stickVector(50, 0, 50);
  near(right.x, 1); near(right.z, 0); near(right.mag, 1);
  const up = stickVector(0, -40, 50);
  near(up.x, 0); assert.ok(up.z < 0, 'finger up = away from the camera = -z');
  const down = stickVector(0, 40, 50);
  assert.ok(down.z > 0);
  const far = stickVector(400, 300, 50);
  near(far.mag, 1); near(Math.hypot(far.x, far.z), 1);
  const diag = stickVector(30, -30, 60);
  near(Math.hypot(diag.x, diag.z), 1, 1e-9);
  assert.ok(diag.x > 0 && diag.z < 0);
});

test('a touch stick only fills in when the keyboard is idle', () => {
  assert.deepEqual(mergeMove({ x: 0, z: 0 }, { x: 0.6, z: -0.8 }), { x: 0.6, z: -0.8 });
  assert.deepEqual(mergeMove({ x: 1, z: 0 }, { x: -1, z: 0 }), { x: 1, z: 0 });
  assert.deepEqual(mergeMove({ x: 0, z: 0 }, null), { x: 0, z: 0 });
});

test('the cast pad aims where it is dragged; untouched it picks the nearest enemy, else the facing', () => {
  const R = TUNING.aimRange;
  const p = { x: 2, z: 3, fx: 0, fz: -1 };
  const foes = [{ x: 2, z: -2, hp: 10, state: 'chase' }, { x: 4, z: 3.5, hp: 10, state: 'chase' }, { x: 2, z: 3.2, hp: 10, state: 'spawn' }, { x: 2, z: 3.1, hp: 0, state: 'chase' }];
  const drag = aimPoint({ x: 1, z: 0, mag: 1 }, p, foes);
  near(drag.x, 2 + R); near(drag.z, 3);
  const short = aimPoint({ x: 0, z: -1, mag: 0.5 }, p, foes);
  assert.ok(short.z < 3 && short.z > 3 - R, 'a short drag aims short');
  const assist = aimPoint({ x: 0, z: 0, mag: 0 }, p, foes);
  assert.deepEqual([assist.x, assist.z], [4, 3.5], 'nearest living enemy that is out of its spawn');
  assert.deepEqual(aimPoint(null, p, foes), assist, 'no pad at all is the same assist');
  const empty = aimPoint({ x: 0, z: 0, mag: 0 }, p, []);
  near(empty.x, 2); near(empty.z, 3 - 6);
  const lost = aimPoint({ x: 0, z: 0, mag: 0 }, { x: 0, z: 0, fx: 0, fz: 0 }, []);
  assert.ok(Number.isFinite(lost.x) && Number.isFinite(lost.z) && lost.z < 0, 'a missing facing still aims somewhere');
  const faraway = aimPoint({ x: 0, z: 0, mag: 0 }, p, [{ x: 200, z: 200, hp: 5, state: 'chase' }]);
  assert.ok(Math.hypot(faraway.x - p.x, faraway.z - p.z) < 10, 'an enemy far outside the court is not chased');
});

test('touch is detected from the screen, the URL can force it either way, a desktop is not one', () => {
  assert.equal(detectTouch({ search: '?touch=1' }), true);
  assert.equal(detectTouch({ search: '?touch=0', coarse: true, points: 5 }), false);
  assert.equal(detectTouch({ coarse: true, points: 5 }), true);
  assert.equal(detectTouch({ coarse: false, points: 0 }), false);
  assert.equal(detectTouch({ coarse: false, points: 10 }), false, 'a touch laptop with a mouse keeps the mouse');
  assert.equal(detectTouch({}), false);
  assert.equal(isPhone({ touch: true, width: 844, height: 390 }), true);
  assert.equal(isPhone({ touch: true, width: 1180, height: 820 }), false, 'a tablet is not a phone');
  assert.equal(isPhone({ touch: false, width: 800, height: 400 }), false, 'a small desktop window is not a phone');
  assert.equal(isPhone({ touch: true, width: 1366, height: 1024, ua: 'Mozilla/5.0 (Linux; Android 13; SM-X700) Mobile' }), true);
});

test('the page fits a phone: visible-height units, safe areas, no zoom, no scroll, a way to install', () => {
  const html = read('index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  const css = read('src/styles.css');
  assert.match(css, /100dvh/);
  assert.match(css, /env\(safe-area-inset-/);
  assert.match(css, /body\.touch/);
  assert.match(css, /#game\s*{[^}]*touch-action:\s*none/);
  assert.match(css, /overscroll-behavior:\s*none/);
  assert.match(css, /user-select:\s*none/);
  assert.match(css, /orientation:\s*portrait/);
  const man = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(man.display, 'fullscreen');
  assert.equal(man.orientation, 'landscape');
  assert.ok(man.name && man.start_url && man.icons?.length);
  for (const icon of man.icons) assert.ok(readFileSync(new URL('../../public/' + icon.src.replace(/^\//, ''), import.meta.url)).length > 0, icon.src);
});

test('the app asks a portrait phone to turn sideways, and wires touch into the game', () => {
  const app = read('src/App.tsx');
  assert.match(app, /id="rotate"/);
  const main = read('src/game/main.js');
  assert.match(main, /createTouchControls/);
  assert.match(main, /aimPoint/);
  const input = read('src/game/input.js');
  assert.match(input, /pointerType/);
  assert.match(read('src/game/touch.js'), /gesturestart/, 'a pinch cannot zoom the arena on iOS');
});
