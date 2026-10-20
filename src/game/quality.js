// Graphics quality for the browser port (R-110): tiers, a first guess from the device, a frame-time governor and
// fault guards. Pure (no three.js, no DOM) so node can test it; render.js and main.js apply the numbers.

export const TIER_ORDER = ['minimal', 'low', 'medium', 'high'];

// `high` is the look the game shipped with. Lower tiers give up resolution, bloom, shadows, lights and particles.
//   pixelRatio  cap on device pixels per CSS pixel      maxPixels  cap on rendered pixels (a 4K screen does not render 4K;
//               a phone's small screen stays sharp because its pixel count is far under the budget)
//   shadow      shadow map size, 0 = no shadow pass      bloom      the bloom pass
//   lights      point lights left lit (the rest are off) glow/dust  particle caps       density  share of particles kept
//   sprites     painterly sprite cap                     fx         density of the painterly layer
//   maxFps      0 = the display's rate
export const PROFILES = {
  high:    { pixelRatio: 1.75, maxPixels: 4.5e6, shadow: 2048, bloom: true,  lights: 24, glow: 6000, dust: 2500, density: 0.6,  sprites: 3600, fx: 0.75, maxFps: 0 },
  medium:  { pixelRatio: 1.5,  maxPixels: 2.3e6, shadow: 1024, bloom: true,  lights: 8,  glow: 3600, dust: 1500, density: 0.45, sprites: 2000, fx: 0.55, maxFps: 0 },
  low:     { pixelRatio: 1.25, maxPixels: 1.3e6, shadow: 0,    bloom: false, lights: 3,  glow: 1800, dust: 800,  density: 0.3,  sprites: 900,  fx: 0.35, maxFps: 0 },
  minimal: { pixelRatio: 0.75, maxPixels: 0.6e6, shadow: 0,    bloom: false, lights: 1,  glow: 800,  dust: 400,  density: 0.2,  sprites: 400,  fx: 0.2,  maxFps: 30 }
};

export const isTier = (t) => TIER_ORDER.includes(t);
const rank = (t) => TIER_ORDER.indexOf(t);
const lower = (a, b) => (rank(a) <= rank(b) ? a : b);

// Device pixels per CSS pixel to render at: the tier's cap, the screen's own ratio, and its pixel budget.
export function pixelRatioFor(profile, width, height, dpr = 1) {
  const css = Math.max(1, width * height);
  return Math.max(0.5, Math.min(dpr || 1, profile.pixelRatio, Math.sqrt(profile.maxPixels / css)));
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;
const OLD_GPU = /\bgma\b|intel.*\bhd graphics\b|mali-4|mali-t|adreno \(tm\) ?[2-4]\d\d\b|powervr|videocore/i;
const SHARED_GPU = /intel|mali|adreno|vega|qualcomm/i;

// The tier to start at, and the highest tier worth trying.
//   env: { param, stored, deviceMemory, cores, phone, gpu, maxTexture, maxFragUniforms }
// A tier named in the URL or saved from the menu is kept as it is and the governor leaves it alone.
export function pickTier(env = {}) {
  const chosen = [env.param, env.stored].find(isTier);
  if (chosen) return { tier: chosen, max: chosen, auto: false, why: 'chosen' };
  const { deviceMemory: mem, cores, phone, gpu = '', maxTexture, maxFragUniforms } = env;
  let max = 'high', start = 'high', why = 'default';
  const cap = (tier, reason, soft = false) => {
    if (rank(tier) < rank(max) && !soft) { max = tier; why = reason; }
    if (rank(tier) < rank(start)) { start = tier; if (soft) why = reason; }
  };
  if (SOFTWARE.test(gpu)) cap('minimal', 'software renderer');
  if (OLD_GPU.test(gpu)) cap('low', 'old graphics chip');
  if (mem && mem <= 2) cap('low', 'little memory');
  else if (mem && mem <= 4) cap('medium', 'modest memory');
  if (cores && cores <= 2) cap('low', 'few cores');
  else if (cores && cores <= 4) cap('medium', 'modest cpu');
  if (maxTexture && maxTexture < 8192) cap('low', 'small textures');
  if (maxFragUniforms && maxFragUniforms < 256) cap('low', 'few shader uniforms');
  else if (maxFragUniforms && maxFragUniforms < 512) cap('medium', 'few shader uniforms');
  if (phone) { cap('medium', 'phone'); cap(mem >= 6 && cores >= 8 ? 'medium' : 'low', 'phone', true); }
  else if (SHARED_GPU.test(gpu)) cap('medium', 'shared graphics', true);
  return { tier: lower(start, max), max, auto: true, why };
}

// Watches frame times and moves one tier at a time. It drops when the average stays under `downFps` for two windows
// (at once under `panicFps` or after three long stalls) and then never returns to a tier that was too slow. It climbs
// one tier after `upAfterMs` of frames at the display's rate, up to the ceiling.
export function createGovernor(o = {}) {
  const P = { windowMs: 1500, warmup: 45, settle: 30, downFps: 40, panicFps: 25, upFps: 57, upAfterMs: 20000, ...o };
  let ceil = rank(isTier(o.max) ? o.max : 'high');
  let idx = Math.min(rank(isTier(o.tier) ? o.tier : 'medium'), ceil);
  let auto = o.auto !== false, skip = P.warmup, badRuns = 0, goodMs = 0, fps = 0;
  let w = { n: 0, ms: 0, slow: 0, stalls: 0 };

  function move(dir, why) {
    const from = TIER_ORDER[idx];
    if (dir < 0) ceil = Math.min(ceil, idx - 1); // everything from here up is too slow for this machine
    idx += dir;
    skip = P.settle; badRuns = 0; goodMs = 0;
    return { from, to: TIER_ORDER[idx], why };
  }

  return {
    get tier() { return TIER_ORDER[idx]; },
    get max() { return TIER_ORDER[ceil]; },
    get auto() { return auto; },
    get fps() { return fps; },
    setAuto(on) { auto = !!on; skip = P.settle; w = { n: 0, ms: 0, slow: 0, stalls: 0 }; },
    force(tier) { if (!isTier(tier)) return; idx = rank(tier); auto = false; },
    // one frame took `ms`; returns {from, to, why} when the tier changes
    sample(ms) {
      if (!(ms > 0) || ms > 1000) { w = { n: 0, ms: 0, slow: 0, stalls: 0 }; return null; } // a hidden tab or a resume, not a slow game
      if (!auto) return null;
      if (skip > 0) { skip--; return null; }
      w.n++; w.ms += ms;
      if (ms > 50) w.slow++;
      if (ms > 400) w.stalls++;
      if (w.ms < P.windowMs) return null;
      fps = (1000 * w.n) / w.ms;
      const severe = fps < P.panicFps || w.stalls >= 3;
      const bad = severe || fps < P.downFps || w.slow / w.n > 0.2;
      const good = !bad && fps >= P.upFps && w.slow === 0 && w.stalls === 0;
      const span = w.ms;
      w = { n: 0, ms: 0, slow: 0, stalls: 0 };
      if (bad) {
        badRuns++; goodMs = 0;
        return (severe || badRuns >= 2) && idx > 0 ? move(-1, severe ? 'severe' : 'slow') : null;
      }
      badRuns = 0;
      if (!good) { goodMs = 0; return null; }
      goodMs += span;
      return goodMs >= P.upAfterMs && idx < ceil ? move(1, 'steady') : null;
    }
  };
}

// A frame that throws is tried again; a few in a row lower the quality; a run of them stops the game with a card.
export function createFaultGuard({ degradeAt = 3, stopAt = 6, total = 60 } = {}) {
  let streak = 0, all = 0, last = null;
  return {
    get last() { return last; },
    get count() { return all; },
    ok() { streak = 0; },
    fault(err) {
      last = err; streak++; all++;
      if (all >= total || streak >= stopAt) return 'stop';
      return streak % degradeAt === 0 ? 'degrade' : 'retry';
    }
  };
}

// Runs optional layers (effects, particles) so one that keeps throwing is switched off instead of ending the frame.
export function createSafeRunner({ limit = 3, onFault, onDisable } = {}) {
  const strikes = new Map(), off = new Set();
  return {
    run(name, fn) {
      if (off.has(name)) return false;
      try { fn(); strikes.delete(name); return true; } catch (err) {
        const n = (strikes.get(name) ?? 0) + 1;
        strikes.set(name, n);
        onFault?.(name, err, n);
        if (n >= limit) { off.add(name); onDisable?.(name, err); }
        return false;
      }
    },
    disabled: (name) => off.has(name),
    reset(name) { if (name) { off.delete(name); strikes.delete(name); } else { off.clear(); strikes.clear(); } }
  };
}

// Storage that may be blocked (private windows, strict settings): reads give null, writes give false, nothing throws.
export function safeGet(key) { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } }
export function safeSet(key, value) { try { globalThis.localStorage.setItem(key, value); return true; } catch { return false; } }
