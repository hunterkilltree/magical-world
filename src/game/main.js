// Wires input → sim → renderer/HUD on a fixed 60 Hz simulation step.
// Co-op (R-082): in a room the sim runs on the server; this page sends input and draws snapshots.
import { createGame, createCoopGame, createCampaignGame, step } from './sim.js';
import { CAMPAIGN } from './campaign-data.js';
import { createProfileStore } from './profile.js';
import { createView } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { WIZARDS } from '../wizard-rig.js';
import { createAudio } from './audio.js';
import { ROLES, WIZARD_ROLE } from './roles.js';
import { createDemo } from './demo.js';
import { createNetClient, forMe } from '../net/client.js';
import { createSnapBuffer } from '../net/interp.js';

const SEND_EVERY = 1 / 30; // input messages per second, online
const LOCAL_ONLY = new Set(['pause', 'restart', 'mute', 'recast']);

export function initGame() {
  const canvas = document.getElementById('game');
  const overlay = document.getElementById('overlay');
  if (!canvas || !overlay) return () => {};

  const params = new URLSearchParams(window.location.search);
  let wizardId = WIZARDS.some((w) => w.id === params.get('w')) ? params.get('w') : 'ember_pyromancer';
  let roleId = ROLES[params.get('r')] ? params.get('r') : null; // null: follow the wizard's default role
  const roleOf = () => roleId ?? WIZARD_ROLE[wizardId] ?? 'destroyer';
  const THEMES = ['court', 'forest'];
  let themeId = THEMES.includes(params.get('a')) ? params.get('a') : 'court';
  // ?c=<chapter id> plays that campaign chapter (R-090); without it, quick play as always.
  let chapterId = CAMPAIGN.byId[params.get('c')] ? params.get('c') : null;
  const make = () => {
    if (chapterId) return createCampaignGame(wizardId, roleOf(), CAMPAIGN.byId[chapterId]);
    const g = createGame(wizardId, roleOf()); g.theme = themeId; return g;
  };
  // A cleared chapter leads to the next one's briefing (the menu), or back to quick play after the last.
  const nextChapter = (next) => {
    chapterId = next;
    try { const q = new URLSearchParams(window.location.search); if (next) q.set('c', next); else q.delete('c'); history.replaceState(null, '', '?' + q.toString()); } catch (e) {}
    newGame('menu');
  };
  const saveUrl = () => {
    try {
      const q = new URLSearchParams(window.location.search);
      q.set('w', wizardId);
      if (roleId) q.set('r', roleId); else q.delete('r');
      if (themeId !== 'court') q.set('a', themeId); else q.delete('a');
      history.replaceState(null, '', '?' + q.toString());
    } catch (e) {}
  };

  const view = createView(canvas, overlay);
  const audio = createAudio();
  const initAudio = () => audio.init();
  ['pointerdown', 'keydown'].forEach((t) => window.addEventListener(t, initAudio, { capture: true }));
  const input = createInput(canvas);
  let game = make();
  view.reset(game);

  // R-091: what the player has earned is kept between runs: best wave and score per wizard, grimoire pages, cleared chapters.
  const profile = createProfileStore();
  const rememberRun = (g) => {
    if (!g || !g.player || online?.drawing) return;
    if (g.stats?.found?.size) profile.recordPages([...g.stats.found]);
    if (!g.campaign && g.wave > 0) profile.recordRun({ wizard: g.player.wizard, wave: g.wave, score: g.score });
  };

  function newGame(mode) {
    rememberRun(game); // a run given up on counts too
    game = make();
    game.mode = mode;
    view.reset(game);
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

  const hud = createHud({
    wizards: WIZARDS,
    wizardId,
    roleOf,
    themeOf: () => themeId,
    bestOf: (id) => profile.bestOf(id),
    lastRun: () => profile.lastRun,
    onArena(id) { if (game.campaign) return; themeId = id; const mode = game.mode; game.theme = id; view.reset(game); game.mode = mode; demo.poke(); saveUrl(); },
    onPick(id) {
      wizardId = id;
      game.player.wizard = id;
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
    onStart() { game.player.wind = null; game.player.castT = 0; game.mode = 'play'; if (game.campaign) input.push('begin'); input.focus(); },
    onResume() { if (game.mode === 'paused') game.mode = 'play'; input.focus(); },
    onPause() { if (!online?.drawing && game.mode === 'play') game.mode = 'paused'; },
    onRestart() { if (online) { if (online.client.isHost) online.client.start(); } else newGame('play'); },
    onMenu() { if (online) dropOnline(); else newGame('menu'); },
    onElement(el) { input.push('el:' + el); },
    onMute() { hud.setMuted(audio.toggle()); },
    onCreate(name) { goOnline(null, name); },
    onJoin(code, name) { goOnline(code, name); },
    onLeave() { dropOnline(); hud.setNetStatus(''); },
    onReady(r) { online?.client.ready(r); },
    onGo() { online?.client.start(); }
  });
  hud.setMuted(audio.muted);

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
    if (!o.drawing) { o.drawing = true; view.reset(g); hud.reset(); input.focus(); }
    if (f.actions.includes('mute')) hud.setMuted(audio.toggle());
    if (f.actions.includes('restart') && g.mode === 'dead' && o.client.isHost) o.client.start();
    const held = f.actions.includes('recast');
    for (const a of f.actions) if (!LOCAL_ONLY.has(a)) o.actions.push(a);
    const aim = view.screenToGround(f.ndc.x, f.ndc.y);
    o.sendT += dt;
    if (o.sendT >= SEND_EVERY || o.actions.length) {
      o.sendT = 0;
      o.client.sendInput({ move: f.move, aim, actions: [...o.actions.splice(0, 11), ...(held ? ['recast'] : [])] });
    }
    const mine = forMe(events, o.client.me);
    view.consume(events, g);
    audio.play(mine, g);
    view.render(g, dt);
    hud.update(g, mine, dt);
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (online?.game) { onlineFrame(now, dt); if (online?.drawing) return; }
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
    for (const e of events) {
      if (e.type === 'playerDeath') rememberRun(game);
      else if (e.type === 'chapterClear') { profile.recordPages([...game.stats.found]); profile.recordChapter({ id: e.id, unlocks: e.unlocks, lessons: e.lessons, retries: e.retries, choices: {} }); }
    }
    const done = events.find((e) => e.type === 'chapterDone');
    if (done) { nextChapter(done.next); return; }
    const preview = demo.update(game, dt);
    if (preview.length) view.consume(preview, game);
    view.consume(events, game);
    audio.play(events, game);
    view.render(game, game.mode === 'paused' ? 0 : dt);
    hud.update(game, events, dt);
  }
  rafId = requestAnimationFrame(frame);

  const onVisChange = () => {
    if (document.hidden && game.mode === 'play' && !online?.drawing) game.mode = 'paused';
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisChange);
  const onHide = () => rememberRun(game);
  window.addEventListener('pagehide', onHide);

  // test hook
  window.__arena = { get game() { return online?.drawing ? online.game : game; }, step, createGame, input, get online() { return online; } };

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    dropOnline();
    document.removeEventListener('visibilitychange', onVisChange);
    window.removeEventListener('pagehide', onHide);
    ['pointerdown', 'keydown'].forEach((t) => window.removeEventListener(t, initAudio, { capture: true }));
  };
}
