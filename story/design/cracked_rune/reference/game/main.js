// Wires input → sim → renderer/HUD on a fixed 60 Hz simulation step.
import { createGame, step } from './sim.js';
import { createView } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { WIZARDS } from '../wizard-rig.js';
import { createAudio } from './audio.js';
import { ROLES, WIZARD_ROLE } from './roles.js';
import { createDemo } from './demo.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const params = new URLSearchParams(location.search);
let wizardId = WIZARDS.some((w) => w.id === params.get('w')) ? params.get('w') : 'ember_pyromancer';
let roleId = ROLES[params.get('r')] ? params.get('r') : null; // null: follow the wizard's default role
const roleOf = () => roleId ?? WIZARD_ROLE[wizardId] ?? 'destroyer';
const saveUrl = () => history.replaceState(null, '', '?w=' + wizardId + (roleId ? '&r=' + roleId : ''));

const view = createView(canvas, overlay);
const audio = createAudio();
['pointerdown', 'keydown'].forEach((t) => window.addEventListener(t, () => audio.init(), { capture: true }));
const input = createInput(canvas);
let game = createGame(wizardId, roleOf());
view.reset(game);

function newGame(mode) {
  game = createGame(wizardId, roleOf());
  game.mode = mode;
  view.reset(game);
  hud.reset();
  input.focus();
}

const hud = createHud({
  wizards: WIZARDS,
  wizardId,
  roleOf,
  onPick(id) {
    wizardId = id;
    game.player.wizard = id;
    game.player.role = roleOf();
    view.setWizard(id);
    demo.poke();
    saveUrl();
  },
  onRole(id) { roleId = id; game.player.role = id; demo.poke(); saveUrl(); },
  onStart() { game.player.wind = null; game.player.castT = 0; game.mode = 'play'; input.focus(); },
  onResume() { if (game.mode === 'paused') game.mode = 'play'; input.focus(); },
  onPause() { if (game.mode === 'play') game.mode = 'paused'; },
  onRestart() { newGame('play'); },
  onMenu() { newGame('menu'); },
  onElement(el) { input.push('el:' + el); },
  onMute() { hud.setMuted(audio.toggle()); }
});
hud.setMuted(audio.muted);

const STEP = 1 / 60;
const demo = createDemo();
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const f = input.read();
  if (f.actions.includes('restart') && (game.mode === 'dead' || game.mode === 'paused')) newGame('play');
  if (game.mode === 'menu' && f.actions.includes('cast')) f.actions = [];
  if (f.actions.includes('mute')) hud.setMuted(audio.toggle());
  let actions = f.actions.filter((a) => a !== 'restart' && a !== 'mute');
  const aim = view.screenToGround(f.ndc.x, f.ndc.y);
  const events = [];
  acc += dt;
  while (acc >= STEP) {
    events.push(...step(game, { move: f.move, aim, actions }, STEP));
    actions = [];
    acc -= STEP;
  }
  if (actions.length) input.requeue(actions);
  const preview = demo.update(game, dt);
  if (preview.length) view.consume(preview, game);
  view.consume(events, game);
  audio.play(events, game);
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
