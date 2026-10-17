// High-fidelity sound effects engine:
// Combines authentic recorded CC0 studio clips (data/sfx.json) with dynamic pitch-shifting,
// stereo spatialization, musical element chords, and low-frequency tactile synthesis.
import sfxData from '../../data/sfx.json';

const NOTE = {
  earth: 261.6,
  nature: 349.2,
  fire: 392.0,
  wind: 493.9,
  arcane: 523.3,
  water: 587.3,
  ice: 659.3,
  light: 1046.5,
  dark: 220.0,
  lightning: 880.0
};
const BASE_NOTE = 523.3;

const SOUNDS = sfxData.sounds || {};

export function createAudio() {
  let ac = null;
  let masterGain = null;
  let compressor = null;
  let muted = localStorage.getItem('cow_muted') === '1';
  let volume = 0.85;

  const bufferCache = new Map();
  const loadingPromises = new Map();
  const lastPlayTime = new Map();
  let clock = 0;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    ac = new AudioContextClass();

    // Studio-grade dynamic mastering chain
    compressor = ac.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 10;
    compressor.ratio.value = 4.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;

    masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(muted ? 0 : volume, ac.currentTime);

    masterGain.connect(compressor);
    compressor.connect(ac.destination);

    preloadCommon();
  }

  function resolvePath(fileUri) {
    // Converts "res://audio/sfx/foo.ogg" -> "/audio/sfx/foo.ogg"
    return fileUri.replace(/^res:\/\//, '/');
  }

  async function loadBuffer(url) {
    if (bufferCache.has(url)) return bufferCache.get(url);
    if (loadingPromises.has(url)) return loadingPromises.get(url);

    const promise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        if (!ac) return null;
        const decoded = await ac.decodeAudioData(arrayBuf);
        bufferCache.set(url, decoded);
        return decoded;
      } catch (err) {
        console.warn(`[audio] Failed to load ${url}:`, err.message);
        return null;
      } finally {
        loadingPromises.delete(url);
      }
    })();

    loadingPromises.set(url, promise);
    return promise;
  }

  function preloadCommon() {
    const priorityKeys = [
      'chime', 'combo_ready', 'combo_thump', 'fanfare',
      'cast_fire', 'cast_water', 'cast_ice', 'cast_lightning', 'cast_earth', 'cast_arcane',
      'cast_nature', 'cast_wind', 'cast_light', 'cast_dark',
      'explode_small', 'explode_big', 'impact', 'boulder', 'zap', 'beam',
      'hit', 'hurt', 'tag_shatter', 'tag_freeze', 'dodge', 'clear', 'refuse'
    ];
    for (const k of priorityKeys) {
      const cfg = SOUNDS[k];
      if (cfg && cfg.files && cfg.files.length) {
        // Preload first 2 variations of critical sounds
        for (let i = 0; i < Math.min(2, cfg.files.length); i++) {
          loadBuffer(resolvePath(cfg.files[i]));
        }
      }
    }
  }

  // Sub-bass layer for cinematic impact punch
  function subRumble(f0, f1, dur, gainVal) {
    if (!ac || muted) return;
    try {
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);

      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(gainVal * volume, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) {}
  }

  function playKey(key, pos = null, pitchMultiplier = 1.0, delay = 0.0) {
    if (!ac || muted) return false;
    const cfg = SOUNDS[key];
    if (!cfg || !cfg.files || !cfg.files.length) return false;

    const throttle = cfg.throttle || 0.0;
    const last = lastPlayTime.get(key) || -999;
    if (clock - last < throttle) return false;
    lastPlayTime.set(key, clock);

    // Pick random take
    const files = cfg.files;
    const pickedFile = files[Math.floor(Math.random() * files.length)];
    const url = resolvePath(pickedFile);

    const pitchRange = cfg.pitch || [1.0, 1.0];
    const rndPitch = pitchRange[0] + Math.random() * (pitchRange[1] - pitchRange[0]);
    const finalPitch = Math.max(0.1, Math.min(4.0, rndPitch * pitchMultiplier));

    const db = typeof cfg.db === 'number' ? cfg.db : -6;
    const linearVol = Math.pow(10, db / 20);

    const targetTime = ac.currentTime + delay;

    const playNode = (buf) => {
      if (!buf || !ac) return;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.setValueAtTime(finalPitch, targetTime);

      const gainNode = ac.createGain();
      const peakVol = linearVol;
      gainNode.gain.setValueAtTime(peakVol, targetTime);

      const clipLen = cfg.len || 0;
      if (clipLen > 0) {
        const fadeStart = targetTime + Math.max(0.05, clipLen - 0.08);
        const stopTime = targetTime + clipLen;
        gainNode.gain.setValueAtTime(peakVol, fadeStart);
        gainNode.gain.linearRampToValueAtTime(0.0001, stopTime);
      }

      // Spatial stereo panning if event position is provided
      if (pos && typeof pos.x === 'number' && ac.createStereoPanner) {
        const panner = ac.createStereoPanner();
        // Arena radius is roughly 16-18 units
        const pan = Math.max(-0.85, Math.min(0.85, pos.x / 16));
        panner.pan.setValueAtTime(pan, targetTime);
        src.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(masterGain);
      } else {
        src.connect(gainNode);
        gainNode.connect(masterGain);
      }

      let offset = 0;
      if (cfg.offset && clipLen > 0 && buf.duration > clipLen) {
        offset = Math.random() * Math.max(0, buf.duration - clipLen);
      }

      src.start(targetTime, offset);
      if (clipLen > 0) src.stop(targetTime + clipLen + 0.05); // a source must start before it can be told to stop
    };

    if (bufferCache.has(url)) {
      playNode(bufferCache.get(url));
    } else {
      loadBuffer(url).then(playNode);
    }

    return true;
  }

  function distinct(arr) {
    return Array.from(new Set(arr));
  }

  function consumeEvents(events, sim) {
    if (!ac || muted) return;

    for (const e of events) {
      const pos = { x: e.x, y: e.y, z: e.z };

      switch (e.type) {
        case 'queue': {
          const noteHz = NOTE[e.el] || BASE_NOTE;
          playKey('chime', null, noteHz / BASE_NOTE);
          const q = sim?.player?.queue || [];
          if (distinct(q).length >= 2 && q[q.length - 1] === e.el) {
            playKey('combo_ready', null, 1.0, 0.05);
          }
          break;
        }

        case 'cast': {
          const els = distinct(e.els || []);
          for (const el of els) {
            playKey('cast_' + el, pos);
          }

          if (e.fromQueue && els.length >= 2) {
            // Musical chord arpeggio for combo cast
            for (let i = 0; i < els.length; i++) {
              const elNote = NOTE[els[i]] || BASE_NOTE;
              playKey('chime', null, (elNote / 2) / BASE_NOTE, i * 0.035);
            }
            playKey('combo_thump', pos);
            subRumble(85, 38, 0.45, 0.35);

            if (e.isNew) {
              playKey('fanfare', null, 1.0, 0.12);
            }
          }
          break;
        }

        case 'nova':
          playKey('nova', pos);
          subRumble(95, 42, 0.35, 0.3);
          break;

        case 'selfcast':
          playKey('selfcast', pos);
          break;

        case 'heal':
          playKey('heal', pos);
          break;

        case 'ward':
          playKey('ward', pos);
          break;

        case 'guard':
          playKey('ward', pos);
          break;

        case 'blink':
          playKey('selfcast', pos, 1.35);
          break;

        case 'dash':
          playKey('dodge', pos, 1.15);
          break;

        case 'swap':
          playKey('selfcast', pos, 1.2);
          playKey('zap', pos, 1.4);
          break;

        case 'decoy':
          playKey('spawn', pos, 1.25);
          playKey('ward', pos, 1.2);
          break;

        case 'explode':
          if (e.big) {
            playKey('explode_big', pos);
            subRumble(75, 26, 0.8, 0.7);
          } else {
            playKey('explode_small', pos);
            subRumble(110, 45, 0.35, 0.4);
          }
          break;

        case 'impact':
          if (e.enemy) {
            playKey('orb_impact', pos);
          } else if (e.kind === 'boulder') {
            playKey('boulder', pos);
            subRumble(100, 40, 0.3, 0.4);
          } else {
            playKey('impact', pos);
          }
          break;

        case 'chain':
        case 'charge':
        case 'zap': {
          const targetPos = (e.pts && e.pts[1]) ? { x: e.pts[1][0], z: e.pts[1][1] } : pos;
          playKey('zap', targetPos);
          break;
        }

        case 'beam':
          playKey('beam', pos);
          break;

        case 'hit':
          if (!e.dot) playKey('hit', pos);
          break;

        case 'hurt':
          if (!e.dot) {
            playKey('hurt', pos);
            subRumble(120, 50, 0.22, 0.35);
          }
          break;

        case 'tag':
          if (e.tag) playKey('tag_' + e.tag, pos);
          break;

        case 'block':
        case 'deflect':
        case 'reflectShot':
          playKey('tag_blocked', pos);
          break;

        case 'steam':
          playKey('steam', pos);
          break;

        case 'ignite':
          playKey('ignite', pos);
          break;

        case 'slam':
          playKey('slam', pos);
          subRumble(70, 24, 0.6, 0.6);
          break;

        case 'claw':
        case 'impale':
          playKey('claw', pos);
          break;

        case 'spawn':
          playKey('spawn', pos);
          break;

        case 'death':
          if (e.frozen) {
            playKey('death_frozen', pos);
          } else {
            playKey('death', pos);
          }
          break;

        case 'dodge':
          playKey('dodge', pos);
          break;

        case 'wall':
          playKey('wall_raise', pos);
          break;

        case 'wallBreak':
          if (e.mat === 'ice') playKey('wall_break_ice', pos);
          else playKey('wall_break', pos);
          break;

        case 'cancel':
          playKey('cancel');
          break;

        case 'clear':
          playKey('clear');
          break;

        case 'wave':
          playKey('wave');
          subRumble(60, 30, 1.2, 0.65);
          break;

        case 'waveClear':
          playKey('wave_clear');
          break;

        case 'playerDeath':
          playKey('player_death');
          subRumble(50, 20, 1.6, 0.9);
          break;

        case 'noEnergy':
        case 'fizzle':
        case 'queueFull':
        case 'cooldown':
          playKey('refuse');
          break;
      }
    }
  }

  return {
    init,
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      localStorage.setItem('cow_muted', muted ? '1' : '0');
      if (masterGain && ac) {
        masterGain.gain.setValueAtTime(muted ? 0 : volume, ac.currentTime);
      }
      return muted;
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (masterGain && ac && !muted) {
        masterGain.gain.setValueAtTime(volume, ac.currentTime);
      }
    },
    play(events, sim) {
      if (!events || !events.length) return;
      if (!ac) init();
      clock += 1 / 60;
      consumeEvents(events, sim);
    }
  };
}
