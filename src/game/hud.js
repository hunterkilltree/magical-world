// DOM HUD + menu/pause/death screens. Reads state; user intent goes back via callbacks.
import { ELEMENTS, ORDER, SHAPES, MAX_QUEUE, resolveSpell, grimoireFor, SHARED } from './spells.js';
import { ROLES, ROLE_ORDER, STYLES, ROLE_BOOK, SIGNATURE } from './roles.js';

// Element glyphs (16px grid, stroked).
const ICON = {
  fire: '<path d="M8 1.6c1 2.6 4 4 4 7.4a4 4 0 0 1-8 0c0-1.8 1-2.8 1.8-3.6.2 1.3.9 2 1.7 2.3C7 5.8 7.3 3.6 8 1.6z"/>',
  water: '<path d="M8 2s4.4 4.6 4.4 7.6a4.4 4.4 0 0 1-8.8 0C3.6 6.6 8 2 8 2z"/>',
  ice: '<path d="M8 1.5v13M2.4 4.8l11.2 6.4M2.4 11.2l11.2-6.4"/>',
  lightning: '<path d="M9.5 1.5 3.5 9h4l-1 5.5 6-7.5h-4z"/>',
  earth: '<path d="M1.8 12.8 6 5.2l2.6 4 1.9-3 3.7 6.6z"/>',
  arcane: '<path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z"/>',
  nature: '<path d="M3 13C3 7 7 3 13 3c0 6-4 10-10 10zM3 13l6-6"/>',
  wind: '<path d="M2 6h8.5a2 2 0 1 0-2-2M2 10h11a2 2 0 1 1-2 2"/>',
  light: '<circle cx="8" cy="8" r="2.6"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/>',
  dark: '<path d="M10.5 2.2A6 6 0 1 0 13.8 10a4.8 4.8 0 0 1-3.3-7.8z"/>'
};
const icon = (el) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICON[el] ?? ''}</svg>`;
const chips = (els) => els.map((e) => `<i style="--c:${hex(ELEMENTS[e].color)}" title="${ELEMENTS[e].name}">${icon(e)}</i>`).join('');

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Aim'], ['1 – 0', 'Queue an element (up to 3)'], ['Left click', 'Cast at cursor · hold to recast'],
  ['Right click / E', 'Cast as an area around you'], ['F', 'Cast on yourself'], ['Space', 'Dodge roll (brief invulnerability)'],
  ['X', 'Clear queue'], ['Esc', 'Pause'], ['M', 'Sound on / off'], ['R', 'Restart (paused or fallen)']
];
const STATUS = [
  ['burn', 'Burning', '#ff6a2b'], ['wet', 'Wet', '#3d9bff'], ['chill', 'Chilled', '#a8ecff'], ['frozen', 'Frozen', '#ffffff'],
  ['shock', 'Shocked', '#f4e15c'], ['slow', 'Mired', '#b3793f'], ['stoneskin', 'Stoneskin', '#b3793f'], ['ward', 'Ward', '#d04bff'], ['haste', 'Haste', '#f4e15c'],
  ['root', 'Rooted', '#5cc84a'], ['stun', 'Stunned', '#ffffff'], ['regen', 'Regen', '#7ee08a'], ['armor', 'Bark armour', '#c89a5a'],
  ['reflect', 'Reflect', '#e0d0ff'], ['invuln', 'Invulnerable', '#f0e070'], ['revive', 'Revive ready', '#f0c84a'], ['curse', 'Cursed', '#c080ff'], ['blind', 'Blinded', '#fff1a8']
];

export function createHud(o) {
  const els = {
    hp: $('h-hp'), hpv: $('h-hpv'), en: $('h-en'), env: $('h-env'), enbar: $('h-enbar'), wave: $('h-wave'), left: $('h-left'), kills: $('h-kills'),
    score: $('h-score'), shape: $('h-shape'), spell: $('h-spell'), cost: $('h-cost'), status: $('h-status'), banner: $('banner'), toast: $('toast'),
    vig: $('vignette'), name: $('h-name'), role: $('h-role'), cls: $('h-cls'), sw: $('h-sw'), queue: $('h-queue')
  };
  const slots = [...document.querySelectorAll('.slot')];
  const tiles = { cast: $('t-cast'), nova: $('t-nova'), self: $('t-self'), dodge: $('t-dodge') };
  const cdText = {};
  for (const k in tiles) { const em = document.createElement('em'); tiles[k].appendChild(em); cdText[k] = em; }
  const screens = { menu: $('menu'), pause: $('pause'), dead: $('dead') };
  let vig = 0, lastToast = '', toastT = 0, prevMode = null, statusKey = '', wizardId = o.wizardId;

  const row = $('h-elements');
  ORDER.forEach((el) => {
    const E = ELEMENTS[el], b = document.createElement('button');
    b.className = 'elkey';
    b.style.setProperty('--c', hex(E.color));
    b.innerHTML = `<span class="kbd">${icon(el)}${E.key}</span><span class="nm">${E.name}</span>`;
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
        fillRoles();
      });
      node.appendChild(b);
    });
  }
  fillRoster($('m-roster'));

  // Arena: where the fight happens. Same rules and props, different place.
  const ARENAS = [
    { id: 'court', name: 'Court of Waves', vi: 'Sân Thành Grauhold', kick: 'Grauhold Keep · Inner court', c: '#7c3aff' },
    { id: 'forest', name: 'Hollow Glade', vi: 'Rừng Cây', kick: 'Mossbarrow Wood · Old glade', c: '#4f9a2c' }
  ];
  function fillArenas() {
    const node = $('m-arenas'); if (!node) return;
    const cur = o.themeOf?.() ?? 'court', A = ARENAS.find((a) => a.id === cur) ?? ARENAS[0];
    node.innerHTML = '';
    ARENAS.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'role arena' + (a.id === cur ? ' is-on' : '');
      b.style.setProperty('--c', a.c);
      b.innerHTML = `<i></i><b>${a.name}</b><small>${a.vi}</small>`;
      b.addEventListener('click', () => { o.onArena(a.id); fillArenas(); });
      node.appendChild(b);
    });
    const t = document.querySelector('#menu h1'), k = document.querySelector('#menu .kicker');
    if (t) t.textContent = A.name; if (k) k.textContent = A.kick;
  }
  fillArenas();

  // Casting role: the same pair becomes a different spell, thrown with a different body.
  function fillRoles() {
    const node = $('m-roles'), cur = o.roleOf();
    node.innerHTML = '';
    ROLE_ORDER.forEach((id) => {
      const R = ROLES[id], b = document.createElement('button');
      b.className = 'role' + (id === cur ? ' is-on' : '');
      b.style.setProperty('--c', hex(R.color));
      b.innerHTML = `<i></i><b>${R.name}</b><small>${R.vi}</small>`;
      b.addEventListener('click', () => { o.onRole(id); fillRoles(); setWho(); });
      node.appendChild(b);
    });
    const R = ROLES[cur], S = STYLES[R.style], sig = resolveSpell(SIGNATURE[cur], cur), card = $('m-rolecard');
    card.style.setProperty('--c', hex(R.color));
    card.innerHTML = `<div class="rc-head"><span class="rc-dot"></span><b>${R.name} · ${R.vi}</b><span class="rc-style">${S.en} · ${S.vi}</span></div>
      <p>${R.spec}. <span lang="vi">${R.specVi}.</span></p>
      <div class="rc-sig"><span class="k">Signature · Tuyệt kỹ</span><div class="rc-row"><span class="gels">${chips(sig.els)}</span><b>${sig.name}</b></div>
      <small>${sig.def.desc}. Your wizard casts it on the left.</small></div>`;
  }
  fillRoles();

  function setWho() {
    const w = o.wizards.find((x) => x.id === wizardId), R = ROLES[o.roleOf()];
    els.name.textContent = w.name;
    els.role.textContent = w.role;
    els.sw.style.background = hex(w.glow);
    els.cls.textContent = `${R.name} · ${R.vi} · ${STYLES[R.style].en}`;
    els.cls.style.color = hex(R.color);
  }
  setWho();

  // Grimoire grouped by character: your role first and open, the other four folded, shared spells last.
  function fillGrimoire(found, role) {
    const row = (g) => `<div class="gr${found.has(g.sid ?? g.key) ? ' is-found' : ''}"><span class="gels">${chips(g.els)}</span>
      <span class="gname">${g.name}<small>${SHAPES[g.shape].label}</small></span><span class="gdesc">${g.desc}</span></div>`;
    const order = [role, ...ROLE_ORDER.filter((r) => r !== role)];
    const group = (title, c, list, open) => `<details class="grp"${open ? ' open' : ''}><summary><span class="dot" style="--c:${c}"></span>${title}
      <small>${list.filter((g) => found.has(g.sid ?? g.key)).length} / ${list.length}</small></summary>${list.map(row).join('')}</details>`;
    $('p-grim').innerHTML = order.map((r) => group(`${ROLES[r].name} · ${ROLES[r].vi}`, hex(ROLES[r].color),
      Object.entries(ROLE_BOOK[r]).map(([key, d]) => ({ key, els: key.split('+'), ...d })), r === role)).join('')
      + group('Shared · Dùng chung', '#f4f1ff', SHARED, false);
    const book = grimoireFor(role);
    $('p-found').textContent = `${book.filter((g) => found.has(g.sid ?? g.key)).length} / ${book.length} cast`;
  }


  $('m-start').addEventListener('click', () => o.onStart());

  // ---------------------------------------------------------------- co-op lobby (R-082)
  const net = { name: $('m-name'), code: $('m-code'), join: $('m-coop-join'), lobby: $('m-lobby'), room: $('m-room'), party: $('m-party'),
    status: $('m-net-status'), ready: $('m-ready'), go: $('m-go'), hint: $('m-lobby-hint') };
  try { net.name.value = localStorage.getItem('cow.name') ?? ''; } catch {}
  const nameOf = () => { const v = net.name.value.trim(); try { localStorage.setItem('cow.name', v); } catch {} return v || 'Wizard'; };
  let amReady = false;
  $('m-create').addEventListener('click', () => o.onCreate?.(nameOf()));
  $('m-join').addEventListener('click', () => {
    const code = net.code.value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { setNetStatus('A room code is four letters', true); net.code.focus(); return; }
    o.onJoin?.(code, nameOf());
  });
  net.code.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') $('m-join').click(); });
  net.name.addEventListener('keydown', (ev) => ev.stopPropagation());
  $('m-leave').addEventListener('click', () => o.onLeave?.());
  net.ready.addEventListener('click', () => o.onReady?.(!amReady));
  net.go.addEventListener('click', () => o.onGo?.());

  function setNetStatus(text, err = false) {
    net.status.textContent = text ?? '';
    net.status.classList.toggle('err', !!err);
  }

  // msg: the server's lobby message, or null when not in a room.
  function setLobby(msg, me) {
    net.lobby.hidden = !msg;
    net.join.hidden = !!msg;
    $('m-start').hidden = !!msg;
    if (!msg) { amReady = false; return; }
    net.room.textContent = msg.room;
    const mine = msg.players.find((p) => p.id === me);
    amReady = !!mine?.ready;
    net.party.innerHTML = msg.players.map((p) => {
      const w = o.wizards.find((x) => x.id === p.wizard) ?? o.wizards[0], R = ROLES[p.role];
      const tag = p.ready ? '<span class="tag ready">Ready</span>' : '<span class="tag">Choosing</span>';
      return `<div class="party-row${p.id === me ? ' me' : ''}"><span class="sw" style="background:${hex(w.glow)}"></span>`
        + `<span><b>${escapeHtml(p.name)}</b>${p.host ? ' <small>· host</small>' : ''}<br><small>${w.name} · ${R ? R.name : ''}</small></span>${tag}</div>`;
    }).join('');
    net.ready.textContent = amReady ? 'Not ready' : 'Ready';
    net.ready.classList.toggle('btn-primary', !amReady);
    net.ready.classList.toggle('btn-ghost', amReady);
    const host = !!mine?.host, all = msg.players.every((p) => p.ready);
    net.go.hidden = !host;
    net.go.disabled = !all;
    net.hint.textContent = msg.phase === 'play' ? 'The run is under way.' : host ? (all ? 'Everyone is ready. Start when you like.' : 'Share the code. Start once everyone is ready.')
      : 'Share the code. Pick your wizard and role above, then ready up.';
    $('d-restart').textContent = host ? 'Start again · R' : 'Waiting for the host';
    $('d-restart').disabled = !host;
    $('d-menu').textContent = 'Leave the room';
  }

  function setOffline() {
    setLobby(null);
    $('d-restart').textContent = 'Try again · R';
    $('d-restart').disabled = false;
    $('d-menu').textContent = 'Change wizard';
  }
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
      if (g.mode === 'paused') fillGrimoire(g.stats.found, g.player.role);
      if (dead) {
        screens.dead.dataset.filled = '1';
        $('d-kick').textContent = `Fallen on wave ${g.wave}`;
        $('d-stats').innerHTML = [['Wave reached', g.wave], ['Kills', g.kills], ['Score', g.score], ['Damage dealt', Math.round(g.stats.dealt)],
          ['Self-inflicted', Math.round(g.stats.selfDmg)], ['Spells found', `${g.stats.found.size} / ${grimoireFor(g.player.role).length}`]]
          .map(([k, v]) => `<div><span class="k">${k}</span><b>${v}</b></div>`).join('');
      }
      if (g.mode !== 'dead') delete screens.dead.dataset.filled;
      prevMode = g.mode;
    }
  }

  return {
    reset() { vig = 0; prevMode = null; setWho(); },
    setLobby, setNetStatus, setOffline, toast: (t) => toast(t),
    // keeps the roster and role pick in step with what the room says about you
    syncPick(wizard) { if (wizard && wizard !== wizardId) { wizardId = wizard; document.querySelectorAll('.pick').forEach((x) => x.classList.toggle('is-on', x.dataset.w === wizard)); setWho(); fillRoles(); } },
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
        else if (e.type === 'fizzle') toast('Queue an element first (1–0)');
        else if (e.type === 'tag' && e.tag === 'interrupt' && e.id === p.id) toast('Cast interrupted · Phép bị ngắt');
        else if (e.type === 'cooldown') toast(e.spell ? `${e.name} recharging · ${e.t.toFixed(1)}s` : `${SHAPES[e.shape].label} spells recharging · ${e.t.toFixed(1)}s`);
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
      const queued = p.queue.length > 0, sp = resolveSpell(queued ? p.queue : p.last, p.role);
      set(els.shape, sp ? (queued ? (sp.role ? ROLES[sp.role].name + ' · ' : '') + SHAPES[sp.def.shape].label : 'Recast · hold click') : 'Queue elements · 1–0');
      set(els.spell, sp ? sp.name : '—');
      set(els.cost, sp ? (queued && sp.role ? `${sp.cost} energy · ${sp.def.desc}` : `${sp.cost} energy`) : '');
      els.spell.style.color = sp ? hex(sp.color) : '';
      els.queue.classList.toggle('dim', !queued);
      const combo = queued && sp && new Set(p.queue).size >= 2;
      spellPanel.classList.toggle('combo', !!combo);
      if (combo) spellPanel.style.setProperty('--sc', hex(sp.color));

      for (const k in tiles) {
        let f = p.cd[k] > 0 ? p.cd[k] / (p.cdMax[k] || 1) : 0, secs = p.cd[k];
        if (k === 'cast' && sp) secs = Math.max(secs, p.shapeCd[sp.def.shape] || 0, p.spellCd[sp.sid] || 0);
        const txt = secs > 0.5 ? (secs < 10 ? secs.toFixed(1) : Math.ceil(secs)) : '';
        if (cdText[k].textContent !== String(txt)) cdText[k].textContent = txt;
        if (k === 'cast' && sp) { const sh = sp.def.shape, c = p.shapeCd[sh] || 0; if (c > 0) f = Math.max(f, c / (p.shapeMax[sh] || 1)); const sc = p.spellCd[sp.sid] || 0; if (sc > 0) f = Math.max(f, sc / (p.spellMax[sp.sid] || 1)); }
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
