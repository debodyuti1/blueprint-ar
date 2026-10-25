// 3D blueprint: the Empire State model drawn as precomputed edge lines.
// Edges are baked offline (tools/bake-edges) into assets/edges.bin:
// Uint16 xyz pairs, sorted by each segment's lowest point, so "building up
// to height h" is just a draw range found by binary search.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export async function createModelView(container) {
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
    pos[i] = v / H; // building height = 1 unit
  }
  const segCount = q.length / 6;
  // lowest y per segment (already sorted ascending)
  const segMinY = new Float32Array(segCount);
  for (let s = 0; s < segCount; s++) segMinY[s] = Math.min(pos[s * 6 + 1], pos[s * 6 + 4]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xdbe9ff, transparent: true, opacity: 0.32,
    blending: THREE.NormalBlending, depthWrite: false,
  });
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1);
  mat.clippingPlanes = [clip];
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.add(lines);
  scene.add(group);

  // ground: a site-plan grid and the cut line ring
  const grid = new THREE.GridHelper(0.6, 12, 0x8fb4ff, 0x5d87d6);
  grid.material.transparent = true; grid.material.opacity = 0.35;
  scene.add(grid);
  // footprint per 1% of height, so the cut outline hugs the building
  const B = 100, fx = new Float32Array(B).fill(0), fz = new Float32Array(B).fill(0);
  for (let i = 0; i < pos.length; i += 3) {
    const b = Math.min(B - 1, Math.max(0, Math.floor(pos[i + 1] * B)));
    fx[b] = Math.max(fx[b], Math.abs(pos[i])); fz[b] = Math.max(fz[b], Math.abs(pos[i + 2]));
  }
  const cutGeo = new THREE.BufferGeometry().setFromPoints(
    [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 0, -1]].map(p => new THREE.Vector3(...p)));
  const cut = new THREE.Line(cutGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  scene.add(cut);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  camera.position.set(1.32, 0.7, 1.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.53, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.8; controls.maxDistance = 4;
  controls.minPolarAngle = 0.2; controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.8;
  let idleTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => { idleTimer = setTimeout(() => (controls.autoRotate = true), 4000); });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole building in frame on narrow screens
    camera.fov = w / h < 0.6 ? 44 : 34;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  let height = 1, shown = 1;
  function setProgress(p) { height = Math.max(0.002, Math.min(1, p)); }

  let running = false;
  function frame() {
    if (!running) return;
    shown += (height - shown) * 0.18;
    // draw only segments that start below the cut, and clip what pokes above
    let lo = 0, hi = segCount;
    while (lo < hi) { const m = (lo + hi) >> 1; if (segMinY[m] <= shown) lo = m + 1; else hi = m; }
    geo.setDrawRange(0, lo * 2);
    clip.constant = shown + 0.001;
    cut.position.y = shown;
    const b = Math.min(B - 1, Math.floor(shown * B));
    cut.scale.set(fx[b] * 1.06 + 0.004, 1, fz[b] * 1.06 + 0.004);
    cut.visible = shown < 0.995;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  return {
    setProgress,
    start() { if (!running) { running = true; resize(); requestAnimationFrame(frame); } },
    stop() { running = false; },
    renderOnce() { resize(); running = true; frame(); running = false; },
  };
}
