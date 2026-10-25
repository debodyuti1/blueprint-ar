// The Empire State Building as glowing blueprint lines, shared by the AR
// view (anchored to the poster) and the full-screen 3D view.
// Units: building height = 1 (ground at y = 0, spire tip at y = 1).
import * as THREE from 'three';

/* ---------- data (loaded once, geometry shared by every instance) ---------- */
let dataPromise = null;
export function loadBuildingData() {
  if (!dataPromise) dataPromise = (async () => {
    const [meta, buf] = await Promise.all([
      fetch('assets/edges.bin.json').then(r => r.json()),
      fetch('assets/edges.bin').then(r => r.arrayBuffer()),
    ]);
    const q = new Uint16Array(buf);
    const pos = new Float32Array(q.length);
    const { min, max, axis } = meta;
    const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const H = ext[1];
    for (let i = 0; i < q.length; i++) {
      const k = i % 3;
      let v = min[k] + (q[i] / 65535) * ext[k];
      if (k === 0) v -= axis[0];
      if (k === 2) v -= axis[1];
      pos[i] = v / H;
    }
    const segCount = q.length / 6;
    const segMinY = new Float32Array(segCount);
    for (let s = 0; s < segCount; s++) segMinY[s] = Math.min(pos[s * 6 + 1], pos[s * 6 + 4]);
    // footprint half-widths per 1% of height (for the weld ring + sparks)
    const B = 100, fx = new Float32Array(B), fz = new Float32Array(B);
    for (let i = 0; i < pos.length; i += 3) {
      const b = Math.min(B - 1, Math.max(0, Math.floor(pos[i + 1] * B)));
      fx[b] = Math.max(fx[b], Math.abs(pos[i])); fz[b] = Math.max(fz[b], Math.abs(pos[i + 2]));
    }
    for (let b = 1; b < B; b++) if (!fx[b]) { fx[b] = fx[b - 1]; fz[b] = fz[b - 1]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 0.6);
    return { geo, segCount, segMinY, fx, fz, B };
  })();
  return dataPromise;
}

/* ---------- line shader: build cut, weld glow, night lights ---------- */
const lineVert = /* glsl */`
  varying float vY;
  varying vec3 vP;
  void main() {
    vY = position.y; vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const lineFrag = /* glsl */`
  uniform float uCut, uLight, uNight, uOpacity, uTime, uFade;
  varying float vY;
  varying vec3 vP;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    if (vY > uCut) discard;
    vec3 day = vec3(0.86, 0.92, 1.0);
    float a = uOpacity;
    vec3 col = day;
    // hot weld line at the top of what's built
    float weld = smoothstep(0.022, 0.0, uCut - vY) * step(uCut, 0.995);
    col = mix(col, vec3(1.0, 0.82, 0.45), weld);
    a = mix(a, 1.0, weld);
    // night: floors light up warm from the ground to uLight, with flicker
    float lit = step(vY, uLight) * uNight;
    float band = floor(vY * 160.0);
    float flick = 0.75 + 0.25 * hash(band + floor(uTime * 0.6 + hash(band) * 7.0));
    vec3 warm = vec3(1.0, 0.78, 0.38) * flick;
    col = mix(mix(col, vec3(0.45, 0.58, 0.85), uNight * 0.6), warm, lit);
    a = mix(a, mix(0.16, 0.46, lit), uNight);
    gl_FragColor = vec4(col, a * uFade);
  }`;

/* ---------- Chrysler Building ghost (1,046 ft), drawn procedurally ---------- */
const CHRYSLER_H = 1046 / 1454;
function chryslerGeometry() {
  const v = [];
  const seg = (a, b) => v.push(...a, ...b);
  const box = (y0, y1, hx, hz) => {
    const c = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (let i = 0; i < 4; i++) {
      const [x, z] = c[i], [x2, z2] = c[(i + 1) % 4];
      seg([x, y0, z], [x, y1, z]);
      seg([x, y1, z], [x2, y1, z2]);
      seg([x, y0, z], [x2, y0, z2]);
    }
  };
  box(0, 0.075, 0.12, 0.09);
  box(0.075, 0.2, 0.085, 0.07);
  box(0.2, 0.43, 0.062, 0.062);
  box(0.43, 0.5, 0.052, 0.052);
  // stepped crown: shrinking arches on all four faces
  for (let k = 0; k < 5; k++) {
    const r = 0.048 - k * 0.0085, y = 0.5 + k * 0.024, h = r * 1.05;
    for (const face of [0, 1, 2, 3]) {
      let prev = null;
      for (let i = 0; i <= 12; i++) {
        const t = Math.PI * (i / 12);
        const u = Math.cos(t) * r, w = y + Math.sin(t) * h;
        const p = face === 0 ? [u, w, r] : face === 1 ? [u, w, -r] : face === 2 ? [r, w, u] : [-r, w, u];
        if (prev) seg(prev, p);
        prev = p;
      }
    }
  }
  // spire
  for (const [x, z] of [[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01]]) seg([x, 0.62, z], [0, CHRYSLER_H, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

function labelSprite(text, color = '#cfe5ff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(mat); s.scale.set(0.32, 0.06, 1); s.renderOrder = 10;
  s.setText = (t, col = color) => {
    ctx.clearRect(0, 0, 512, 96);
    ctx.font = '600 34px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.fillText(t, 256, 48);
    tex.needsUpdate = true;
  };
  s.setText(text);
  return s;
}

/* ---------- a building instance ---------- */
export async function createBuilding({ chrysler = true, opacity = 0.34 } = {}) {
  const D = await loadBuildingData();
  const group = new THREE.Group();

  const uniforms = {
    uCut: { value: 1 }, uLight: { value: 0 }, uNight: { value: 0 },
    uOpacity: { value: opacity }, uTime: { value: 0 }, uFade: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: lineVert, fragmentShader: lineFrag,
    transparent: true, depthWrite: false,
  });
  const lines = new THREE.LineSegments(D.geo, mat);
  lines.frustumCulled = false;
  group.add(lines);

  // weld ring at the cut
  const ringGeo = new THREE.BufferGeometry().setFromPoints(
    [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 0, -1]].map(p => new THREE.Vector3(...p)));
  const ringMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false });
  const ring = new THREE.Line(ringGeo, ringMat);
  group.add(ring);

  // sparks
  const N = 140;
  const sp = new Float32Array(N * 3), sv = new Float32Array(N * 3), life = new Float32Array(N);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffc46b, size: 0.02, sizeAttenuation: true, transparent: true,
    opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);
  for (let i = 0; i < N; i++) { sp[i * 3 + 1] = -10; life[i] = 0; }

  // searchlight beam for the finale
  const beamGeo = new THREE.CylinderGeometry(0.16, 0.004, 1.4, 24, 1, true);
  beamGeo.translate(0, 0.7, 0);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 } },
    vertexShader: 'varying float vT; void main(){ vT = position.y / 1.4; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uA; varying float vT; void main(){ gl_FragColor = vec4(1.0,0.9,0.65, uA * pow(1.0 - vT, 2.4) * 0.38); }',
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 1.0;
  beam.visible = false;
  group.add(beam);

  // Chrysler ghost + the 1,046 ft line
  let ghost = null, label = null, marker = null, passed = false;
  if (chrysler) {
    ghost = new THREE.LineSegments(chryslerGeometry(),
      new THREE.LineDashedMaterial({ color: 0x9fd0ff, dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.55, depthWrite: false }));
    ghost.computeLineDistances();
    ghost.position.set(0.34, 0, -0.02);
    group.add(ghost);
    label = labelSprite('CHRYSLER · 1,046 FT');
    label.position.set(0.34, CHRYSLER_H + 0.05, -0.02);
    group.add(label);
    const mg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, CHRYSLER_H, 0), new THREE.Vector3(0.48, CHRYSLER_H, 0)]);
    marker = new THREE.Line(mg, new THREE.LineDashedMaterial({ color: 0x9fd0ff, dashSize: 0.012, gapSize: 0.01, transparent: true, opacity: 0.4, depthWrite: false }));
    marker.computeLineDistances();
    group.add(marker);
  }

  let target = 1, shown = 1, lightTarget = 0, light = 0, nightTarget = 0, night = 0;
  let onPass = null;

  function emit(n) {
    const b = Math.min(D.B - 1, Math.floor(shown * D.B));
    const hx = D.fx[b], hz = D.fz[b];
    for (let k = 0; k < n; k++) {
      let i = -1;
      for (let j = 0; j < N; j++) if (life[j] <= 0) { i = j; break; }
      if (i < 0) return;
      // random point on the footprint perimeter
      const side = Math.random() * 4 | 0, t = Math.random() * 2 - 1;
      const x = side < 2 ? t * hx : (side === 2 ? hx : -hx);
      const z = side >= 2 ? t * hz : (side === 0 ? hz : -hz);
      sp[i * 3] = x; sp[i * 3 + 1] = shown; sp[i * 3 + 2] = z;
      const out = 0.05 + Math.random() * 0.12;
      sv[i * 3] = Math.sign(x || 1) * out * (side < 2 ? Math.random() : 1);
      sv[i * 3 + 1] = 0.05 + Math.random() * 0.2;
      sv[i * 3 + 2] = Math.sign(z || 1) * out * (side >= 2 ? Math.random() : 1);
      life[i] = 0.5 + Math.random() * 0.7;
    }
  }

  return {
    group,
    get height() { return shown; },
    halfWidth(y) { return D.fx[Math.max(0, Math.min(D.B - 1, Math.floor(y * D.B)))]; },
    setHeight(h, snap = false) { target = Math.max(0, Math.min(1, h)); if (snap) shown = target; },
    setNight(on) { nightTarget = on ? 1 : 0; lightTarget = on ? 1.02 : 0; if (!on) light = Math.min(light, 0); },
    setFade(f) { uniforms.uFade.value = f; group.visible = f > 0.01; },
    setExtras(on) { if (ghost) { ghost.visible = on; label.visible = on; marker.visible = on; } },
    set onPass(fn) { onPass = fn; },
    update(dt, t, realDt = dt) {
      const prev = shown;
      shown += (target - shown) * Math.min(1, dt * 9);
      if (Math.abs(target - shown) < 0.0005) shown = target;
      night += (nightTarget - night) * Math.min(1, Math.min(realDt, 0.25) * 2.5);
      // lights climb floor by floor (~2.6 s to the top)
      if (lightTarget > light) light = Math.min(lightTarget, light + Math.min(realDt, 0.25) * 0.4);
      else light = lightTarget;
      uniforms.uCut.value = shown + 0.0015;
      uniforms.uLight.value = light;
      uniforms.uNight.value = night;
      uniforms.uTime.value = t;

      // draw only segments that start below the cut
      let lo = 0, hi = D.segCount;
      while (lo < hi) { const m = (lo + hi) >> 1; if (D.segMinY[m] <= shown + 0.0015) lo = m + 1; else hi = m; }
      D.geo.setDrawRange(0, lo * 2);

      const building = shown > 0.004 && shown < 0.995;
      ring.visible = building && night < 0.5;
      const b = Math.min(D.B - 1, Math.floor(shown * D.B));
      ring.position.y = shown;
      ring.scale.set(D.fx[b] * 1.05 + 0.004, 1, D.fz[b] * 1.05 + 0.004);

      // sparks: lots while moving, a trickle while paused mid-build
      if (building) emit(Math.abs(shown - prev) > 0.0004 ? 4 : (Math.random() < 0.25 ? 1 : 0));
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        sv[i * 3 + 1] -= 0.6 * dt;
        sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
        if (life[i] <= 0) sp[i * 3 + 1] = -10;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      // finale beam
      beam.visible = night > 0.05 && shown > 0.99;
      beamMat.uniforms.uA.value = night * Math.min(1, Math.max(0, light - 0.95) * 10);
      beam.rotation.z = Math.sin(t * 0.5) * 0.35;
      beam.rotation.x = Math.cos(t * 0.37) * 0.2;

      if (ghost) {
        const nowPassed = shown > CHRYSLER_H + 0.002;
        if (nowPassed !== passed) {
          passed = nowPassed;
          label.setText(passed ? 'PASSED CHRYSLER · 1,046 FT' : 'CHRYSLER · 1,046 FT', passed ? '#ffd27a' : '#cfe5ff');
          if (passed && onPass) onPass();
        }
        ghost.material.opacity = 0.55 * (1 - night * 0.6);
      }
    },
  };
}
