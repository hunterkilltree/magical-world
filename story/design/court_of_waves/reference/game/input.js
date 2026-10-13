// Keyboard + mouse → movement vector, aim (screen NDC) and a queue of discrete actions.
const EL_KEYS = {
  Digit1: 'fire', Digit2: 'water', Digit3: 'ice', Digit4: 'lightning', Digit5: 'earth', Digit6: 'arcane',
  Numpad1: 'fire', Numpad2: 'water', Numpad3: 'ice', Numpad4: 'lightning', Numpad5: 'earth', Numpad6: 'arcane'
};
const BLOCK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab'];

export function createInput(canvas) {
  const keys = new Set();
  const ndc = { x: 0, y: -0.3 };
  let actions = [], held = false;

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
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); held = false; });

  const track = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  window.addEventListener('pointermove', track);
  canvas.addEventListener('pointerdown', (e) => {
    track(e);
    canvas.focus();
    if (e.button === 0) { actions.push('cast'); held = true; }
    else if (e.button === 2) actions.push('nova');
  });
  window.addEventListener('pointerup', (e) => { if (e.button === 0) held = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const k = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
  return {
    read() {
      const move = { x: k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'), z: k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp') };
      const out = actions;
      actions = [];
      if (held) out.push('recast');
      return { move, ndc: { ...ndc }, actions: out };
    },
    requeue(a) { actions.unshift(...a.filter((x) => x !== 'recast')); },
    push(a) { actions.push(a); },
    focus() { canvas.focus(); }
  };
}
