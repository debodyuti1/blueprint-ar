import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-image-three.prod.js';
import { createOverlay } from './overlay.js';
import { createBuilding, loadBuildingData } from './building.js';
import { createModelView } from './model3d.js';
import { STAGES, heightAt, dateAt, dayAt, floorAt, stageAt } from './stages.js';
import * as sfx from './audio.js';

const $ = s => document.querySelector(s);
const body = document.body;

let state = 'intro';
let mindar = null, overlay = null, arBuilding = null, rig = null, arRunning = false;
let targetVisible = false, arUsed = false, modelView = null, modelPromise = null;
let night = false;
let progress = 0;           // knob position 0–1
let holdLight = false;      // play mode keeps the light button hidden until the last line ends

/* ================= state ================= */
function setState(next) {
  state = next;
  body.dataset.state = next;
  if (overlay && body.classList.contains('found')) overlay.setMode(next === 'build' ? 'build' : 'revealed');
  $('#viewToggle span').textContent = next === 'model' ? 'Live camera' : 'View in 3D';
  $('#viewToggle').setAttribute('aria-label', next === 'model' ? 'Back to the live camera' : 'View the building in 3D');
  updateLostHint();
  if (next === 'model') { pauseAR(); ensureModel().then(m => { if (state === 'model') m.start(); }); }
  else { modelView?.stop(); if (arUsed && next !== 'intro') resumeAR(); }
  if (next !== 'build' && next !== 'model') stopPlay();
  syncAudio();
}

/* ================= AR ================= */
// The 3D model sits exactly on the photo's building. Poster units: 1 = poster
// width, origin = poster centre. The photo is a telephoto shot at 1.205 px per
// ft; the spire tip is at y=18 px and street level 1,752 px below it.
const POSTER_W = 1007, POSTER_H = 1600;
const ALIGN = { y: (POSTER_H / 2 - (18 + 1752)) / POSTER_W, s: 1752 / POSTER_W };
let revealAt = 0;

async function startAR() {
  sfx.unlock(); sfx.preloadNarration(); sfx.preloadFinale(); sfx.preloadPaper();
  $('#loading').hidden = false;
  try {
    mindar = new MindARThree({
      container: $('#ar'),
      imageTargetSrc: 'assets/targets.mind',
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      // low jitter when still (minCF), quick catch-up when moving (beta)
      filterMinCF: 0.0001, filterBeta: 10,
      warmupTolerance: 3, missTolerance: 6,
    });
    const [ov, b] = await Promise.all([createOverlay(), createBuilding({ opacity: 0.3 })]);
    overlay = ov; arBuilding = b;
    arBuilding.setFade(0);
    rig = new THREE.Group();
    rig.position.set(0, ALIGN.y, 0);
    rig.scale.setScalar(ALIGN.s);
    rig.add(arBuilding.group);
    const anchor = mindar.addAnchor(0);
    anchor.group.add(overlay.mesh, rig);
    anchor.onTargetFound = () => {
      targetVisible = true;
      if (!body.classList.contains('found')) {
        body.classList.add('found', 'revealing');
        setTimeout(() => body.classList.remove('revealing'), 1300);
        overlay.setMode('reveal');
        revealAt = performance.now();
        arBuilding.setHeight(0, true);   // the building starts as an empty site
        sfx.scanWhoosh();
        navigator.vibrate?.(30);
        // scanning animation plays, then we land on the build and the story starts by itself
        setTimeout(() => { if (state === 'scan') enterBuild(true); }, 2400);
      }
      updateLostHint();
    };
    anchor.onTargetLost = () => { targetVisible = false; updateLostHint(); };
    await withTimeout(mindar.start(), 25000);
    arUsed = true;
    resumeAR();
    setState('scan');
  } catch (err) {
    console.error(err);
    showCamError();
    setState('intro');
  } finally {
    $('#loading').hidden = true;
  }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('camera timeout')), ms))]);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const arClock = new THREE.Clock();
function arFrame() {
  const raw = arClock.getDelta(), dt = Math.min(raw, 0.05), t = arClock.elapsedTime;
  overlay.tick();
  if (revealAt) {
    // after the outline draws, the 3D model fades in right on top of it
    const since = (performance.now() - revealAt) / 1000;
    const f = Math.min(1, Math.max(0, (since - 1.4) / 0.8));
    arBuilding.setFade(f);
    overlay.setDetailFade(1 - f * 0.6);
  }
  arBuilding.update(dt, t, raw);
  mindar.renderer.render(mindar.scene, mindar.camera);
}

function pauseAR() {
  if (!arRunning || !mindar) return;
  mindar.controller.stopProcessVideo();
  mindar.renderer.setAnimationLoop(null);
  arRunning = false;
}
function resumeAR() {
  if (arRunning || !mindar?.controller) return;
  if (mindar.video) mindar.controller.processVideo(mindar.video);
  arClock.getDelta();
  mindar.renderer.setAnimationLoop(arFrame);
  arRunning = true;
}

function showCamError() {
  const e = $('#camError');
  e.hidden = false;
  $('#skipBtn').hidden = false;
  e.textContent = window.isSecureContext
    ? 'Camera unavailable. Allow camera access for this site in your browser settings and reload, or explore the 3D blueprint instead.'
    : 'The camera needs a secure (https) link. Open the Vercel URL, or explore the 3D blueprint instead.';
}
function updateLostHint() { $('#lostHint').hidden = !(state === 'build' && arUsed && !targetVisible); }

/* ================= 3D model view ================= */
function ensureModel() {
  if (!modelPromise) {
    modelPromise = createModelView($('#modelStage')).then(m => {
      modelView = m;
      m.building.setHeight(heightAt(progress), true);
      m.building.setNight(night);
      return m;
    });
  }
  return modelPromise;
}
loadBuildingData(); // start fetching the model early

/* ================= odometer ================= */
function makeDigits(el, n) {
  el.innerHTML = '';
  const cols = [];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('span'); d.className = 'digit';
    const strip = document.createElement('span');
    for (let k = 0; k <= 9; k++) { const b = document.createElement('b'); b.textContent = k; strip.appendChild(b); }
    d.appendChild(strip); el.appendChild(d); cols.push(d);
  }
  return v => {
    const s = String(Math.max(0, Math.round(v))).padStart(n, '0');
    cols.forEach((c, i) => {
      c.firstChild.style.transform = `translateY(${-Number(s[i]) * 1.2}em)`;
      c.style.opacity = i < n - 1 && s.slice(0, i + 1).split('').every(ch => ch === '0') ? 0.25 : 1;
    });
  };
}
const setFloor = makeDigits($('#odoFloor'), 3);
const setDay = makeDigits($('#odoDay'), 3);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

/* ================= progress (knob, dots, play) ================= */
const dots = STAGES.map(st => {
  const b = document.createElement('button');
  b.style.left = `${st.at * 100}%`;
  b.setAttribute('aria-label', `${st.date}: ${st.title}`);
  b.addEventListener('click', () => { sfx.unlock(); stopPlay(); animateTo(st.at, 700); });
  $('#dots').appendChild(b);
  return b;
});

let shownStage = -1, lastTickIdx = 0;
function setProgress(p, { fromUser = false } = {}) {
  progress = Math.max(0, Math.min(1, p));
  const h = heightAt(progress);
  arBuilding?.setHeight(h);
  modelView?.building.setHeight(h);

  // the knob turns 2.5 times across the whole build; a click every 10°
  const deg = progress * 900;
  $('#knobFace').style.transform = `rotate(${deg}deg)`;
  $('#knob').setAttribute('aria-valuenow', Math.round(progress * 100));
  const tickIdx = Math.floor(deg / 10);
  if (tickIdx !== lastTickIdx) { sfx.tick(); if (fromUser) navigator.vibrate?.(4); lastTickIdx = tickIdx; }

  $('#fill').style.width = `${progress * 100}%`;
  dots.forEach((d, i) => d.classList.toggle('done', progress + 0.012 >= STAGES[i].at));
  setFloor(floorAt(h));
  setDay(dayAt(progress));
  $('#odoDate').textContent = fmtDate(dateAt(progress));

  if (night && progress < 0.995) setNight(false);
  const idx = stageAt(progress);
  if (idx !== shownStage) {
    if (shownStage !== -1) navigator.vibrate?.(14);
    shownStage = idx;
    syncAudio();
  }
  refreshLightBtn();
  if (state === 'build' || state === 'model') sfx.setScene({ h });
}

function refreshLightBtn() { $('#lightBtn').hidden = !(progress >= 0.995 && !night && !holdLight); }

let anim = null;
function animateTo(target, ms, onDone) {
  cancelAnimationFrame(anim?.raf);
  const from = progress, t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / ms);
    setProgress(from + (target - from) * (ms > 2000 ? t : ease(t)));
    if (t < 1) anim.raf = requestAnimationFrame(step); else { anim = null; onDone?.(); }
  };
  anim = { raf: requestAnimationFrame(step) };
}
// Play = guided story: narrate a stage, then grow the building to the next
// stage and narrate that, until opening day.
let playToken = 0;
function stopPlay() {
  playToken++;
  if (anim) cancelAnimationFrame(anim.raf); anim = null;
  sfx.stopVoice();
  body.classList.remove('playing');
  $('#sliderLabel').textContent = 'Turn the knob to build';
  if (holdLight) { holdLight = false; refreshLightBtn(); }
}
const animateAsync = (to, ms) => new Promise(r => animateTo(to, ms, r));
async function playStory() {
  const token = ++playToken;
  body.classList.add('playing');
  holdLight = true; refreshLightBtn();
  $('#sliderLabel').textContent = 'Playing the story';
  const live = () => token === playToken;
  if (night) setNight(false);
  if (progress >= 0.995) { await animateAsync(0, 900); if (!live()) return; }
  // start at the nearest stage at or ahead of the knob
  let i = STAGES.findIndex(st => st.at >= progress - 0.01);
  if (i < 0) i = STAGES.length - 1;
  if (Math.abs(STAGES[i].at - progress) > 0.005) { await animateAsync(STAGES[i].at, 1400); if (!live()) return; }
  for (; i < STAGES.length; i++) {
    await sfx.speak(i);
    if (!live()) return;
    if (i + 1 < STAGES.length) {
      await new Promise(r => setTimeout(r, 350));
      if (!live()) return;
      await animateAsync(STAGES[i + 1].at, 2600);
      if (!live()) return;
    }
  }
  body.classList.remove('playing');
  $('#sliderLabel').textContent = 'Turn the knob to build';
  holdLight = false; refreshLightBtn();   // "Now it's your turn" has finished
}
$('#playBtn').addEventListener('click', () => {
  sfx.unlock(); sfx.preloadNarration(); sfx.preloadFinale(); sfx.preloadPaper();
  if (body.classList.contains('playing')) return stopPlay();
  playStory();
});

// knob: drag around its centre (or wheel / arrow keys)
const knob = $('#knob');
let drag = null;
knob.addEventListener('pointerdown', e => {
  sfx.unlock(); stopPlay();
  body.classList.remove('coach'); body.dataset.coached = '1';
  const r = knob.getBoundingClientRect();
  drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, y: e.clientY };
  drag.a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
  knob.setPointerCapture(e.pointerId); knob.classList.add('grabbing');
});
knob.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
  let delta;
  if (Math.hypot(dx, dy) < 14) delta = (drag.y - e.clientY) * 0.02; // near the centre: vertical drag
  else {
    const a = Math.atan2(dy, dx);
    delta = a - drag.a;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    drag.a = a;
  }
  drag.y = e.clientY;
  setProgress(progress + (delta / (2 * Math.PI)) * 0.4, { fromUser: true });
});
const endDrag = () => { drag = null; knob.classList.remove('grabbing'); };
knob.addEventListener('pointerup', endDrag);
knob.addEventListener('pointercancel', endDrag);
knob.addEventListener('wheel', e => { e.preventDefault(); stopPlay(); setProgress(progress - e.deltaY * 0.0006, { fromUser: true }); }, { passive: false });
knob.addEventListener('keydown', e => {
  const k = { ArrowRight: 0.02, ArrowUp: 0.02, ArrowLeft: -0.02, ArrowDown: -0.02 }[e.key];
  if (k) { e.preventDefault(); stopPlay(); setProgress(progress + k); }
});

/* ================= finale ================= */
function setNight(on, instant = false) {
  if (night === on) return;
  night = on;
  body.classList.toggle('night', on);
  overlay?.setNight(on, instant);
  arBuilding?.setNight(on, instant);
  modelView?.building.setNight(on, instant);
  if (on) {
    sfx.lightSwitch();
    setTimeout(() => { if (night) sfx.startJazz(); }, instant ? 150 : 900);
    $('#lightBtn').hidden = true;
    navigator.vibrate?.([20, 60, 40]);
  } else {
    sfx.stopJazz();
  }
  syncAudio();
}
// newspapers fly in, cover the building, the lights switch on behind them, and they fly away
let lighting = false;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function lightSequence() {
  if (lighting) return;
  lighting = true;
  const news = $('#news');
  $('#lightBtn').hidden = true;
  news.classList.remove('out', 'reset', 'fade');
  void news.offsetWidth;
  news.classList.add('in');
  sfx.paperSlide();
  await wait(1150);                       // papers land and hold
  news.classList.replace('in', 'out');
  sfx.paperSlide(1.08);
  await wait(900);                        // papers gone: now light it up, floor by floor, in view
  news.classList.add('reset'); news.classList.remove('out');
  setNight(true);
  lighting = false;
}
$('#lightBtn').addEventListener('click', () => { sfx.unlock(); lightSequence(); });

/* ================= audio + mute ================= */
function syncAudio() {
  sfx.setScene({ active: state === 'build' || state === 'model', stage: shownStage, h: heightAt(progress), night });
}
$('#muteBtn').addEventListener('click', () => {
  const m = !sfx.isMuted(); sfx.setMuted(m); body.classList.toggle('muted', m);
  if (!m) sfx.unlock();
});

/* ================= layout: keep the 3D view above the panel ================= */
new ResizeObserver(([e]) => {
  document.documentElement.style.setProperty('--panel-h', `${Math.round(e.target.getBoundingClientRect().height) - 24}px`);
}).observe($('.build-panel'));

/* ================= navigation ================= */
function enterBuild(autoplay) {
  setNight(false);
  setProgress(0);
  arBuilding?.setHeight(0, true);
  if (performance.now() - revealAt < 2200) revealAt = performance.now() - 5000; // finish the reveal
  setState('build');
  if (autoplay) playStory();       // the story is the main experience; the knob takes over when touched
}
$('#startBtn').addEventListener('click', () => {
  if (mindar) { sfx.unlock(); setState(body.classList.contains('found') ? 'build' : 'scan'); return; }
  startAR();
});
$('#skipBtn').addEventListener('click', () => { sfx.unlock(); sfx.preloadNarration(); sfx.preloadFinale(); sfx.preloadPaper(); arUsed = false; setProgress(0); setState('model'); });
$('#viewToggle').addEventListener('click', () => {
  if (state === 'model') { if (arUsed) setState('build'); else startAR(); }
  else setState('model');
});
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => {
  if (state === 'scan') setState('intro');
  else if (state === 'build') { setNight(false); setState('intro'); }
  else if (state === 'model') setState(arUsed ? 'build' : 'intro');
}));

setProgress(0);

/* ================= intro loader: papers fly in, fade, then the title appears ================= */
async function introLoader() {
  const news = $('#news');
  await Promise.all([...news.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
  news.classList.remove('reset');
  void news.offsetWidth;
  news.classList.add('in');
  sfx.paperSlide();
  await wait(1300);
  news.classList.add('fade');            // papers dissolve into the faint background clippings
  body.classList.remove('intro-loading');
  await wait(800);
  news.classList.add('reset'); news.classList.remove('in', 'fade');
}
// browsers only allow sound after a tap, so the loader starts on "tap to begin"
const gate = $('#gate');
gate.addEventListener('click', () => {
  sfx.unlock(); sfx.preloadPaper(); sfx.preloadNarration(); sfx.preloadFinale();
  gate.classList.add('gone');
  setTimeout(() => gate.remove(), 600);
  introLoader();
}, { once: true });

// test hook
window.__app = { level: () => sfx.level(), get state() { return state; }, setState, setProgress, get progress() { return progress; }, setNight };
