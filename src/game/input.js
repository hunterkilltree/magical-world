// Keyboard + mouse (+ touch, R-111) → movement vector, aim (screen NDC, or a pad direction) and a queue of discrete actions.
import { mergeMove } from './touch.js';
const EL_KEYS = {
  Digit1: 'fire', Digit2: 'water', Digit3: 'ice', Digit4: 'lightning', Digit5: 'earth',
  Digit6: 'arcane', Digit7: 'nature', Digit8: 'wind', Digit9: 'light', Digit0: 'dark',
  Numpad1: 'fire', Numpad2: 'water', Numpad3: 'ice', Numpad4: 'lightning', Numpad5: 'earth',
  Numpad6: 'arcane', Numpad7: 'nature', Numpad8: 'wind', Numpad9: 'light', Numpad0: 'dark'
};
const BLOCK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab'];

export function createInput(canvas) {
  const keys = new Set();
  const ndc = { x: 0, y: -0.3 };
  let actions = [], mouseHeld = false;
  const holds = new Set(); // touch fingers keeping the cast going ('pad', 'tap')
  const touch = { move: null, dir: null }; // set by touch.js: the move stick, and the Cast pad's drag

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (BLOCK.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    const c = e.code;
    if (EL_KEYS[c]) actions.push('el:' + EL_KEYS[c]);
    else if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight') actions.push('dodge');
    else if (c === 'KeyF') actions.push('self');
    else if (c === 'KeyE') actions.push('nova');
    else if (c === 'Backspace' || c === 'KeyX') actions.push('clear');
    else if (c === 'Escape' || c === 'KeyP') actions.push('pause');
    else if (c === 'KeyR') actions.push('restart');
    else if (c === 'KeyM') actions.push('mute');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouseHeld = false; holds.clear(); touch.move = touch.dir = null; });

  const track = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  // A finger never moves the mouse aim; touch.js turns fingers into the stick, the pad and tap-to-aim.
  window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') track(e); });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    track(e);
    canvas.focus();
    if (e.button === 0) { actions.push('cast'); mouseHeld = true; }
    else if (e.button === 2) actions.push('nova');
  });
  window.addEventListener('pointerup', (e) => { if (e.button === 0 && e.pointerType !== 'touch') mouseHeld = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const k = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
  return {
    read() {
      const move = mergeMove({ x: k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'), z: k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp') }, touch.move);
      const out = actions;
      actions = [];
      if (mouseHeld || holds.size) out.push('recast');
      return { move, ndc: { ...ndc }, actions: out, aimDir: touch.dir };
    },
    setTouch(o) { if ('move' in o) touch.move = o.move; if ('dir' in o) touch.dir = o.dir; },
    hold(id, on) { if (on) holds.add(id); else holds.delete(id); },
    aimAt(clientX, clientY) { track({ clientX, clientY }); },
    requeue(a) { actions.unshift(...a.filter((x) => x !== 'recast')); },
    push(a) { actions.push(a); },
    focus() { canvas.focus(); }
  };
}
