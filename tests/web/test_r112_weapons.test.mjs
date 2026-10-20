import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, createCoopGame, step, newStatus, seedRandom } from '../../src/game/sim.js';
import { ELEMENTS } from '../../src/game/spells.js';
import { ENEMY_TYPES } from '../../src/game/enemies.js';
import { WEAPONS, WEAPON_ORDER, FAMILIES, WIZARD_WEAPON, weaponFor, nextWeapon, weaponSpell, isWeapon } from '../../src/game/weapons.js';
import { isAction } from '../../src/net/protocol.js';
import { snapshotState, applySnapshot } from '../../src/net/snapshot.js';
import { WIZARDS } from '../../src/wizard-rig.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const DT = 1 / 60;
const game = (weapon = 'sword') => {
  seedRandom(5);
  const g = createGame('ember_pyromancer', 'destroyer');
  g.mode = 'play'; g.waveT = 1e9; g.enemies = [];
  g.player.x = 0; g.player.z = 0; g.player.fx = 0; g.player.fz = -1;
  g.player.weapon = weapon;
  return g;
};
// A dummy that stands still, takes hits and never fights back.
const dummy = (g, x, z, { kind = 'thrall', hp = 5000, face } = {}) => {
  const T = ENEMY_TYPES[kind];
  const e = { id: g.nid++, kind, T, x, z, vx: 0, vz: 0, kvx: 0, kvz: 0, r: T.r, mass: 1e9, hp, maxHp: hp, speed: 0, resist: T.resist,
    face: face ?? Math.atan2(-x, -z), st: newStatus(), state: 'recover', stateT: 1e9, atkCd: 1e9, flash: 0, dotAcc: 0, strafe: 1,
    aimX: 0, aimZ: 1, slamX: 0, slamZ: 0, hitDone: false };
  g.enemies.push(e);
  return e;
};
const run = (g, seconds, first = [], aim = { x: 0, z: -8 }, every = []) => {
  const out = [];
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) out.push(...step(g, { move: { x: 0, z: 0 }, aim, actions: i === 0 ? first : every }, DT));
  return out;
};
const types = (ev, t) => ev.filter((e) => e.type === t);
const hurt = (e) => e.maxHp - e.hp;

test('the armory: two dozen weapons in every family, every element on a blade', () => {
  assert.ok(WEAPON_ORDER.length >= 24, `${WEAPON_ORDER.length} weapons`);
  for (const f of Object.keys(FAMILIES)) assert.ok(WEAPON_ORDER.filter((id) => WEAPONS[id].family === f).length >= 2, f);
  for (const el of Object.keys(ELEMENTS)) assert.ok(WEAPON_ORDER.some((id) => WEAPONS[id].els.includes(el)), el + ' has a weapon');
  assert.equal(new Set(WEAPON_ORDER.map((id) => WEAPONS[id].name)).size, WEAPON_ORDER.length, 'names are unique');
  for (const id of WEAPON_ORDER) {
    const W = WEAPONS[id];
    assert.ok(W.name && W.desc && FAMILIES[W.family], id);
    assert.ok(W.dmg > 0 && W.cd > 0 && W.windup >= 0 && W.windup < W.cd, id + ' timing');
    if (W.kind === 'melee') assert.ok(W.range > 0 && W.arc > 0 && W.arc <= 360, id + ' reach');
    else { assert.equal(W.kind, 'ranged', id); assert.ok(W.speed > 0 && W.life > 0 && W.shot, id + ' flight'); }
    for (const el of W.els) assert.ok(ELEMENTS[el], `${id}: ${el}`);
  }
  for (const w of WIZARDS) assert.ok(isWeapon(weaponFor(w.id)) && WIZARD_WEAPON[w.id], w.id + ' starts armed');
  const seen = new Set();
  let id = WEAPON_ORDER[0];
  for (let i = 0; i < WEAPON_ORDER.length; i++) { seen.add(id); id = nextWeapon(id); }
  assert.equal(seen.size, WEAPON_ORDER.length, 'next walks the whole armory');
  assert.equal(id, WEAPON_ORDER[0], 'and wraps');
  assert.equal(nextWeapon(WEAPON_ORDER[0], -1), WEAPON_ORDER.at(-1));
});

test('a weapon hit is a payload: steel damage, plus the element and its statuses', () => {
  const sword = weaponSpell('sword').payload;
  assert.deepEqual(sword.parts, { steel: 9 });
  assert.deepEqual(sword.els, ['steel']);
  const ember = weaponSpell('flame_sword').payload;
  assert.equal(ember.parts.steel, 7);
  assert.equal(ember.parts.fire, 5);
  assert.ok(ember.burn > 0 && ember.burnDps > 0, 'it burns');
  assert.equal(weaponSpell('warhammer').payload.blunt, true);
  assert.ok(weaponSpell('tide_trident').payload.wet > 0, 'the trident soaks');
  assert.ok(weaponSpell('venom_daggers').payload.root < ELEMENTS.nature.hit.root, 'fast blades carry less of their status');
  assert.equal(weaponSpell('sword'), weaponSpell('sword'), 'built once');
  assert.equal(weaponSpell('laser'), null);
});

test('a sword cuts what is in front and in reach, not what is behind or far, and costs no energy', () => {
  const g = game('sword');
  const front = dummy(g, 0, -1.5), back = dummy(g, 0, 1.6), far = dummy(g, 0, -4);
  const e0 = g.player.energy;
  const ev = run(g, 0.4, ['attack']);
  assert.ok(hurt(front) > 0, 'the foe in front is cut');
  assert.equal(hurt(back), 0, 'not the one behind');
  assert.equal(hurt(far), 0, 'not the one out of reach');
  assert.equal(g.player.energy, Math.min(g.player.maxEnergy, e0), 'no energy spent');
  assert.equal(types(ev, 'swing').length, 1);
  const st = types(ev, 'strike');
  assert.equal(st.length, 1);
  assert.equal(st[0].hits, 1);
  assert.equal(st[0].weapon, 'sword');
});

test('the cooldown holds; holding the button strikes again once it is up', () => {
  const g = game('greataxe');
  const foe = dummy(g, 0, -1.5);
  run(g, 0.3, ['attack']);
  const one = hurt(foe);
  assert.ok(one > 0);
  run(g, 0.2, ['attack']);
  assert.equal(hurt(foe), one, 'a press during the cooldown does nothing');
  run(g, 2.2, [], { x: 0, z: -8 }, ['reattack']);
  assert.ok(hurt(foe) >= one * 3, 'held, it keeps chopping');
});

test('no attack while frozen, stunned or winding up a spell; no spell while swinging', () => {
  for (const set of [(p) => { p.st.frozen = 2; }, (p) => { p.st.stun = 2; }]) {
    const g = game('sword');
    const foe = dummy(g, 0, -1.5);
    set(g.player);
    assert.equal(types(run(g, 0.3, ['attack']), 'swing').length, 0);
    assert.equal(hurt(foe), 0);
  }
  const g = game('greataxe');
  run(g, DT, ['el:fire', 'cast']);
  assert.ok(g.player.wind, 'a spell is winding up');
  assert.equal(types(run(g, DT, ['attack']), 'swing').length, 0, 'the weapon waits for the spell');
  const h = game('greataxe');
  run(h, DT, ['attack']);
  assert.ok(h.player.swing, 'the axe is up');
  run(h, DT, ['el:fire', 'cast']);
  assert.equal(h.player.wind, null, 'the spell waits for the swing');
});

test('a crossbow bolt flies to a far foe and passes through into the one behind it', () => {
  const g = game('crossbow');
  const a = dummy(g, 0, -7), b = dummy(g, 0, -9);
  const ev = run(g, 1.0, ['attack']);
  assert.equal(types(ev, 'shoot').length, 1);
  assert.ok(hurt(a) > 0 && hurt(b) > 0, 'both are struck');
  assert.equal(g.shots.length, 0, 'and the bolt is spent');
  assert.equal(types(ev, 'impact').length, 0, 'weapon shots end in their own event');
});

test('a blunderbuss fires a spread of pellets; a sling lobs its stone', () => {
  const g = game('blunderbuss');
  run(g, 0.15, ['attack']);
  assert.equal(g.shots.filter((b) => b.weapon === 'blunderbuss').length, WEAPONS.blunderbuss.count);
  const h = game('sling');
  run(h, 0.2, ['attack']);
  const stone = h.shots.find((b) => b.weapon === 'sling');
  assert.ok(stone && stone.arc && stone.y > 0, 'the stone arcs');
  const ev = run(h, 1.5);
  assert.ok(types(ev, 'weaponImpact').length >= 1, 'and lands');
});

test('elements on weapons react: the wet conduct, ice freezes, blunt shatters, fire burns, light blinds', () => {
  const dry = game('thunder_maul'), wet = game('thunder_maul');
  const d1 = dummy(dry, 0, -1.5), d2 = dummy(wet, 0, -1.5);
  d2.st.wet = 5;
  run(dry, 0.4, ['attack']);
  const ev = run(wet, 0.4, ['attack']);
  assert.ok(hurt(d2) > hurt(d1), 'more to the wet');
  assert.ok(ev.some((e) => e.type === 'tag' && e.tag === 'conduct'));

  const ice = game('frost_axe');
  const f = dummy(ice, 0, -1.5);
  const iev = run(ice, 3.2, [], { x: 0, z: -8 }, ['reattack']);
  assert.ok(iev.some((e) => e.type === 'tag' && e.tag === 'freeze'), 'three chops freeze');

  const ham = game('warhammer');
  const fr = dummy(ham, 0, -1.5);
  fr.st.frozen = 5;
  const hev = run(ham, 0.4, ['attack']);
  assert.ok(hev.some((e) => e.type === 'tag' && e.tag === 'shatter'), 'shatter');
  assert.equal(fr.st.frozen, 0);
  assert.ok(hurt(fr) > WEAPONS.warhammer.dmg * 2, 'for more than double');

  const fire = game('flame_sword');
  const b = dummy(fire, 0, -1.5);
  run(fire, 0.3, ['attack']);
  assert.ok(b.st.burn > 0, 'Emberbrand burns');

  const sun = game('sun_mace');
  const s = dummy(sun, 0, -1.5);
  run(sun, 0.4, ['attack']);
  assert.ok(s.st.blind > 0, 'the mace blinds');
});

test('a bulwark shield turns half of a frontal blow', () => {
  const g = game('sword'), h = game('sword');
  const front = dummy(g, 0, -1.5, { kind: 'bulwark', face: 0 }); // faces +z, toward the player
  const back = dummy(h, 0, -1.5, { kind: 'bulwark', face: Math.PI }); // faces away
  run(g, 0.3, ['attack']);
  run(h, 0.3, ['attack']);
  assert.ok(hurt(front) > 0 && hurt(front) < hurt(back) * 0.75, `${hurt(front)} vs ${hurt(back)}`);
});

test('switching: next and previous wrap, a name picks, nonsense is ignored', () => {
  const g = game('sword');
  const ev = run(g, DT, ['weapon:next']);
  assert.equal(g.player.weapon, nextWeapon('sword'));
  assert.equal(types(ev, 'weapon')[0]?.weapon, g.player.weapon);
  run(g, 0.5, ['weapon:flail']);
  assert.equal(g.player.weapon, 'flail');
  run(g, 0.5, ['weapon:laser']);
  assert.equal(g.player.weapon, 'flail');
  run(g, 0.5, ['weapon:prev']);
  assert.equal(g.player.weapon, nextWeapon('flail', -1));
  assert.equal(createGame('rime_cryomancer').player.weapon, 'frost_axe', 'each wizard starts with their own');
  const h = game('greataxe');
  run(h, DT, ['attack']);
  assert.ok(h.player.swing);
  run(h, DT, ['weapon:pistol']);
  assert.equal(h.player.weapon, 'pistol', 'a switch mid-swing is not lost');
  assert.equal(h.player.swing, null, 'it drops the blow');
  assert.ok(h.player.wcd > 0, 'but not the cooldown');
});

test('co-op: the room accepts weapon actions, and a snapshot keeps the weapon and its shots', () => {
  for (const a of ['attack', 'reattack', 'weapon:next', 'weapon:prev', 'weapon:flail']) assert.ok(isAction(a), a);
  for (const a of ['weapon:laser', 'weapon:', 'attack!']) assert.ok(!isAction(a), a);
  const g = createCoopGame([{ wizard: 'storm_conduit' }]);
  g.mode = 'play'; g.waveT = 1e9;
  g.players[0].weapon = 'crossbow';
  step(g, { players: { p1: { move: { x: 0, z: 0 }, aim: { x: 0, z: -9 }, actions: ['attack'] } } }, DT);
  for (let i = 0; i < 6; i++) step(g, { players: {} }, DT);
  assert.ok(g.shots.some((b) => b.weapon === 'crossbow'), 'a bolt is in the air');
  const snap = JSON.parse(JSON.stringify(snapshotState(g)));
  const c = createCoopGame([]); c.meId = 'p1';
  applySnapshot(c, snap);
  assert.equal(c.player.weapon, 'crossbow');
  const bolt = c.shots.find((b) => b.weapon === 'crossbow');
  assert.ok(bolt && bolt.sp && bolt.sp.weapon === 'crossbow', 'the bolt is rebuilt as a weapon hit');
});

test('the game is wired: keys, the HUD tile, the armory, the phone button and the models', async () => {
  const input = read('src/game/input.js');
  assert.match(input, /KeyQ[\s\S]*'attack'/);
  assert.match(input, /KeyC[\s\S]*'weapon:next'/);
  const app = read('src/App.tsx');
  assert.match(app, /id="t-weapon"/);
  assert.match(app, /id="m-armory"/);
  assert.match(read('src/game/hud.js'), /onWeapon/);
  assert.match(read('src/game/touch.js'), /t-weapon/);
  const { buildWeaponModel, buildShotModel } = await import('../../src/game/weapon-models.js');
  for (const id of WEAPON_ORDER) {
    const m = buildWeaponModel(id);
    let meshes = 0;
    m.traverse((o) => { if (o.isMesh || o.isLine) meshes++; });
    assert.ok(meshes >= 2, `${id}: ${meshes} parts`);
    if (WEAPONS[id].kind === 'ranged') assert.ok(buildShotModel(id), id + ' has a projectile');
  }
});
