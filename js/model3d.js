// Full-screen 3D blueprint view: the shared building on a site grid,
// orbitable, auto-rotating when idle.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBuilding } from './building.js';

export async function createModelView(container, { onFrame } = {}) {
  const building = await createBuilding();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(building.group);

  const grid = new THREE.GridHelper(0.6, 12, 0x8fb4ff, 0x5d87d6);
  grid.material.transparent = true; grid.material.opacity = 0.3;
  scene.add(grid);

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
    camera.fov = w / h < 0.6 ? 44 : w / h < 0.9 ? 38 : 32;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  const clock = new THREE.Clock();
  let running = false;
  function frame() {
    if (!running) return;
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
    building.update(dt, clock.elapsedTime, raw);
    controls.update();
    renderer.render(scene, camera);
    onFrame?.(camera, building);
    requestAnimationFrame(frame);
  }
  return {
    building, camera, renderer,
    start() { if (!running) { running = true; resize(); clock.getDelta(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
}
