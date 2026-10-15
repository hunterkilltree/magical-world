// Elemental special effects and lens flares for the 10 elements.
import * as THREE from 'three';
import { ELEMENTS } from './spells.js';

export function createElementsFx({ scene, camera, vfx, glow, api }) {
  const flares = [];

  return {
    reset() {
      flares.length = 0;
    },
    onEvent(e, s) {
      if (e.type === 'cast' && e.color && ((e.distinct ?? 1) >= 2 || e.big)) {
        flares.push({ x: e.x, y: 1.2, z: e.z, color: e.color, life: 0.35, max: 0.35 });
      } else if (e.type === 'explode' && e.big) {
        flares.push({ x: e.x, y: 1.5, z: e.z, color: e.color || 0xffffff, life: 0.45, max: 0.45 });
      }
    },
    update(dt, s) {
      const lens = [];
      const _v = new THREE.Vector3();
      for (let i = flares.length - 1; i >= 0; i--) {
        const f = flares[i];
        f.life -= dt;
        if (f.life <= 0) {
          flares.splice(i, 1);
          continue;
        }
        if (lens.length < 3) {
          _v.set(f.x, f.y, f.z).project(camera);
          const intensity = Math.sin((f.life / f.max) * Math.PI);
          lens.push([(_v.x + 1) / 2, (_v.y + 1) / 2, intensity, 0.4]);
        }
      }
      return lens;
    }
  };
}
