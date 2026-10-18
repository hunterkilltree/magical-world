// Touch controls for phones (R-111). The maths is pure so node can test it; createTouchControls adds the DOM.
//   left half of the arena  a floating move stick
//   Cast pad (#t-cast)      touch to cast, hold to recast, drag to aim (untouched it aims at the nearest enemy)
//   Area / Self / Dodge     the other ability tiles, now buttons
//   right half of the arena a tap aims and casts there, like a mouse click
import { TUNING } from './sim.js';

export const STICK_DEAD = 0.18;
const ASSIST_SCALE = 1.5; // the assist looks this far past the spell range
const FACING_DIST = 6;

// A drag of (dx, dy) screen pixels on a stick of `radius`. Screen-up is north (-z); the court camera looks along -z.
export function stickVector(dx, dy, radius, dead = STICK_DEAD) {
  const r = Math.hypot(dx, dy), mag = Math.min(1, r / Math.max(1, radius));
  if (mag < dead) return { x: 0, z: 0, mag: 0 };
  return { x: dx / r, z: dy / r, mag };
}

// The keyboard wins while a key is down; the stick fills in otherwise.
export function mergeMove(kb, tv) {
  if (kb.x || kb.z || !tv) return kb;
  return { x: tv.x, z: tv.z };
}

// Where a touch aims. A dragged pad aims along the drag, as far as the spell range times the drag. Untouched (or held
// without a drag) it takes the nearest living enemy that is out of its spawn, and otherwise the way the wizard faces.
export function aimPoint(dir, player, enemies, range = TUNING.aimRange) {
  if (dir && dir.mag > 0) return { x: player.x + dir.x * range * dir.mag, z: player.z + dir.z * range * dir.mag };
  let best = null, bestD = (range * ASSIST_SCALE) ** 2;
  for (const e of enemies) {
    if (!(e.hp > 0) || e.state === 'spawn') continue;
    const d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best) return { x: best.x, z: best.z };
  const len = Math.hypot(player.fx ?? 0, player.fz ?? 0);
  const fx = len > 1e-6 ? player.fx / len : 0, fz = len > 1e-6 ? player.fz / len : -1;
  return { x: player.x + fx * FACING_DIST, z: player.z + fz * FACING_DIST };
}

// env: { search, coarse (a touch screen is the main pointer), points (touch points) }; ?touch=1 or ?touch=0 decides by itself
export function detectTouch({ search = '', coarse = false, points = 0 } = {}) {
  const q = new URLSearchParams(search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return !!coarse && points > 0;
}

export function isPhone({ touch, width = 0, height = 0, ua = '' }) {
  if (!touch) return false;
  return Math.min(width, height) <= 520 || (/Mobile|iPhone/i.test(ua) && !/iPad|Tablet/i.test(ua));
}

export function readTouchEnv(win = window) {
  const nav = win.navigator, scr = win.screen ?? {};
  const coarse = !!win.matchMedia?.('(pointer: coarse)').matches;
  const touch = detectTouch({ search: win.location.search, coarse, points: nav.maxTouchPoints ?? 0 });
  const phone = isPhone({ touch, width: scr.width ?? win.innerWidth, height: scr.height ?? win.innerHeight, ua: nav.userAgent ?? '' });
  return { touch, phone };
}

// ---------------------------------------------------------------- DOM
const STICK_RADIUS = 58; // px of drag for full speed
const PAD_RADIUS = 70;

export function createTouchControls({ canvas, input }) {
  const doc = canvas.ownerDocument, root = doc.body;
  doc.body.classList.add('touch');
  const mk = (cls, parent = root) => { const n = doc.createElement('div'); n.className = cls; parent.appendChild(n); return n; };
  const stickEl = mk('vstick'), base = mk('base', stickEl), knob = mk('knob', stickEl);
  const $ = (id) => doc.getElementById(id);
  const cleanups = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };

  // ---- move stick: any finger that lands on the left half of the arena
  let mv = null; // {id, ox, oy}
  // ---- tap-to-aim: a finger on the right half
  let tap = null;
  const moveTo = (e) => {
    const v = stickVector(e.clientX - mv.ox, e.clientY - mv.oy, STICK_RADIUS);
    input.setTouch({ move: v });
    const k = Math.min(STICK_RADIUS, Math.hypot(e.clientX - mv.ox, e.clientY - mv.oy));
    const a = Math.atan2(e.clientY - mv.oy, e.clientX - mv.ox);
    knob.style.transform = `translate(${Math.cos(a) * k}px, ${Math.sin(a) * k}px)`;
  };
  on(canvas, 'pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    canvas.focus();
    const r = canvas.getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.5) {
      if (mv) return;
      mv = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px';
      stickEl.classList.add('on'); knob.style.transform = 'translate(0, 0)';
    } else {
      if (tap) return;
      tap = { id: e.pointerId };
      input.aimAt(e.clientX, e.clientY);
      input.push('cast'); input.hold('tap', true);
    }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
  });
  on(canvas, 'pointermove', (e) => {
    if (mv && e.pointerId === mv.id) moveTo(e);
    else if (tap && e.pointerId === tap.id) input.aimAt(e.clientX, e.clientY);
  });
  const lift = (e) => {
    if (mv && e.pointerId === mv.id) { mv = null; stickEl.classList.remove('on'); input.setTouch({ move: null }); }
    else if (tap && e.pointerId === tap.id) { tap = null; input.hold('tap', false); }
  };
  on(canvas, 'pointerup', lift);
  on(canvas, 'pointercancel', lift);

  // ---- the Cast pad: the Cast tile, made big
  const pad = $('t-cast');
  let padId = null, padBox = null;
  if (pad) {
    const aimTo = (e) => {
      const c = padBox;
      input.setTouch({ dir: stickVector(e.clientX - c.x, e.clientY - c.y, PAD_RADIUS) });
    };
    on(pad, 'pointerdown', (e) => {
      if (e.pointerType !== 'touch' || padId !== null) return;
      e.preventDefault(); e.stopPropagation();
      padId = e.pointerId;
      const r = pad.getBoundingClientRect();
      padBox = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      pad.classList.add('held');
      try { pad.setPointerCapture(e.pointerId); } catch { /* gone already */ }
      aimTo(e);
      input.push('cast'); input.hold('pad', true);
    });
    on(pad, 'pointermove', (e) => { if (e.pointerId === padId) aimTo(e); });
    const release = (e) => {
      if (e.pointerId !== padId) return;
      padId = null; pad.classList.remove('held');
      input.hold('pad', false); input.setTouch({ dir: null });
    };
    on(pad, 'pointerup', release);
    on(pad, 'pointercancel', release);
  }

  // ---- buttons
  for (const [id, action] of [['t-nova', 'nova'], ['t-self', 'self'], ['t-dodge', 'dodge']]) {
    const b = $(id);
    if (b) on(b, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.push(action); });
  }
  const clear = $('t-clear');
  if (clear) on(clear, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.push('clear'); });

  // ---- no zoom or page scroll from a pinch, a double tap or a long press
  on(doc, 'gesturestart', (e) => e.preventDefault());
  on(canvas, 'contextmenu', (e) => e.preventDefault());

  // ---- full screen where the browser allows it (not iPhone Safari)
  const full = $('m-full');
  if (full) {
    const can = !!doc.fullscreenEnabled && !!doc.documentElement.requestFullscreen;
    full.hidden = !can;
    on(full, 'click', async () => {
      try {
        if (doc.fullscreenElement) await doc.exitFullscreen();
        else {
          await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
          await canvas.ownerDocument.defaultView.screen.orientation?.lock?.('landscape');
        }
      } catch { /* refused: the page still plays */ }
    });
  }

  return {
    dispose() {
      for (const f of cleanups.splice(0)) f();
      stickEl.remove();
      doc.body.classList.remove('touch');
    }
  };
}
