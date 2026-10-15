// Synthesized SFX (Web Audio, no asset files). Reacts to sim events; M toggles.
const NOTE = { dark: 196, earth: 261.6, nature: 349.2, fire: 392, wind: 440, arcane: 523.3, water: 587.3, ice: 659.3, light: 784, lightning: 880 };

export function createAudio() {
  let ac = null, out = null, noise = null;
  let muted = localStorage.getItem('cow_muted') === '1';
  const last = {};

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    out = ac.createGain();
    out.gain.value = muted ? 0 : 0.6;
    out.connect(comp); comp.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  function tone(type, f0, f1, dur, vol, dt = 0) {
    const t = ac.currentTime + dt, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.004, vol, dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(type, f0, f1, q, dur, vol, dt = 0, att = 0.004) {
    const t = ac.currentTime + dt, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + att + dur);
    env(g, t, att, vol, dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + att + dur + 0.05);
  }
  const gate = (k, gap) => { const t = ac.currentTime; if ((last[k] ?? -1) + gap > t) return false; last[k] = t; return true; };
  const bell = (f, vol = 0.1, dur = 0.6, dt = 0) => { tone('sine', f, f, dur, vol, dt); tone('sine', f * 2.01, f * 2.01, dur * 0.5, vol * 0.35, dt); tone('triangle', f * 3, f * 3, 0.08, vol * 0.2, dt); };
  const zap = (vol = 0.22) => { for (let k = 0; k < 4; k++) hiss('highpass', 2500 + Math.random() * 3000, 5000, 1.5, 0.035, vol, k * 0.028); tone('square', 95, 55, 0.16, vol * 0.25); };
  const boom = (big) => { tone('sine', big ? 120 : 170, 32, big ? 0.9 : 0.45, big ? 0.75 : 0.4); hiss('lowpass', big ? 3200 : 2200, 110, 0.7, big ? 1.0 : 0.45, big ? 0.6 : 0.32); };
  const blip = () => { if (gate('blip', 0.2)) tone('square', 180, 140, 0.1, 0.04); };
  const EL = {
    fire: () => hiss('lowpass', 400, 2600, 0.8, 0.35, 0.22, 0, 0.02),
    water: () => hiss('bandpass', 1600, 450, 1.2, 0.35, 0.18, 0, 0.01),
    ice: () => { tone('sine', 1800, 2500, 0.2, 0.05); hiss('highpass', 5000, 7500, 0.7, 0.2, 0.08); },
    lightning: () => zap(0.2),
    earth: () => { tone('sine', 120, 50, 0.28, 0.32); hiss('lowpass', 600, 150, 0.7, 0.22, 0.2); },
    arcane: () => { tone('sine', 660, 990, 0.25, 0.07); tone('triangle', 330, 495, 0.3, 0.05); },
    nature: () => { hiss('bandpass', 2400, 1200, 2, 0.25, 0.08, 0, 0.02); tone('triangle', 349, 392, 0.3, 0.05); },
    wind: () => hiss('bandpass', 600, 2400, 1.2, 0.45, 0.16, 0, 0.08),
    light: () => [1568, 2093, 2637].forEach((f, i) => tone('sine', f, f, 0.5, 0.035, i * 0.03)),
    dark: () => { tone('sawtooth', 98, 82, 0.6, 0.06); tone('sine', 49, 45, 0.7, 0.2); }
  };
  const H = {
    queue(e, s) {
      bell(NOTE[e.el], 0.09, 0.5);
      const q = s.player.queue;
      if (new Set(q).size >= 2 && q[q.length - 1] === e.el) hiss('highpass', 6000, 9000, 0.6, 0.3, 0.05, 0, 0.03);
    },
    cast(e) {
      if (!gate('cast', 0.05)) return;
      const els = [...new Set(e.els)];
      for (const el of els) EL[el]?.();
      if (e.shape === 'wall') { tone('sine', 75, 38, 0.6, 0.45); hiss('lowpass', 320, 80, 0.7, 0.6, 0.3); }
      if (e.shape === 'area') tone('sine', 220, 440, 0.5, 0.08);
      if (e.fromQueue && els.length >= 2) {
        els.forEach((el, i) => bell(NOTE[el] / 2, 0.07, 0.9, i * 0.035));
        tone('sine', 65, 62, 0.7, 0.18);
        if (e.isNew) {
          [523.3, 659.3, 784, 1046.5].forEach((f, i) => bell(f, 0.07, 0.7, 0.12 + i * 0.075));
          hiss('highpass', 7000, 10000, 0.5, 0.8, 0.05, 0.1, 0.1);
        }
      }
    },
    nova() { hiss('bandpass', 300, 2200, 0.8, 0.35, 0.3); tone('sine', 130, 55, 0.3, 0.3); },
    selfcast() { tone('sine', 440, 880, 0.3, 0.08); },
    explode(e) { if (gate('boom', 0.06)) boom(e.big); },
    impact(e) {
      if (e.enemy) { if (gate('orb', 0.05)) hiss('bandpass', 900, 300, 2, 0.15, 0.12); return; }
      if (!gate('imp', 0.04)) return;
      if (e.kind === 'boulder') { tone('sine', 150, 50, 0.25, 0.32); hiss('lowpass', 900, 200, 0.7, 0.2, 0.25); }
      else hiss('bandpass', 1800, 600, 1.5, 0.1, 0.12);
    },
    chain() { if (gate('zap', 0.06)) zap(0.22); },
    charge() { if (gate('charge', 0.2)) zap(0.15); },
    hit(e) { if (!e.dot && gate('hit', 0.035)) tone('triangle', 520 + Math.random() * 90, 300, 0.06, 0.05); },
    hurt(e) { if (e.dot || !gate('hurt', 0.08)) return; tone('sine', 210, 80, 0.2, 0.35); hiss('lowpass', 1200, 200, 0.7, 0.15, 0.2); },
    tag(e) {
      if (e.tag === 'shatter' && gate('shatter', 0.05)) { hiss('highpass', 3000, 9000, 0.7, 0.35, 0.35); [2100, 2800, 3500].forEach((f, i) => tone('sine', f, f * 0.98, 0.18, 0.06, i * 0.02)); }
      else if (e.tag === 'freeze' && gate('freeze', 0.08)) { tone('sine', 1200, 1900, 0.35, 0.08); hiss('highpass', 6000, 4000, 0.7, 0.3, 0.1); }
      else if (e.tag === 'steam' && gate('steam', 0.15)) hiss('highpass', 2500, 5000, 0.5, 0.6, 0.12, 0, 0.06);
      else if (e.tag === 'conduct' && gate('zap', 0.06)) zap(0.28);
      else if (e.tag === 'blocked' && gate('block', 0.06)) { tone('square', 1300, 900, 0.06, 0.05); tone('sine', 2400, 2400, 0.14, 0.04); }
      else if (e.tag === 'evade' && gate('evade', 0.1)) hiss('bandpass', 2000, 800, 1, 0.12, 0.08);
    },
    slam() { tone('sine', 95, 30, 0.6, 0.6); hiss('lowpass', 800, 80, 0.7, 0.6, 0.5); },
    claw() { if (gate('claw', 0.05)) hiss('bandpass', 2600, 1200, 1.2, 0.08, 0.15); },
    spawn() { if (gate('spawn', 0.12)) { tone('sawtooth', 70, 48, 0.6, 0.03); hiss('lowpass', 400, 200, 0.7, 0.5, 0.05, 0, 0.2); } },
    death(e) { if (!gate('death', 0.05)) return; if (e.frozen) hiss('highpass', 3000, 8000, 0.7, 0.3, 0.25); tone('sine', 260, 70, 0.3, 0.12); },
    dodge() { hiss('bandpass', 500, 1800, 1, 0.2, 0.15, 0, 0.02); },
    ignite() { if (gate('ignite', 0.2)) hiss('lowpass', 600, 3000, 0.6, 0.6, 0.2, 0, 0.05); },
    wallBreak(e) { if (!gate('wb', 0.05)) return; hiss('lowpass', 1500, 200, 0.7, 0.25, 0.2); if (e.mat === 'ice') tone('sine', 2200, 2100, 0.15, 0.05); else tone('sine', 120, 60, 0.2, 0.15); },
    cancel() { tone('sine', 600, 300, 0.2, 0.08); hiss('highpass', 3000, 2000, 0.7, 0.2, 0.08); },
    wave() { tone('triangle', 110, 110, 1.3, 0.18); tone('triangle', 165, 165, 1.3, 0.12, 0.05); tone('sine', 55, 55, 1.5, 0.22); },
    waveClear() { [392, 523.3, 659.3, 784].forEach((f, i) => bell(f, 0.08, 0.7, i * 0.09)); },
    playerDeath() { tone('sine', 220, 50, 1.6, 0.4); hiss('lowpass', 600, 60, 0.7, 1.4, 0.3); },
    noEnergy: blip, fizzle: blip, queueFull: blip, cooldown: blip,
    impale() { if (gate('impale', 0.05)) { tone('sine', 2600, 1800, 0.12, 0.08); hiss('highpass', 4000, 7000, 0.6, 0.15, 0.15); tone('sine', 140, 70, 0.15, 0.2); } },
    beam(e) { if (!gate('beam', 0.08)) return; hiss('highpass', 3000, 6000, 0.6, 0.35, 0.12, 0, 0.01); tone('sawtooth', 220, 110, 0.4, 0.05); if (e.els.includes('light')) [1046, 1318, 1568].forEach((f, i) => tone('sine', f, f, 0.6, 0.04, i * 0.02)); },
    heal() { if (gate('heal', 0.4)) [784, 988].forEach((f, i) => bell(f, 0.04, 0.5, i * 0.06)); },
    swallow() { if (gate('swallow', 0.1)) tone('sine', 400, 60, 0.3, 0.1); },
    reflectShot() { tone('sine', 1800, 2400, 0.15, 0.06); },
    regrow() { if (gate('regrow', 0.2)) hiss('bandpass', 1800, 900, 2, 0.3, 0.08, 0, 0.05); },
    spread() { if (gate('spread', 0.2)) hiss('lowpass', 500, 2200, 0.6, 0.4, 0.14, 0, 0.04); },
    mark() { if (gate('mark', 0.1)) tone('sine', 1200, 300, 0.5, 0.05); },
    revive() { [392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => bell(f, 0.09, 0.9, i * 0.08)); },
    zap() { if (gate('pzap', 0.3)) zap(0.08); }
  };
  const TAG2 = {
    entangle() { if (gate('entangle', 0.15)) hiss('bandpass', 1500, 700, 2, 0.35, 0.12, 0, 0.03); },
    kindle() { if (gate('kindle', 0.15)) { hiss('lowpass', 400, 3000, 0.6, 0.5, 0.25, 0, 0.03); tone('sine', 90, 50, 0.4, 0.2); } },
    fan() { if (gate('fan', 0.15)) hiss('bandpass', 500, 2600, 1, 0.5, 0.18, 0, 0.05); },
    windchill() { if (gate('wch', 0.15)) hiss('highpass', 4000, 2500, 0.7, 0.35, 0.08); },
    purge() { if (gate('purge', 0.15)) [1318, 1760, 2349].forEach((f, i) => tone('sine', f, f, 0.5, 0.05, i * 0.03)); },
    curse() { if (gate('curse', 0.2)) tone('sawtooth', 110, 70, 0.5, 0.05); },
    blind() { if (gate('blind', 0.2)) tone('sine', 2093, 2093, 0.3, 0.04); },
    stun() { if (gate('stun', 0.2)) [1568, 1976].forEach((f, i) => tone('triangle', f, f, 0.2, 0.04, i * 0.05)); },
    thaw(e) { if (e.via === 'thermal' && gate('thermal', 0.1)) { hiss('highpass', 3000, 9000, 0.7, 0.3, 0.3); tone('sine', 160, 50, 0.4, 0.4); } }
  };

  return {
    init,
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      localStorage.setItem('cow_muted', muted ? '1' : '0');
      if (out) out.gain.setTargetAtTime(muted ? 0 : 0.6, ac.currentTime, 0.02);
      return muted;
    },
    play(events, s) {
      if (!ac || muted || ac.state !== 'running') return;
      for (const e of events) { H[e.type]?.(e, s); if (e.type === 'tag') TAG2[e.tag]?.(e); }
    }
  };
}
