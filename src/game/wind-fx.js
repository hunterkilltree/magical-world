// Dedicated Wind Visual Effects System:
// Generates authentic swirling tornadoes, curving aerodynamic streamlines,
// and ground vortex spirals directly matching the reference wind designs.
import * as THREE from 'three';

// Procedural texture generators using Canvas2D
function createVortexTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const cx = S / 2, cy = S / 2;

  ctx.clearRect(0, 0, S, S);

  // Concentric curved spiral arms with feathered edges
  const arms = 4;
  for (let a = 0; a < arms; a++) {
    const baseAngle = (a / arms) * Math.PI * 2;
    for (let strand = 0; strand < 4; strand++) {
      const strandOffset = (strand - 1.5) * 0.18;
      ctx.beginPath();
      const points = 60;
      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const angle = baseAngle + strandOffset + t * Math.PI * 2.2;
        const r = (0.12 + Math.pow(t, 0.85) * 0.82) * (S * 0.44);
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const alpha = (0.35 + Math.random() * 0.4) * (1 - strand * 0.12);
      ctx.strokeStyle = `rgba(240, 248, 255, ${alpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(2, (1 - strand * 0.2) * (4 + (strand % 2) * 5));
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // Soft luminous center glow
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.35);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(0.4, 'rgba(235, 245, 255, 0.2)');
  grad.addColorStop(1, 'rgba(220, 240, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.35, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStreamlineTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Multi-layered undulating wave streamlines with tapered ends
  const strands = [
    { dy: 0, amp: 28, freq: 2.2, width: 9, alpha: 0.85 },
    { dy: -18, amp: 22, freq: 2.6, width: 5, alpha: 0.65 },
    { dy: 16, amp: 24, freq: 2.4, width: 6, alpha: 0.68 },
    { dy: -32, amp: 16, freq: 3.1, width: 3.5, alpha: 0.45 },
    { dy: 30, amp: 18, freq: 2.9, width: 4, alpha: 0.48 },
    { dy: -44, amp: 12, freq: 3.6, width: 2, alpha: 0.3 },
    { dy: 42, amp: 14, freq: 3.4, width: 2.5, alpha: 0.32 },
  ];

  for (const s of strands) {
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps; // 0 to 1
      const x = 30 + u * (W - 60);
      const envelope = Math.sin(u * Math.PI); // tapered ends
      const wave = Math.sin(u * Math.PI * s.freq) * (s.amp * envelope);
      const y = cy + s.dy * envelope + wave;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    const strokeGrad = ctx.createLinearGradient(0, 0, W, 0);
    strokeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    strokeGrad.addColorStop(0.15, `rgba(242, 250, 255, ${s.alpha * 0.7})`);
    strokeGrad.addColorStop(0.5, `rgba(255, 255, 255, ${s.alpha})`);
    strokeGrad.addColorStop(0.85, `rgba(240, 248, 255, ${s.alpha * 0.7})`);
    strokeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFunnelRingTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, W, H);

  // Multiple horizontal wind speed lines
  for (let i = 0; i < 9; i++) {
    const y = (i + 1) * (H / 10);
    const alpha = Math.sin((y / H) * Math.PI) * 0.75;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.strokeStyle = `rgba(245, 250, 255, ${alpha.toFixed(3)})`;
    ctx.lineWidth = (i % 2 === 0 ? 5 : 2.5) * Math.sin((y / H) * Math.PI);
    ctx.stroke();
  }

  // Soft vertical gradient to prevent sharp edge clipping
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.4)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWindFx({ scene, vfx, glow }) {
  const vortexTex = createVortexTexture();
  const streamlineTex = createStreamlineTexture();
  const funnelRingTex = createFunnelRingTexture();

  const activeEffects = [];
  const shotWindAttachments = new Map();

  const DISC_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const CYL_RING_GEO = new THREE.CylinderGeometry(1, 1, 0.28, 32, 1, true);

  function createWindMaterial(map, colorHex = 0xeaf6ff, opacity = 0.85, additive = true) {
    return new THREE.MeshBasicMaterial({
      map,
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
  }

  // Spawns a full 3D tornado / whirlwind funnel (matching top of reference image)
  function spawnWhirlwind(x, z, opts = {}) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const color = opts.color ?? 0xeaf6ff;
    const maxLife = opts.life ?? 1.4;
    const baseRadius = opts.radius ?? 1.3;
    const height = opts.height ?? 3.2;
    const vx = opts.vx ?? 0;
    const vz = opts.vz ?? 0;
    const additive = opts.additive ?? true;

    // Stacked concentric spinning ribbon rings that form a funnel
    const ringCount = 6;
    const rings = [];

    for (let i = 0; i < ringCount; i++) {
      const frac = i / (ringCount - 1);
      // Funnel shape: narrower at bottom, wider at top
      const r = baseRadius * (0.35 + Math.pow(frac, 0.75) * 1.05);
      const y = 0.15 + frac * (height - 0.2);

      const mat = createWindMaterial(funnelRingTex, color, 0.75 - frac * 0.2, additive);
      const mesh = new THREE.Mesh(CYL_RING_GEO, mat);
      mesh.position.set(0, y, 0);
      mesh.scale.set(r, 0.2 + frac * 0.15, r);
      // Alternate spin directions and rates for layered vortex turbulence
      const spinSpeed = (i % 2 === 0 ? 1 : -0.7) * (14 + i * 2.5);

      group.add(mesh);
      rings.push({ mesh, mat, r, y, spinSpeed, frac });
    }

    // Ground spiral disc (matching center of reference image)
    const groundMat = createWindMaterial(vortexTex, color, 0.8, additive);
    const groundDisc = new THREE.Mesh(DISC_GEO, groundMat);
    groundDisc.position.set(0, 0.04, 0);
    groundDisc.scale.setScalar(baseRadius * 1.5);
    group.add(groundDisc);

    // Inner spiraling helix cone for dense vortex core
    const coreConeMat = createWindMaterial(funnelRingTex, 0xffffff, 0.6, true);
    const coreCone = new THREE.Mesh(
      new THREE.CylinderGeometry(baseRadius * 0.8, baseRadius * 0.15, height * 0.9, 24, 1, true),
      coreConeMat
    );
    coreCone.position.set(0, height * 0.45, 0);
    group.add(coreCone);

    scene.add(group);

    const effect = {
      type: 'tornado',
      group,
      life: maxLife,
      maxLife,
      vx,
      vz,
      tick(dt) {
        this.life -= dt;
        const k = 1 - Math.max(0, this.life) / this.maxLife; // 0 to 1

        // Travel along velocity
        group.position.x += this.vx * dt;
        group.position.z += this.vz * dt;

        // Rise up and expand during birth, dissolve gracefully at death
        const growK = Math.min(1, k / 0.15);
        const fadeK = Math.min(1, this.life / 0.35);
        const scale = growK * (1 + 0.3 * k);

        group.scale.set(scale, growK, scale);

        // Spin each ring independently
        for (const r of rings) {
          r.mesh.rotation.y += r.spinSpeed * dt;
          r.mat.opacity = (0.75 - r.frac * 0.2) * fadeK;
        }

        groundDisc.rotation.y += 11 * dt;
        groundDisc.scale.setScalar(baseRadius * 1.5 * (1 + 0.4 * k));
        groundMat.opacity = 0.8 * fadeK;

        coreCone.rotation.y -= 18 * dt;
        coreConeMat.opacity = 0.6 * fadeK;

        // Subtle vortex wobble
        group.rotation.x = Math.sin(k * 18) * 0.06;
        group.rotation.z = Math.cos(k * 15) * 0.06;

        return this.life > 0;
      },
      destroy() {
        scene.remove(group);
        for (const r of rings) r.mat.dispose();
        groundMat.dispose();
        coreConeMat.dispose();
      }
    };

    activeEffects.push(effect);
    return effect;
  }

  // Spawns sweeping directional aerodynamic wind streamline ribbons (matching bottom of reference image)
  function spawnWindGust(x, y, z, dx, dz, opts = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    const angle = Math.atan2(nx, nz);
    group.rotation.y = angle;

    const color = opts.color ?? 0xeaf6ff;
    const speed = opts.speed ?? (18 + Math.random() * 8);
    const maxLife = opts.life ?? 0.65;
    const scale = opts.scale ?? 1.0;

    // Create 3 curved streamline ribbon planes offset from center
    const RIBBON_GEO = new THREE.PlaneGeometry(1.6 * scale, 4.5 * scale, 1, 8);
    // Orient ribbon along flight axis
    RIBBON_GEO.rotateX(-Math.PI / 2);

    const ribbons = [];
    const count = opts.count ?? 3;

    for (let i = 0; i < count; i++) {
      const mat = createWindMaterial(streamlineTex, color, 0.85 - i * 0.15, true);
      const mesh = new THREE.Mesh(RIBBON_GEO, mat);

      // Offset slightly left/right and up/down
      const lateral = (i - (count - 1) / 2) * (0.65 * scale);
      const vert = ((i % 2 === 0 ? 0.12 : -0.15) * scale);
      mesh.position.set(lateral, vert, 0);

      group.add(mesh);
      ribbons.push({ mesh, mat, lateral, vert, phase: i * 1.5 });
    }

    scene.add(group);

    const effect = {
      type: 'gust',
      group,
      life: maxLife,
      maxLife,
      speed,
      nx,
      nz,
      tick(dt) {
        this.life -= dt;
        const k = 1 - Math.max(0, this.life) / this.maxLife;

        // Propel forward
        group.position.x += this.nx * this.speed * dt;
        group.position.z += this.nz * this.speed * dt;

        const fadeK = Math.min(1, (1 - k) / 0.35);

        // Undulate each streamline like aerodynamic flutter
        for (const r of ribbons) {
          const wave = Math.sin(k * 22 + r.phase) * (0.2 * scale);
          r.mesh.position.y = r.vert + wave;
          r.mat.opacity = 0.85 * fadeK;
        }

        return this.life > 0;
      },
      destroy() {
        scene.remove(group);
        for (const r of ribbons) r.mat.dispose();
      }
    };

    activeEffects.push(effect);
    return effect;
  }

  // Spawns a spinning ground cyclone / vortex spiral (matching center of reference image)
  function spawnGroundVortex(x, z, r = 2.0, maxLife = 0.85, color = 0xeaf6ff) {
    const mat = createWindMaterial(vortexTex, color, 0.85, true);
    const disc = new THREE.Mesh(DISC_GEO, mat);
    disc.position.set(x, 0.045, z);
    disc.scale.setScalar(r * 0.5);
    scene.add(disc);

    const effect = {
      type: 'groundVortex',
      disc,
      mat,
      r,
      life: maxLife,
      maxLife,
      tick(dt) {
        this.life -= dt;
        const k = 1 - Math.max(0, this.life) / this.maxLife;

        disc.rotation.y += (16 - 8 * k) * dt;
        const curR = this.r * (0.5 + 0.65 * easeOutQuad(k));
        disc.scale.setScalar(curR);

        const fadeK = Math.min(1, (1 - k) / 0.4);
        mat.opacity = 0.85 * fadeK;

        return this.life > 0;
      },
      destroy() {
        scene.remove(disc);
        mat.dispose();
      }
    };

    activeEffects.push(effect);
    return effect;
  }

  function easeOutQuad(t) {
    return t * (2 - t);
  }

  // Determines elemental coloration for wind combinations
  function getWindColor(els) {
    if (!els || !els.length) return 0xeaf6ff;
    if (els.includes('fire')) return 0xff8533; // Fire Tornado (fiery amber/orange wind)
    if (els.includes('ice')) return 0xa8f2ff;  // Blizzard / Glacial Gale (frost cyan wind)
    if (els.includes('lightning')) return 0xfff690; // Thunder Gale (electric bright wind)
    if (els.includes('dark')) return 0xc078ff; // Void Vortex (ethereal violet wind)
    if (els.includes('light')) return 0xfff3c8; // Solar Gale (radiant golden wind)
    if (els.includes('nature')) return 0x98f585; // Leaf Gale (emerald wind)
    if (els.includes('water')) return 0x76c4ff; // Scalding Squall / Typhoon (aquamarine wind)
    return 0xeaf6ff; // Pure pristine wind (luminous white/sky)
  }

  // Hook for windup: creates a gathering spiral vortex into the wizard's hands/staff
  function onWindup(e, tip) {
    if (!e.els || !e.els.includes('wind')) return;
    const color = getWindColor(e.els);
    spawnGroundVortex(e.x, e.z, 2.4, e.t + (e.hold || 0.1), color);

    // Gathering horizontal streamline gusts curving inwards
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const dist = 2.2;
      spawnWindGust(
        e.x + Math.sin(a) * dist,
        0.8,
        e.z + Math.cos(a) * dist,
        -Math.sin(a),
        -Math.cos(a),
        { color, speed: 6, life: e.t, count: 2, scale: 0.65 }
      );
    }
  }

  // Hook for cast release: fires visible aerodynamic wind streamlines and vortexes
  function onCast(e, tip) {
    if (!e.els || !e.els.includes('wind')) return;

    const color = getWindColor(e.els);
    const distinct = e.distinct ?? new Set(e.els).size;
    const isCombo = distinct >= 2 || e.els.length >= 2;
    const isHeavy = e.shape === 'area' || e.shape === 'boulder' || isCombo || e.mode === 'self' || e.mode === 'nova';

    // 1. Surging forward wind streamlines (matching bottom of image)
    const aimDx = e.dx || 0, aimDz = e.dz || 1;
    const originX = tip ? tip.x : e.x, originZ = tip ? tip.z : e.z;

    spawnWindGust(originX, 1.1, originZ, aimDx, aimDz, {
      color,
      speed: 22,
      count: isCombo ? 5 : 3,
      scale: isCombo ? 1.25 : 1.0,
      life: 0.65
    });

    // Lateral flanking wind gusts for wide airflow spread
    const perpX = -aimDz, perpZ = aimDx;
    spawnWindGust(originX + perpX * 0.45, 1.2, originZ + perpZ * 0.45, aimDx + perpX * 0.18, aimDz + perpZ * 0.18, {
      color,
      speed: 20,
      count: 2,
      scale: 0.85,
      life: 0.55
    });
    spawnWindGust(originX - perpX * 0.45, 1.0, originZ - perpZ * 0.45, aimDx - perpX * 0.18, aimDz - perpZ * 0.18, {
      color,
      speed: 20,
      count: 2,
      scale: 0.85,
      life: 0.55
    });

    // 2. Ground vortex under the caster
    spawnGroundVortex(e.x, e.z, isHeavy ? 3.4 : 2.2, 0.9, color);

    // 3. For heavy casts, combos, or area/self: spawn full vertical whirlwind column (top of image)
    if (isHeavy || e.key?.includes('wind')) {
      const tornadoX = (e.mode === 'self' || e.mode === 'nova') ? e.x : (originX + aimDx * 2.5);
      const tornadoZ = (e.mode === 'self' || e.mode === 'nova') ? e.z : (originZ + aimDz * 2.5);

      spawnWhirlwind(tornadoX, tornadoZ, {
        color,
        life: isCombo ? 1.8 : 1.2,
        radius: isCombo ? 1.6 : 1.2,
        height: isCombo ? 3.8 : 2.8,
        vx: (e.mode === 'self' || e.mode === 'nova') ? 0 : aimDx * 7,
        vz: (e.mode === 'self' || e.mode === 'nova') ? 0 : aimDz * 7
      });
    }
  }

  // Updates active wind shots and attachments
  function syncShotWinds(shots, dt) {
    const activeShotIds = new Set();

    for (const b of shots) {
      if (!b.els || !b.els.includes('wind')) continue;
      activeShotIds.add(b.id);

      let att = shotWindAttachments.get(b.id);
      if (!att) {
        const color = getWindColor(b.els);
        const group = new THREE.Group();

        // 1. Swirling wind vortex ring surrounding the projectile
        const ringMat = createWindMaterial(funnelRingTex, color, 0.85, true);
        const ringMesh = new THREE.Mesh(CYL_RING_GEO, ringMat);
        ringMesh.scale.set(b.r * 2.2, 0.25, b.r * 2.2);
        group.add(ringMesh);

        // 2. Spinning front cyclone disc
        const discMat = createWindMaterial(vortexTex, color, 0.9, true);
        const discMesh = new THREE.Mesh(DISC_GEO, discMat);
        discMesh.scale.setScalar(b.r * 2.4);
        group.add(discMesh);

        // 3. Trailing aerodynamic wind ribbon streamer
        const streamMat = createWindMaterial(streamlineTex, color, 0.8, true);
        const streamGeo = new THREE.PlaneGeometry(b.r * 2.4, b.r * 6.5, 1, 6).rotateX(-Math.PI / 2);
        const streamMesh = new THREE.Mesh(streamGeo, streamMat);
        streamMesh.position.set(0, 0, -b.r * 2.6);
        group.add(streamMesh);

        scene.add(group);
        att = { group, ringMesh, discMesh, streamMesh, ringMat, discMat, streamMat, time: 0 };
        shotWindAttachments.set(b.id, att);
      }

      // Update position and rotation to follow projectile
      const y = b.y ?? (b.kind === 'boulder' ? 0.95 : 1.15);
      att.group.position.set(b.x, y, b.z);
      att.time += dt;

      // Orient group along movement direction
      const hs = Math.hypot(b.vx, b.vz);
      if (hs > 0.1) {
        att.group.rotation.y = Math.atan2(b.vx, b.vz);
      }

      // Spin vortex ring and disc rapidly
      att.ringMesh.rotation.y += 24 * dt;
      att.discMesh.rotation.y += 18 * dt;

      // Streamline ribbon undulation
      att.streamMesh.position.y = Math.sin(att.time * 26) * 0.08;

      // Periodically spawn ground wind trail
      if (Math.random() < dt * 14) {
        spawnGroundVortex(b.x, b.z, b.r * 1.6, 0.45, getWindColor(b.els));
      }
    }

    // Clean up removed shots
    for (const [id, att] of shotWindAttachments) {
      if (!activeShotIds.has(id)) {
        scene.remove(att.group);
        att.ringMat.dispose();
        att.discMat.dispose();
        att.streamMat.dispose();
        shotWindAttachments.delete(id);
      }
    }
  }

  return {
    spawnWhirlwind,
    spawnWindGust,
    spawnGroundVortex,
    onWindup,
    onCast,
    update(dt, state) {
      // Update attached shot winds
      if (state && state.shots) {
        syncShotWinds(state.shots, dt);
      }

      // Update active standalone wind effects
      for (let i = activeEffects.length - 1; i >= 0; i--) {
        const eff = activeEffects[i];
        const alive = eff.tick(dt);
        if (!alive) {
          eff.destroy();
          activeEffects.splice(i, 1);
        }
      }
    },
    reset() {
      for (const eff of activeEffects) eff.destroy();
      activeEffects.length = 0;
      for (const [id, att] of shotWindAttachments) {
        scene.remove(att.group);
        att.ringMat.dispose();
        att.discMat.dispose();
        att.streamMat.dispose();
      }
      shotWindAttachments.clear();
    }
  };
}
