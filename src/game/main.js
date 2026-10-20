// Wires input → sim → renderer/HUD on a fixed 60 Hz simulation step.
// Co-op (R-082): in a room the sim runs on the server; this page sends input and draws snapshots.
// R-110: the frame loop is guarded (a throwing frame is retried, then the quality drops, then a card replaces the game)
// and a governor lowers the graphics tier when frames run slow. R-111: touch controls on phones.
import { createGame, createCoopGame, step } from './sim.js';
import { createView } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { WIZARDS } from '../wizard-rig.js';
import { createAudio } from './audio.js';
import { ROLES, WIZARD_ROLE } from './roles.js';
import { createDemo } from './demo.js';
import { createNetClient, forMe } from '../net/client.js';
import { createSnapBuffer } from '../net/interp.js';
import { PROFILES, TIER_ORDER, isTier, pickTier, createGovernor, createFaultGuard, safeGet, safeSet } from './quality.js';
import { readTouchEnv, createTouchControls, aimPoint } from './touch.js';
import { showFatal, FATAL } from './fatal.js';
import { isWeapon, weaponFor } from './weapons.js';

const SEND_EVERY = 1 / 30; // input messages per second, online
const LOCAL_ONLY = new Set(['pause', 'restart', 'mute', 'recast', 'reattack']);
const QUALITY_KEY = 'cow_quality'; // 'auto' or a tier name, saved by the Graphics row in the menu

// Sound is optional: if it cannot start, the game plays on in silence.
const SILENT = { init() {}, play() {}, toggle: () => true, setVolume() {}, muted: true };
function makeAudio() { try { return createAudio(); } catch (err) { console.warn('[audio] off', err); return SILENT; } }

export function initGame() {
  const canvas = document.getElementById('game');
  const overlay = document.getElementById('overlay');
  if (!canvas || !overlay) return () => {};

  const params = new URLSearchParams(window.location.search);
  const env = readTouchEnv(window);
  if (env.touch) document.body.classList.add('touch'); // before the HUD is built, so it can pick the touch texts
  let wizardId = WIZARDS.some((w) => w.id === params.get('w')) ? params.get('w') : 'ember_pyromancer';
  let roleId = ROLES[params.get('r')] ? params.get('r') : null; // null: follow the wizard's default role
  const roleOf = () => roleId ?? WIZARD_ROLE[wizardId] ?? 'destroyer';
  const THEMES = ['court', 'forest'];
  let themeId = THEMES.includes(params.get('a')) ? params.get('a') : 'court';
  // R-112: the weapon picked in the Armory (or ?k=); null follows the wizard's own
  let weaponId = isWeapon(params.get('k')) ? params.get('k') : null;
  const weaponOf = () => weaponId ?? weaponFor(wizardId);
  const make = () => { const g = createGame(wizardId, roleOf()); g.theme = themeId; g.player.weapon = weaponOf(); return g; };
  const saveUrl = () => {
    try {
      const q = new URLSearchParams(window.location.search);
      q.set('w', wizardId);
      if (roleId) q.set('r', roleId); else q.delete('r');
      if (themeId !== 'court') q.set('a', themeId); else q.delete('a');
      if (weaponId) q.set('k', weaponId); else q.delete('k');
      history.replaceState(null, '', '?' + q.toString());
    } catch (e) {}
  };

  // ---------------------------------------------------------------- graphics quality (R-110)
  let deviceEnv = null; // what the device told us, for picking a tier again from the menu
  let pick = null;
  let governor = null;
  let view;
  let hud = null;
  let contextLost = false;
  try {
    view = createView(canvas, overlay, {
      choose(caps) {
        deviceEnv = { deviceMemory: navigator.deviceMemory, cores: navigator.hardwareConcurrency, phone: env.phone, ...caps };
        pick = pickTier({ ...deviceEnv, param: params.get('q'), stored: safeGet(QUALITY_KEY) });
        return pick.tier;
      },
      onContext(state) {
        if (state === 'lost') {
          contextLost = true;
          if (game.mode === 'play' && !online?.drawing) game.mode = 'paused';
          hud?.toast('Graphics were interrupted · recovering');
        } else {
          contextLost = false;
          last = performance.now();
          hud?.toast('Graphics are back');
        }
      },
      onDisable(layer) { hud?.toast(`The ${layer} effects layer was switched off after errors`); }
    });
  } catch (err) {
    console.error('[view] could not start', err);
    showFatal({ ...FATAL.nowebgl, detail: err?.cause?.message ?? err?.message });
    return () => {};
  }
  governor = createGovernor({ tier: pick.tier, max: pick.max, auto: pick.auto });
  document.body.dataset.quality = view.tier;
  const fault = createFaultGuard();
  const qualityState = () => ({ choice: governor.auto ? 'auto' : view.tier, tier: view.tier });
  function setTier(tier, why) {
    if (!isTier(tier) || tier === view.tier) return;
    view.setQuality(tier);
    document.body.dataset.quality = view.tier; // the stylesheet drops its blur on the weak tiers
    hud?.setQuality(qualityState());
    console.info(`[quality] ${why}: ${tier}`);
  }
  function chooseQuality(choice) {
    safeSet(QUALITY_KEY, choice);
    if (choice === 'auto') {
      pick = pickTier({ ...deviceEnv, stored: 'auto' }); // the menu overrides ?q=
      governor = createGovernor({ tier: pick.tier, max: pick.max, auto: true });
      setTier(pick.tier, 'menu');
    } else if (isTier(choice)) {
      governor.force(choice);
      setTier(choice, 'menu');
    }
    hud?.setQuality(qualityState());
  }

  const audio = makeAudio();
  const initAudio = () => audio.init();
  // iOS only unlocks sound on touchend / click, not on pointerdown
  const AUDIO_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'];
  AUDIO_EVENTS.forEach((t) => window.addEventListener(t, initAudio, { capture: true }));
  const input = createInput(canvas);
  let game = make();
  view.reset(game);

  function newGame(mode) {
    game = make();
    game.mode = mode;
    view.reset(game);
    view.clearFaults();
    hud.reset();
    input.focus();
  }

  // ---------------------------------------------------------------- co-op
  // online: {client, buffer, game (the server's world, as last drawn), drawing, sendT, actions}
  let online = null;

  async function goOnline(code, name) {
    if (online) return;
    hud.setNetStatus('Connecting…');
    const o = { client: null, buffer: createSnapBuffer({ delayMs: 100 }), game: null, drawing: false, sendT: 0, actions: [] };
    online = o;
    o.client = createNetClient({
      onWelcome(m) { hud.setNetStatus('Room ' + m.room); o.client.pick(wizardId, roleId); },
      onLobby(m) {
        hud.setLobby(m, o.client.me);
        const mine = m.players.find((p) => p.id === o.client.me);
        if (mine) hud.syncPick(mine.wizard);
      },
      onSnap(m) {
        if (!o.game) { o.game = createCoopGame([]); o.game.meId = o.client.me; }
        o.buffer.push(m, performance.now());
      },
      onError(m) {
        hud.setNetStatus(m.message ?? m.code, true);
        if (!o.client.me) dropOnline(); // the join itself failed: no room, or it is full
      },
      onClose() { if (online === o) { dropOnline(); hud.setNetStatus('Lost the connection to the server', true); } }
    });
    try {
      await o.client.connect();
    } catch {
      if (online === o) { online = null; hud.setNetStatus('Could not reach the co-op server (is `npm run server` running?)', true); }
      return;
    }
    o.client.join(code, name);
  }

  function dropOnline() {
    const o = online;
    if (!o) return;
    online = null;
    try { o.client.leave(); o.client.close(); } catch {}
    hud.setOffline();
    if (o.drawing) { game.mode = 'menu'; view.reset(game); hud.reset(); }
  }

  hud = createHud({
    wizards: WIZARDS,
    wizardId,
    roleOf,
    themeOf: () => themeId,
    onArena(id) { themeId = id; const mode = game.mode; game.theme = id; view.reset(game); game.mode = mode; demo.poke(); saveUrl(); },
    onPick(id) {
      wizardId = id;
      game.player.wizard = id;
      if (!weaponId) { game.player.weapon = weaponFor(id); hud.setWeapon(game.player.weapon); }
      game.player.role = roleOf();
      view.setWizard(id);
      demo.poke();
      saveUrl();
      if (online?.client.me) online.client.pick(wizardId, roleId);
    },
    onRole(id) {
      roleId = id; game.player.role = id; demo.poke(); saveUrl();
      if (online?.client.me) online.client.pick(wizardId, roleId);
    },
    onStart() { game.player.wind = null; game.player.castT = 0; game.mode = 'play'; input.focus(); },
    onResume() { if (game.mode === 'paused') game.mode = 'play'; input.focus(); },
    onPause() { if (!online?.drawing && game.mode === 'play') game.mode = 'paused'; },
    onRestart() { if (online) { if (online.client.isHost) online.client.start(); } else newGame('play'); },
    onMenu() { if (online) dropOnline(); else newGame('menu'); },
    onElement(el) { input.push('el:' + el); },
    onMute() { hud.setMuted(audio.toggle()); },
    weaponOf,
    onWeapon(id) { weaponId = id; game.player.weapon = id; demo.poke(); saveUrl(); },
    onQuality: chooseQuality,
    onCreate(name) { goOnline(null, name); },
    onJoin(code, name) { goOnline(code, name); },
    onLeave() { dropOnline(); hud.setNetStatus(''); },
    onReady(r) { online?.client.ready(r); },
    onGo() { online?.client.start(); }
  });
  hud.setMuted(audio.muted);
  hud.setQuality(qualityState());
  const touchControls = env.touch ? createTouchControls({ canvas, input }) : null;

  // Where the player aims: the pad on a phone, else the mouse (or the last tap).
  const aimOf = (f, g) => {
    if (f.aimDir && g.player) { const a = aimPoint(f.aimDir, g.player, g.enemies); view.setAim(a.x, a.z); return a; }
    return view.screenToGround(f.ndc.x, f.ndc.y);
  };

  const STEP = 1 / 60;
  const demo = createDemo();
  let acc = 0, last = performance.now();
  let rafId = 0;
  let running = true;

  // One frame of a co-op run: send what the player does, draw the server's world ~100 ms behind.
  function onlineFrame(now, dt) {
    const o = online, g = o.game;
    const f = input.read();
    const events = o.buffer.advance(g, now);
    if (!g.player) return;
    if (!o.drawing) { o.drawing = true; view.reset(g); hud.reset(); input.focus(); o.actions.push('weapon:' + weaponOf()); }
    if (f.actions.includes('mute')) hud.setMuted(audio.toggle());
    if (f.actions.includes('restart') && g.mode === 'dead' && o.client.isHost) o.client.start();
    const held = f.actions.includes('recast'), wheld = f.actions.includes('reattack');
    for (const a of f.actions) if (!LOCAL_ONLY.has(a)) o.actions.push(a);
    const aim = aimOf(f, g);
    o.sendT += dt;
    if (o.sendT >= SEND_EVERY || o.actions.length) {
      o.sendT = 0;
      o.client.sendInput({ move: f.move, aim, actions: [...o.actions.splice(0, 10), ...(held ? ['recast'] : []), ...(wheld ? ['reattack'] : [])] });
    }
    const mine = forMe(events, o.client.me);
    view.consume(events, g);
    audio.play(mine, g);
    view.render(g, dt);
    hud.update(g, mine, dt);
  }

  function runFrame(now, dt) {
    if (online?.game) { onlineFrame(now, dt); if (online?.drawing) return; }
    const f = input.read();
    if (f.actions.includes('restart') && (game.mode === 'dead' || game.mode === 'paused')) newGame('play');
    if (game.mode === 'menu' && f.actions.includes('cast')) f.actions = [];
    if (f.actions.includes('mute')) hud.setMuted(audio.toggle());
    let actions = f.actions.filter((a) => a !== 'restart' && a !== 'mute');
    const aim = aimOf(f, game);
    const events = [];
    acc += dt;
    while (acc >= STEP) {
      const out = step(game, { move: f.move, aim, actions }, STEP);
      for (let i = 0; i < out.length; i++) events.push(out[i]);
      actions = [];
      acc -= STEP;
    }
    if (actions.length) input.requeue(actions);
    const preview = demo.update(game, dt);
    if (preview.length) view.consume(preview, game);
    view.consume(events, game);
    audio.play(events, game);
    for (const e of events) if (e.type === 'weapon' && e.pid === game.player.id) { weaponId = e.weapon; hud.setWeapon(e.weapon); saveUrl(); } // the next run starts with it
    view.render(game, game.mode === 'paused' ? 0 : dt);
    hud.update(game, events, dt);
  }

  // The slower of the tier's own frame cap and 60 fps on a phone (a 120 Hz screen would only burn the battery).
  const fpsCap = () => { const a = PROFILES[view.tier].maxFps, b = env.phone ? 60 : 0; return a && b ? Math.min(a, b) : a || b; };

  function onFault(err) {
    console.error('[frame]', err);
    acc = 0;
    const verdict = fault.fault(err);
    if (verdict === 'degrade') {
      const lower = TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(view.tier) - 1)];
      governor.force(lower);
      setTier(lower, 'errors');
      hud?.toast('Lowered the graphics after an error');
    } else if (verdict === 'stop') {
      running = false;
      cancelAnimationFrame(rafId);
      showFatal({ ...FATAL.stopped, detail: err?.message });
    }
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (contextLost || view.lost) { last = now; return; }
    const cap = fpsCap();
    if (cap && now - last < 1000 / cap - 2) return; // too soon: `last` stays, so the next frame carries the whole gap
    const rawMs = now - last;
    const dt = Math.min(0.05, rawMs / 1000);
    last = now;
    try {
      runFrame(now, dt);
      fault.ok();
    } catch (err) {
      onFault(err);
      return;
    }
    const change = governor.sample(cap ? rawMs * (60 / cap) : rawMs);
    if (change) {
      setTier(change.to, change.why);
      if (change.to !== change.from && TIER_ORDER.indexOf(change.to) < TIER_ORDER.indexOf(change.from)) hud.toast(`Graphics lowered to ${change.to} to keep the game smooth`);
    }
  }
  rafId = requestAnimationFrame(frame);

  const pauseIfPlaying = () => { if (game.mode === 'play' && !online?.drawing) game.mode = 'paused'; };
  const onVisChange = () => {
    if (document.hidden) pauseIfPlaying();
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisChange);
  window.addEventListener('pagehide', pauseIfPlaying);
  // a phone held upright shows the "turn sideways" card (styles.css): do not let the run go on behind it
  const upright = window.matchMedia?.('(orientation: portrait) and (pointer: coarse) and (max-width: 700px)');
  const onUpright = () => { if (upright.matches) pauseIfPlaying(); };
  upright?.addEventListener?.('change', onUpright);

  // test hook
  window.__arena = {
    get game() { return online?.drawing ? online.game : game; }, step, createGame, input, get online() { return online; },
    get view() { return view; }, get governor() { return governor; }, get quality() { return { tier: view.tier, auto: governor.auto, fps: governor.fps, max: governor.max }; }
  };

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    dropOnline();
    document.removeEventListener('visibilitychange', onVisChange);
    window.removeEventListener('pagehide', pauseIfPlaying);
    upright?.removeEventListener?.('change', onUpright);
    AUDIO_EVENTS.forEach((t) => window.removeEventListener(t, initAudio, { capture: true }));
    touchControls?.dispose();
    view.dispose();
  };
}

// Dev server: an edit to any game module would remount the page's game on top of the old renderer (a second WebGL
// renderer on the same canvas, back at the menu, sometimes hung). Reload the page cleanly instead.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
