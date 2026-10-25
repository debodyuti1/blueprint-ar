// 2D layer drawn onto the poster plane. assets/outline.json is traced from
// assets/poster.jpg in the poster's own pixel coordinates, so it lines up
// 1:1 with the printed building.
//   reveal: scan beam sweeps the poster, then a thick glowing outline draws in
//   build:  blueprint wash + grid + dashed plan of the building (3D model builds in front)
//   night:  the wash goes to night navy and the plan glows warm
import * as THREE from 'three';

const SCALE = 0.75;

export async function createOverlay() {
  const data = await fetch('assets/outline.json').then(r => r.json());
  const W = data.w, H = data.h;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, H / W), mat);
  mesh.position.z = 0.002;
  mesh.renderOrder = -1;

  let outlineLen = 0;
  for (let i = 1; i < data.outline.length; i++) {
    const [x0, y0] = data.outline[i - 1], [x1, y1] = data.outline[i];
    outlineLen += Math.hypot(x1 - x0, y1 - y0);
  }

  const st = { mode: 'off', t: 0, t0: 0, night: 0, nightTarget: 0, dirty: true, fade: 1 };
  const path = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };

  function details(alpha, width = 2.4) {
    for (const l of data.lines) {
      ctx.globalAlpha = alpha * Math.min(1, l.o * 1.3);
      ctx.lineWidth = l.w * width;
      path(l.d); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function grid(a) {
    for (let x = 0; x <= W; x += 25) {
      ctx.strokeStyle = `rgba(170,205,255,${x % 125 === 0 ? 0.24 * a : 0.09 * a})`;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 25) {
      ctx.strokeStyle = `rgba(170,205,255,${y % 125 === 0 ? 0.24 * a : 0.09 * a})`;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (st.mode === 'off') return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    if (st.mode === 'reveal') {
      const t = st.t;
      // 0–0.35: scan beam sweeps down and leaves the poster dimmed
      const sweep = Math.min(1, t / 0.35);
      const by = sweep * H;
      ctx.fillStyle = 'rgba(4, 22, 64, 0.5)';
      ctx.fillRect(0, 0, W, by);
      if (sweep < 1) {
        const g = ctx.createLinearGradient(0, by - 160, 0, by + 8);
        g.addColorStop(0, 'rgba(90,180,255,0)');
        g.addColorStop(0.85, 'rgba(120,200,255,0.55)');
        g.addColorStop(1, 'rgba(230,248,255,1)');
        ctx.fillStyle = g; ctx.fillRect(0, by - 160, W, 168);
      }
      grid(Math.min(1, sweep * 1.2) * 0.8);
      // 0.3–0.75: thick outline draws itself
      const draw = Math.max(0, Math.min(1, (t - 0.3) / 0.45));
      if (draw > 0) {
        ctx.strokeStyle = '#d8f0ff';
        ctx.shadowColor = 'rgba(70,170,255,1)';
        for (const [w, blur] of [[14, 30], [6, 12]]) {
          ctx.lineWidth = w; ctx.shadowBlur = blur;
          ctx.globalAlpha = w > 10 ? 0.35 : 1;
          ctx.setLineDash([outlineLen, outlineLen]);
          ctx.lineDashOffset = outlineLen * (1 - draw);
          path(data.outline); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        // 0.65–1: detail lines fade in
        const d = Math.max(0, (t - 0.65) / 0.35);
        if (d > 0) { ctx.shadowBlur = 8; details(d * st.fade, 2.6); }
        ctx.shadowBlur = 0;
      }
      return;
    }

    // build / night
    const n = st.night;
    ctx.fillStyle = `rgba(${Math.round(8 - 4 * n)}, ${Math.round(52 - 34 * n)}, ${Math.round(140 - 90 * n)}, ${0.74 + 0.16 * n})`;
    ctx.fillRect(0, 0, W, H);
    grid(1 - n * 0.6);
    const warm = n > 0.01;
    ctx.strokeStyle = warm ? `rgba(255, ${Math.round(220 - 20 * n)}, ${Math.round(255 - 140 * n)}, 1)` : '#d4e6ff';
    ctx.shadowColor = warm ? 'rgba(255,190,90,0.9)' : 'rgba(100,180,255,0.7)';
    ctx.shadowBlur = 6 + 10 * n;
    ctx.setLineDash(n > 0.5 ? [] : [10, 8]);
    ctx.globalAlpha = 0.45 + 0.4 * n;
    ctx.lineWidth = 4;
    path(data.outline); ctx.stroke();
    ctx.setLineDash([]);
    details(0.3 + 0.4 * n, 2);
    ctx.shadowBlur = 0;
  }

  return {
    mesh,
    setMode(m) {
      if (m === 'revealed') {          // jump to the end of the reveal, no replay
        if (st.mode === 'reveal') return;
        st.mode = 'reveal'; st.t = 1; st.fade = 0.25; st.dirty = true; return;
      }
      if (m === st.mode) return;
      st.mode = m;
      if (m === 'reveal') { st.t = 0; st.t0 = performance.now(); st.fade = 1; }
      st.dirty = true;
    },
    get mode() { return st.mode; },
    get revealDone() { return st.mode === 'reveal' && st.t >= 1; },
    setNight(on) { st.nightTarget = on ? 1 : 0; },
    setDetailFade(f) { if (Math.abs(st.fade - f) > 0.01) { st.fade = f; st.dirty = true; } },
    tick(now = performance.now()) {
      let changed = st.dirty;
      if (st.mode === 'reveal' && st.t < 1) { st.t = Math.min(1, (now - st.t0) / 2000); changed = true; }
      if (Math.abs(st.nightTarget - st.night) > 0.005) {
        st.night += (st.nightTarget - st.night) * 0.08; changed = true;
      } else if (st.night !== st.nightTarget) { st.night = st.nightTarget; changed = true; }
      if (changed) { draw(); tex.needsUpdate = true; st.dirty = false; }
    },
  };
}
