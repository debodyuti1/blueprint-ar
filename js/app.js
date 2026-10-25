import { MindARThree } from '../vendor/mindar/mindar-image-three.prod.js';
import { createOverlay } from './overlay.js';
import { createModelView } from './model3d.js';
import { STAGES, heightAt, stageAt } from './stages.js';

const $ = s => document.querySelector(s);
const body = document.body;

let mindar = null, overlay = null, modelView = null, arRunning = false, targetVisible = false;
let state = 'intro';
let arUsed = false; // did we come through the camera, or straight to the model?

function setState(next) {
  state = next;
  body.dataset.state = next;
  if (overlay) {
    const found = body.classList.contains('found');
    overlay.setMode(next === 'build' ? 'build'
      : (next === 'scan' || next === 'details') && found ? 'trace' : 'off');
  }
  $('#viewToggle span').textContent = next === 'model' ? (arUsed ? 'On poster' : 'Use camera') : '3D model';
  updateLostHint();
  if (next === 'model') { pauseAR(); ensureModel().then(m => m.start()); }
  else { modelView?.stop(); if (arUsed && next !== 'intro') resumeAR(); }
}

/* ---------------- AR ---------------- */
async function startAR() {
  $('#loading').hidden = false;
  try {
    mindar = new MindARThree({
      container: $('#ar'),
      imageTargetSrc: 'assets/targets.mind',
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      filterMinCF: 0.0005, filterBeta: 0.004, // a touch smoother than default
      missTolerance: 8,
    });
    const { renderer, scene, camera } = mindar;
    overlay = await createOverlay();
    const anchor = mindar.addAnchor(0);
    anchor.group.add(overlay.mesh);
    anchor.onTargetFound = () => {
      targetVisible = true;
      if (!body.classList.contains('found')) {
        body.classList.add('found');
        overlay.setMode('trace');
        navigator.vibrate?.(30);
      }
      updateLostHint();
    };
    anchor.onTargetLost = () => { targetVisible = false; updateLostHint(); };
    await withTimeout(mindar.start(), 25000);
    renderer.setAnimationLoop(() => { overlay.tick(); renderer.render(scene, camera); });
    arRunning = true; arUsed = true;
    overlay.setMode('off');
    setState('scan');
  } catch (err) {
    console.error(err);
    showCamError();
    setState('intro');
  } finally {
    $('#loading').hidden = true;
  }
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('camera timeout')), ms))]);
}

function pauseAR() {
  if (!arRunning || !mindar) return;
  mindar.controller.stopProcessVideo();
  mindar.renderer.setAnimationLoop(null);
  arRunning = false;
}
function resumeAR() {
  if (arRunning || !mindar?.controller) return;
  mindar.controller.processVideo(mindar.video);
  mindar.renderer.setAnimationLoop(() => { overlay.tick(); mindar.renderer.render(mindar.scene, mindar.camera); });
  arRunning = true;
}

function showCamError() {
  const e = $('#camError');
  e.hidden = false;
  e.textContent = window.isSecureContext
    ? 'Camera unavailable. Allow camera access for this site in your browser settings and reload, or explore the 3D blueprint instead.'
    : 'The camera needs a secure (https) link. Open the Vercel URL, or explore the 3D blueprint instead.';
}

function updateLostHint() {
  $('#lostHint').hidden = !(state === 'build' && arUsed && !targetVisible);
}

/* ---------------- 3D model ---------------- */
let modelPromise = null;
function ensureModel() {
  if (!modelPromise) {
    modelPromise = createModelView($('#modelStage')).then(m => { modelView = m; m.setProgress(heightAt(slider.value / 1000)); return m; });
  }
  return modelPromise;
}

/* ---------------- slider + captions ---------------- */
const slider = $('#slider');
const ticks = $('#ticks');
STAGES.forEach(s => { const i = document.createElement('i'); i.style.left = `${s.at * 100}%`; ticks.appendChild(i); });

let shownStage = -1;
function onSlide() {
  const s = slider.value / 1000;
  const h = heightAt(s);
  overlay?.setHeight(h);
  modelView?.setProgress(h);
  const idx = stageAt(s);
  if (idx !== shownStage) {
    const st = STAGES[idx];
    $('#capDate').textContent = st.date;
    $('#capTitle').textContent = st.title;
    $('#capLine').textContent = st.line;
    $('#capBig').hidden = !st.big; $('#capBig').textContent = st.big || '';
    $('#capNote').hidden = !st.note; $('#capNote').textContent = st.note || '';
    const cap = $('.caption');
    cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
    if (shownStage !== -1) navigator.vibrate?.(12);
    shownStage = idx;
  }
}
slider.addEventListener('input', onSlide);
onSlide();

/* ---------------- navigation ---------------- */
$('#startBtn').addEventListener('click', startAR);
$('#skipBtn').addEventListener('click', () => { arUsed = false; slider.value = 1000; onSlide(); setState('model'); });
$('#detailsBtn').addEventListener('click', () => setState('details'));
$('#timelineBtn').addEventListener('click', () => {
  slider.value = 0; onSlide(); overlay?.snapHeight();
  setState('build');
});
$('#viewToggle').addEventListener('click', () => {
  if (state === 'model') {
    if (arUsed) setState('build'); else startAR();
  } else setState('model');
});
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => {
  if (state === 'details') setState('scan');
  else if (state === 'build') setState('details');
  else if (state === 'model') setState(arUsed ? 'build' : 'intro');
}));

// debug/test hook
window.__app = { get state() { return state; }, setState, slider, onSlide, get overlay() { return overlay; } };
