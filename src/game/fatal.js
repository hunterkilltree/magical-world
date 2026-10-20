// A plain card that replaces the game when it cannot run (R-110). Built with DOM calls, not React, so it still shows
// when the renderer or React is what failed.
export function showFatal({ title, text, detail = '', reload = true }) {
  const doc = document;
  let box = doc.getElementById('fatal');
  if (!box) { box = doc.createElement('div'); box.id = 'fatal'; box.setAttribute('role', 'alert'); doc.body.appendChild(box); }
  box.replaceChildren();
  const card = doc.createElement('div');
  card.className = 'card';
  const add = (tag, cls, content) => { const n = doc.createElement(tag); if (cls) n.className = cls; n.textContent = content; card.appendChild(n); return n; };
  add('div', 'kicker', 'Court of Waves');
  add('h1', '', title);
  add('p', 'lede', text);
  if (detail) add('p', 'detail', String(detail).slice(0, 300));
  if (reload) {
    const b = add('button', 'btn btn-primary', 'Reload');
    b.addEventListener('click', () => window.location.reload());
  }
  box.appendChild(card);
  box.classList.add('on');
}

export const FATAL = {
  nowebgl: {
    title: "This browser can't draw the game",
    text: 'Court of Waves needs WebGL 2. Turn on hardware acceleration in the browser settings, update the graphics driver, or open the page in another browser (a recent Chrome, Edge, Firefox or Safari).',
    reload: true
  },
  stopped: {
    title: 'The game stopped',
    text: 'Something went wrong while drawing the court. Reload to start again; your wizard and graphics choices are kept.',
    reload: true
  }
};
