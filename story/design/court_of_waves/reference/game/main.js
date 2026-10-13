// Wires input → sim → renderer/HUD on a fixed 60 Hz simulation step.
import { createGame, step } from './sim.js';
import { createView } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { WIZARDS } from '../wizard-rig.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const params = new URLSearchParams(location.search);
let wizardId = WIZARDS.some((w) => w.id === params.get('w')) ? params.get('w') : 'ember_pyromancer';

const view = createView(canvas, overlay);
const input = createInput(canvas);
let game = createGame(wizardId);
view.reset(game);

function newGame(mode) {
  game = createGame(wizardId);
  game.mode = mode;
  view.reset(game);
  hud.reset();
  input.focus();
}

const hud = createHud({
  wizards: WIZARDS,
  wizardId,
  onPick(id) {
    wizardId = id;
    game.player.wizard = id;
    view.setWizard(id);
    history.replaceState(null, '', '?w=' + id);
  },
  onStart() { game.mode = 'play'; input.focus(); },
  onResume() { if (game.mode === 'paused') game.mode = 'play'; input.focus(); },
  onPause() { if (game.mode === 'play') game.mode = 'paused'; },
  onRestart() { newGame('play'); },
  onMenu() { newGame('menu'); },
  onElement(el) { input.push('el:' + el); }
});

const STEP = 1 / 60;
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const f = input.read();
  if (f.actions.includes('restart') && (game.mode === 'dead' || game.mode === 'paused')) newGame('play');
  if (game.mode === 'menu' && f.actions.includes('cast')) f.actions = [];
  let actions = f.actions.filter((a) => a !== 'restart');
  const aim = view.screenToGround(f.ndc.x, f.ndc.y);
  const events = [];
  acc += dt;
  while (acc >= STEP) {
    events.push(...step(game, { move: f.move, aim, actions }, STEP));
    actions = [];
    acc -= STEP;
  }
  if (actions.length) input.requeue(actions);
  view.consume(events, game);
  view.render(game, game.mode === 'paused' ? 0 : dt);
  hud.update(game, events, dt);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play') game.mode = 'paused';
  last = performance.now();
});

// test hook
window.__arena = { get game() { return game; }, step, createGame, input };
