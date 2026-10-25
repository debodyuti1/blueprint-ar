// 2D blueprint drawn onto the poster. assets/outline.json is traced from
// assets/poster.jpg in the poster's own pixel coordinates, so a plane the
// size of the poster lines the drawing up 1:1 with the printed building.
import * as THREE from 'three';

const SCALE = 0.8; // canvas resolution relative to the poster image

// building height (0–1 of 1,454 ft) -> poster y. The photo is a telephoto
// shot (near-orthographic): the 86th-floor roof sits at y≈505 and the spire
// tip at y≈18. The bottom of the poster is mapped to the first steel.
function cutY(h) {
  if (h <= 0.03) return 1700;
  if (h <= 0.722) return 1600 - ((h - 0.03) / (0.722 - 0.03)) * (1600 - 505);
  return 505 - ((h - 0.722) / (1 - 0.722)) * (505 - 18);
}

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

  const geo = new THREE.PlaneGeometry(1, H / W);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = 0.002;

  // outline length, for the pen-draw intro
  let outlineLen = 0;
  for (let i = 1; i < data.outline.length; i++) {
    const [x0, y0] = data.outline[i - 1], [x1, y1] = data.outline[i];
    outlineLen += Math.hypot(x1 - x0, y1 - y0);
  }

  const state = { mode: 'off', trace: 0, traceStart: 0, h: 1, shownH: 1, pulse: 0, dirty: true };

  const path = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };

  function drawLines(alpha, dashed) {
    ctx.setLineDash(dashed ? [6, 6] : []);
    for (const l of data.lines) {
      ctx.globalAlpha = alpha * l.o;
      ctx.lineWidth = l.w * 1.6;
      path(l.d); ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3.2;
    path(data.outline); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.mode === 'off') return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    if (state.mode === 'trace') {
      // pen-draw the silhouette, then fade in the detail lines
      const t = state.trace;
      ctx.strokeStyle = '#bfe3ff';
      ctx.shadowColor = 'rgba(80,170,255,0.9)'; ctx.shadowBlur = 12;
      ctx.lineWidth = 3.4;
      ctx.setLineDash([outlineLen, outlineLen]);
      ctx.lineDashOffset = outlineLen * (1 - Math.min(1, t / 0.75));
      path(data.outline); ctx.stroke();
      ctx.setLineDash([]);
      const detail = Math.max(0, (t - 0.6) / 0.4);
      if (detail > 0) {
        for (const l of data.lines) {
          ctx.globalAlpha = detail * l.o; ctx.lineWidth = l.w * 1.6;
          path(l.d); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
      return;
    }

    // build mode: blueprint wash + grid over the whole poster
    ctx.fillStyle = 'rgba(8, 52, 140, 0.72)';
    ctx.fillRect(0, 0, W, H);
    for (let x = 0; x <= W; x += 25) {
      ctx.strokeStyle = x % 125 === 0 ? 'rgba(170,205,255,0.22)' : 'rgba(170,205,255,0.08)';
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 25) {
      ctx.strokeStyle = y % 125 === 0 ? 'rgba(170,205,255,0.22)' : 'rgba(170,205,255,0.08)';
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // planned (not yet built): faint dashed ghost
    ctx.strokeStyle = '#cfe2ff';
    drawLines(0.34, true);

    // built: solid white below the cut
    const cy = cutY(state.shownH);
    if (cy < H) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, cy, W, H - cy); ctx.clip();
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = 'rgba(120,190,255,0.85)';
      ctx.shadowBlur = 6 + 18 * state.pulse;
      drawLines(1, false);
      ctx.restore();
      // the construction line
      if (state.shownH < 0.995) {
        ctx.strokeStyle = '#7fd1ff'; ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(127,209,255,1)'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(300, cy); ctx.lineTo(700, cy); ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }

  return {
    mesh,
    setMode(m) {
      if (m === state.mode) return;
      state.mode = m;
      if (m === 'trace') { state.trace = 0; state.traceStart = performance.now(); }
      state.dirty = true;
    },
    setHeight(h) {
      if (h >= 1 && state.h < 1) state.pulseStart = performance.now();
      state.h = h; state.dirty = true;
    },
    snapHeight() { state.shownH = state.h; state.dirty = true; },
    get traceDone() { return state.trace >= 1; },
    // call every frame; redraws the canvas only when something changed
    tick(now = performance.now()) {
      let changed = state.dirty;
      if (state.mode === 'trace' && state.trace < 1) {
        state.trace = Math.min(1, (now - state.traceStart) / 1600);
        changed = true;
      }
      if (state.mode === 'build') {
        if (Math.abs(state.h - state.shownH) > 0.0005) {
          state.shownH += (state.h - state.shownH) * 0.2; changed = true;
        }
        if (state.pulseStart) {
          const t = (now - state.pulseStart) / 1200;
          state.pulse = t < 1 ? Math.sin(t * Math.PI) : 0;
          if (t >= 1) state.pulseStart = 0;
          changed = true;
        }
      }
      if (changed) { draw(); tex.needsUpdate = true; state.dirty = false; }
    },
    // for the no-camera preview
    canvas,
  };
}
