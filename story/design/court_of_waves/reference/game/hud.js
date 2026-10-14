// DOM HUD + menu/pause/death screens. Reads state; user intent goes back via callbacks.
import { ELEMENTS, ORDER, GRIMOIRE, SHAPES, MAX_QUEUE, resolveSpell } from './spells.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Aim'], ['1 – 6', 'Queue an element (up to 3)'], ['Left click', 'Cast at cursor · hold to recast'],
  ['Right click / E', 'Cast as an area around you'], ['F', 'Cast on yourself'], ['Space', 'Dodge roll (brief invulnerability)'],
  ['X', 'Clear queue'], ['Esc', 'Pause'], ['M', 'Sound on / off'], ['R', 'Restart (paused or fallen)']
];
const STATUS = [
  ['burn', 'Burning', '#ff6a2b'], ['wet', 'Wet', '#3d9bff'], ['chill', 'Chilled', '#a8ecff'], ['frozen', 'Frozen', '#ffffff'],
  ['shock', 'Shocked', '#f4e15c'], ['slow', 'Mired', '#b3793f'], ['stoneskin', 'Stoneskin', '#b3793f'], ['ward', 'Ward', '#d04bff'], ['haste', 'Haste', '#f4e15c']
];

export function createHud(o) {
  const els = {
    hp: $('h-hp'), hpv: $('h-hpv'), en: $('h-en'), env: $('h-env'), enbar: $('h-enbar'), wave: $('h-wave'), left: $('h-left'), kills: $('h-kills'),
    score: $('h-score'), shape: $('h-shape'), spell: $('h-spell'), cost: $('h-cost'), status: $('h-status'), banner: $('banner'), toast: $('toast'),
    vig: $('vignette'), name: $('h-name'), role: $('h-role'), sw: $('h-sw'), queue: $('h-queue')
  };
  const slots = [...document.querySelectorAll('.slot')];
  const tiles = { cast: $('t-cast'), nova: $('t-nova'), self: $('t-self'), dodge: $('t-dodge') };
  const screens = { menu: $('menu'), pause: $('pause'), dead: $('dead') };
  let vig = 0, lastToast = '', toastT = 0, prevMode = null, statusKey = '', wizardId = o.wizardId;

  const row = $('h-elements');
  ORDER.forEach((el) => {
    const E = ELEMENTS[el], b = document.createElement('button');
    b.className = 'elkey';
    b.style.setProperty('--c', hex(E.color));
    b.innerHTML = `<span class="kbd">${E.key}</span><span class="nm">${E.name}</span>`;
    b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); o.onElement(el); });
    row.appendChild(b);
  });

  document.querySelectorAll('.controls').forEach((n) => {
    n.innerHTML = CONTROLS.map(([k, v]) => `<div class="ctl"><kbd>${k}</kbd><span>${v}</span></div>`).join('');
  });

  function fillRoster(node) {
    node.innerHTML = '';
    o.wizards.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'pick' + (w.id === wizardId ? ' is-on' : '');
      b.dataset.w = w.id;
      b.innerHTML = `<span class="sw" style="background:${hex(w.glow)}"></span><span><b>${w.name}</b><small>${w.role}</small></span>`;
      b.addEventListener('click', () => {
        wizardId = w.id;
        document.querySelectorAll('.pick').forEach((x) => x.classList.toggle('is-on', x.dataset.w === w.id));
        setWho();
        o.onPick(w.id);
      });
      node.appendChild(b);
    });
  }
  fillRoster($('m-roster'));

  function setWho() {
    const w = o.wizards.find((x) => x.id === wizardId);
    els.name.textContent = w.name;
    els.role.textContent = w.role;
    els.sw.style.background = hex(w.glow);
  }
  setWho();

  function fillGrimoire(found) {
    const n = $('p-grim');
    n.innerHTML = GRIMOIRE.map((g) => `<div class="gr${found.has(g.key) ? ' is-found' : ''}">
      <span class="gels">${g.els.map((e) => `<i style="--c:${hex(ELEMENTS[e].color)}">${ELEMENTS[e].key}</i>`).join('')}</span>
      <span class="gname">${g.name}<small>${SHAPES[g.shape].label}</small></span><span class="gdesc">${g.desc}</span></div>`).join('');
    $('p-found').textContent = `${GRIMOIRE.filter((g) => found.has(g.key)).length} / ${GRIMOIRE.length} cast`;
  }

  $('m-start').addEventListener('click', () => o.onStart());
  $('p-resume').addEventListener('click', () => o.onResume());
  $('p-restart').addEventListener('click', () => o.onRestart());
  $('p-menu').addEventListener('click', () => o.onMenu());
  $('d-restart').addEventListener('click', () => o.onRestart());
  $('d-menu').addEventListener('click', () => o.onMenu());
  $('h-pause').addEventListener('click', () => o.onPause());
  $('h-mute').addEventListener('click', () => o.onMute());
  const spellPanel = document.querySelector('.spell');

  const replay = (n, text) => { n.textContent = text; n.classList.remove('show'); void n.offsetWidth; n.classList.add('show'); };
  const toast = (text) => { if (text === lastToast && toastT > 0) return; lastToast = text; toastT = 1.6; replay(els.toast, text); };
  const set = (n, v) => { if (n.textContent !== String(v)) n.textContent = v; };

  function showScreens(g) {
    const dead = g.mode === 'dead' && g.player.deadT > 1.0;
    screens.menu.classList.toggle('on', g.mode === 'menu');
    screens.pause.classList.toggle('on', g.mode === 'paused');
    screens.dead.classList.toggle('on', dead);
    document.body.classList.toggle('in-menu', g.mode === 'menu');
    if (g.mode !== prevMode || (dead && !screens.dead.dataset.filled)) {
      if (g.mode === 'paused') fillGrimoire(g.stats.found);
      if (dead) {
        screens.dead.dataset.filled = '1';
        $('d-kick').textContent = `Fallen on wave ${g.wave}`;
        $('d-stats').innerHTML = [['Wave reached', g.wave], ['Kills', g.kills], ['Score', g.score], ['Damage dealt', Math.round(g.stats.dealt)],
          ['Self-inflicted', Math.round(g.stats.selfDmg)], ['Spells found', `${g.stats.found.size} / ${GRIMOIRE.length}`]]
          .map(([k, v]) => `<div><span class="k">${k}</span><b>${v}</b></div>`).join('');
      }
      if (g.mode !== 'dead') delete screens.dead.dataset.filled;
      prevMode = g.mode;
    }
  }

  return {
    reset() { vig = 0; prevMode = null; },
    setMuted(m) { $('h-mute').innerHTML = (m ? 'Sound off' : 'Sound on') + ' <span>M</span>'; },
    update(g, events, dt) {
      const p = g.player;
      showScreens(g);
      for (const e of events) {
        if (e.type === 'wave') replay(els.banner, `Wave ${e.n}`);
        else if (e.type === 'waveClear') replay(els.banner, `Wave ${e.n} cleared · +${e.heal} health`);
        else if (e.type === 'hurt') { vig = Math.min(1, vig + (e.dot ? 0.08 : 0.55)); if (e.self && e.reason && !e.dot) toast('Self-inflicted · ' + e.reason); }
        else if (e.type === 'noEnergy') { toast('Not enough energy'); els.enbar.classList.remove('flash'); void els.enbar.offsetWidth; els.enbar.classList.add('flash'); }
        else if (e.type === 'queueFull') toast(`Queue holds ${MAX_QUEUE} elements — cast or clear (X)`);
        else if (e.type === 'cancel') toast(`${ELEMENTS[e.a].name} and ${ELEMENTS[e.b].name} cancel out`);
        else if (e.type === 'fizzle') toast('Queue an element first (1–6)');
        else if (e.type === 'cooldown') toast(`${SHAPES[e.shape].label} spells recharging · ${e.t.toFixed(1)}s`);
      }
      toastT -= dt;
      vig *= Math.exp(-4 * dt);
      els.vig.style.opacity = (vig + (p.alive && p.hp / p.maxHp < 0.3 ? 0.25 + Math.sin(performance.now() / 300) * 0.1 : 0)).toFixed(3);

      els.hp.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
      set(els.hpv, Math.ceil(p.hp));
      els.en.style.transform = `scaleX(${p.energy / p.maxEnergy})`;
      set(els.env, Math.floor(p.energy));
      set(els.wave, g.wave || '–');
      set(els.left, g.wave ? g.remaining : '–');
      set(els.kills, g.kills);
      set(els.score, g.score);

      slots.forEach((sl, i) => {
        const el = p.queue[i];
        const key = el || '';
        if (sl.dataset.el === key) return;
        sl.dataset.el = key;
        sl.classList.toggle('on', !!el);
        sl.style.setProperty('--c', el ? hex(ELEMENTS[el].color) : 'transparent');
        sl.textContent = el ? ELEMENTS[el].name : '';
      });
      const queued = p.queue.length > 0, sp = resolveSpell(queued ? p.queue : p.last);
      set(els.shape, sp ? (queued ? SHAPES[sp.def.shape].label : 'Recast · hold click') : 'Queue elements · 1–6');
      set(els.spell, sp ? sp.name : '—');
      set(els.cost, sp ? `${sp.cost} energy` : '');
      els.spell.style.color = sp ? hex(sp.color) : '';
      els.queue.classList.toggle('dim', !queued);
      const combo = queued && sp && new Set(p.queue).size >= 2;
      spellPanel.classList.toggle('combo', !!combo);
      if (combo) spellPanel.style.setProperty('--sc', hex(sp.color));

      for (const k in tiles) {
        let f = p.cd[k] > 0 ? p.cd[k] / (p.cdMax[k] || 1) : 0;
        if (k === 'cast' && sp) { const sh = sp.def.shape, c = p.shapeCd[sh] || 0; if (c > 0) f = Math.max(f, c / (p.shapeMax[sh] || 1)); }
        tiles[k].style.setProperty('--cd', f.toFixed(3));
      }

      const active = STATUS.filter(([k]) => p.st[k] > 0);
      const sk = active.map(([k]) => k + (k === 'chill' ? Math.floor(p.st.chill) : k === 'ward' ? Math.ceil(p.st.ward) : '')).join(',');
      if (sk !== statusKey) {
        statusKey = sk;
        els.status.innerHTML = active.map(([k, n, c]) => `<span class="st" style="--c:${c}">${n}${k === 'chill' ? ' ×' + Math.floor(p.st.chill) : k === 'ward' ? ' ' + Math.ceil(p.st.ward) : ''}</span>`).join('');
      }
    }
  };
}
