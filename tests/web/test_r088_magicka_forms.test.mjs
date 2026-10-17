import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, newStatus, seedRandom, unseedRandom } from '../../src/game/sim.js';
import { resolveSpell, COMBOS } from '../../src/game/spells.js';
import { FORMS } from '../../src/game/forms.js';
import { ENEMY_TYPES } from '../../src/game/enemies.js';
import DATA from '../../src/game/spells-data.js';
import { ROLE_ORDER } from '../../src/game/roles.js';

const DT = 1 / 60;
const game = (wizard = 'ember_pyromancer', role = 'destroyer') => {
  seedRandom(7);
  const g = createGame(wizard, role);
  g.mode = 'play'; g.waveT = 1e9; g.enemies = [];
  g.player.x = 0; g.player.z = 0;
  return g;
};
// A dummy that stands still, takes hits and never fights back.
const dummy = (g, x, z, hp = 5000) => {
  const T = ENEMY_TYPES.thrall;
  const e = { id: g.nid++, kind: 'thrall', T, x, z, vx: 0, vz: 0, kvx: 0, kvz: 0, r: T.r, mass: T.mass, hp, maxHp: hp, speed: 0, resist: T.resist,
    face: 0, st: newStatus(), state: 'recover', stateT: 1e9, atkCd: 1e9, flash: 0, dotAcc: 0, strafe: 1, aimX: 0, aimZ: 1, slamX: 0, slamZ: 0, hitDone: false };
  g.enemies.push(e);
  return e;
};
const run = (g, seconds, first = {}) => {
  const out = [];
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    out.push(...step(g, { move: { x: 0, z: 0 }, aim: first.aim ?? { x: 0, z: -8 }, actions: i === 0 ? first.actions ?? [] : [] }, DT));
  }
  return out;
};
const castActions = (key) => ['clear', ...key.split('+').map((e) => 'el:' + e), 'cast'];
const cast = (g, key, aim, seconds = 0.5) => run(g, seconds, { aim, actions: castActions(key) });
const types = (ev, t) => ev.filter((e) => e.type === t);
const hurt = (e) => e.maxHp - e.hp;
const forms = (f) => Object.entries(FORMS).filter(([, d]) => d.form === f);

test('twelve forms: three mines, three storms, three sprays, three arcs, none of them an old spell', () => {
  for (const f of ['mine', 'storm', 'spray', 'arc']) assert.equal(forms(f).length, 3, f);
  for (const key of Object.keys(FORMS)) assert.ok(!(key in DATA.combos), key + ' is new');
  assert.equal(Object.keys(COMBOS).length, Object.keys(DATA.combos).length + 12);
});

test('every role casts each form by its name (named mixes are shared)', () => {
  for (const [key, def] of Object.entries(FORMS)) {
    for (const role of ROLE_ORDER) assert.equal(resolveSpell(key.split('+'), role).name, def.name, `${role} ${key}`);
  }
});

test('a mine lies armed, ignores an empty court, and goes off when an enemy comes near', () => {
  const g = game();
  const ev = cast(g, 'arcane+earth+lightning', { x: 0, z: -6 });
  const mine = g.areas.find((a) => a.mine);
  assert.ok(mine, 'the mine is placed');
  assert.ok(types(ev, 'area').some((e) => e.mine), 'with an area event that says it is a mine');
  const quiet = run(g, 5);
  assert.equal(types(quiet, 'explode').length, 0, 'nothing happens while nobody is near');
  assert.ok(g.areas.includes(mine) && !mine.mine.fired);
  const foe = dummy(g, mine.x + 1, mine.z);
  const bang = run(g, 1);
  assert.equal(types(bang, 'mineTrip').length, 1);
  assert.ok(types(bang, 'explode').length >= 1);
  assert.ok(hurt(foe) > 20, 'the enemy is hurt');
  assert.ok(!g.areas.includes(mine), 'a mine goes off once');
});

test('a mine does not catch an enemy outside its trigger radius, and does not hurt its owner', () => {
  const g = game();
  cast(g, 'arcane+earth+ice', { x: 0, z: -6 });
  const mine = g.areas.find((a) => a.mine);
  const far = dummy(g, mine.x + mine.mine.trig + 2.5, mine.z);
  const hp0 = g.player.hp;
  run(g, 3);
  assert.ok(!mine.mine.fired);
  assert.equal(hurt(far), 0);
  dummy(g, mine.x + 0.5, mine.z);
  run(g, 1);
  assert.ok(mine.mine.fired || !g.areas.includes(mine), 'it goes off for the near one');
  assert.equal(g.player.hp, hp0, 'the wizard, standing well away, is untouched');
});

test('a mine fizzles away if nothing ever comes', () => {
  const g = game();
  cast(g, 'arcane+dark+nature', { x: 0, z: -6 });
  assert.equal(g.areas.filter((a) => a.mine).length, 1);
  run(g, FORMS['arcane+dark+nature'].life + 1);
  assert.equal(g.areas.filter((a) => a.mine).length, 0);
});

test('a storm strikes again and again over several seconds around its mark', () => {
  const g = game();
  const ev = run(g, 6, { aim: { x: 0, z: -7 }, actions: castActions('lightning+water+wind') });
  const d = FORMS['lightning+water+wind'];
  const strikes = types(ev, 'explode').filter((e) => e.key === 'lightning+water+wind');
  assert.equal(strikes.length, d.repeat, 'one burst per strike');
  const spots = new Set(strikes.map((e) => Math.round(e.x) + ',' + Math.round(e.z)));
  assert.ok(spots.size >= 4, 'the strikes fall in different places');
  const area = types(ev, 'area')[0];
  assert.ok(area.storm && area.scatter === d.scatter);
});

test('a spray keeps hurting what stands in its cone, and nothing outside it', () => {
  const g = game();
  const inside = dummy(g, 0, -4), beside = dummy(g, 5, 0), behind = dummy(g, 0, 4);
  const ev = run(g, 0.5, { aim: { x: 0, z: -8 }, actions: castActions('fire+fire+wind') });
  assert.ok(types(ev, 'cone').some((e) => e.channel), 'the cone event carries its duration');
  const early = hurt(inside);
  assert.ok(early > 0, 'the target in the cone is hurt');
  assert.ok(g.areas.some((a) => a.spray), 'the jet is still going');
  run(g, 0.7);
  assert.ok(hurt(inside) > early * 2, 'and keeps hurting it');
  assert.equal(hurt(beside), 0);
  assert.equal(hurt(behind), 0);
  run(g, 1);
  assert.ok(!g.areas.some((a) => a.spray), 'the spray ends by itself');
  const end = hurt(inside);
  run(g, 1);
  assert.equal(hurt(inside) - end <= 0.0001 || hurt(inside) - end < end * 0.2, true, 'it stops hurting once it ends');
});

test('a spray follows the aim of the wizard while it lasts', () => {
  const g = game();
  const left = dummy(g, -5, 0), ahead = dummy(g, 0, -5);
  run(g, 0.5, { aim: { x: 0, z: -8 }, actions: castActions('ice+ice+wind') });
  assert.ok(hurt(ahead) > 0);
  assert.equal(hurt(left), 0);
  run(g, 0.6, { aim: { x: -8, z: 0 } });
  assert.ok(hurt(left) > 0, 'turning the aim swings the jet onto the enemy on the left');
});

test('an arc forks to several enemies at once and spares the one out of range', () => {
  const g = game();
  const foes = [dummy(g, -2.5, -5), dummy(g, 0, -6), dummy(g, 2.5, -5), dummy(g, 0, -20)];
  const ev = run(g, 0.5, { aim: { x: 0, z: -8 }, actions: castActions('lightning+lightning+wind') });
  assert.ok(types(ev, 'chain').length >= 3, 'one bolt per fork');
  assert.ok(foes.slice(0, 3).every((e) => hurt(e) > 0), 'the three nearest enemies in front are struck');
  assert.equal(hurt(foes[3]), 0, 'the far one is out of range');
});

test('an arc with no target still flashes one bolt along the aim', () => {
  const g = game();
  const ev = run(g, 0.5, { aim: { x: 0, z: -8 }, actions: castActions('lightning+lightning+water') });
  assert.equal(types(ev, 'chain').length, 1);
});

test('the forms cost energy and run without errors for other wizards too', () => {
  for (const wiz of ['ember_pyromancer', 'void_necromancer', 'zephyr_galesinger']) {
    const g = game(wiz, 'trickster');
    dummy(g, 0, -4); dummy(g, 3, -5);
    for (const key of Object.keys(FORMS)) {
      const e0 = g.player.energy;
      cast(g, key, { x: 0, z: -6 });
      assert.ok(g.player.energy < e0, key + ' costs energy');
      run(g, 5.5); // long enough for any recharge
      g.player.energy = 100; g.player.hp = 100;
    }
    assert.ok(Number.isFinite(g.player.x));
  }
  unseedRandom();
});

test('mines and sprays survive a co-op snapshot', async () => {
  const { snapshotState, applySnapshot } = await import('../../src/net/snapshot.js');
  const { createCoopGame } = await import('../../src/game/sim.js');
  const g = game();
  cast(g, 'arcane+earth+ice', { x: 0, z: -6 });
  cast(g, 'fire+fire+wind', { x: 0, z: -6 }, 0.6);
  assert.ok(g.areas.some((a) => a.mine) && g.areas.some((a) => a.spray));
  const client = createCoopGame([]);
  applySnapshot(client, JSON.parse(JSON.stringify(snapshotState(g))));
  const mine = client.areas.find((a) => a.mine), spray = client.areas.find((a) => a.spray);
  assert.ok(mine && mine.mine.trig > 0 && mine.mine.fired === false, 'the mine arrives armed');
  assert.ok(spray && spray.spray.range === FORMS['fire+fire+wind'].range, 'and the spray with its range');
  assert.equal(mine.sp.def.name, 'Frost Mine');
});
