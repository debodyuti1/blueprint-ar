// All sound is synthesized with the Web Audio API (no audio files).
// Ambience follows the build stage; UI sounds give the knob a physical feel;
// the finale plays a short swing loop through an "old record" filter.

let ctx = null, master = null, sfxBus = null, ambBus = null, musicBus = null;
let muted = false, scene = { stage: 0, h: 0, night: false, active: false };
let whiteBuf, brownBuf, schedTimer = null, analyser = null;
let ducking = false, voiceBus = null;
const layers = {};

function noiseBuffer(type) {
  const len = ctx.sampleRate * 3, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}
function loopNoise(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
const now = () => ctx.currentTime;
function ramp(param, v, t = 0.6) { param.cancelScheduledValues(now()); param.setTargetAtTime(v, now(), t / 3); }

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; comp.connect(analyser);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    voiceBus = ctx.createGain(); voiceBus.gain.value = 1.15; voiceBus.connect(master);
    whiteBuf = noiseBuffer('white'); brownBuf = noiseBuffer('brown');

    // city rumble
    const city = loopNoise(brownBuf), cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 380;
    layers.city = ctx.createGain(); layers.city.gain.value = 0;
    city.connect(cf).connect(layers.city).connect(ambBus);
    // wind (louder the higher the building), slow sweeping band
    const wind = loopNoise(whiteBuf), wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 1.2; wf.frequency.value = 500;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.09; lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(wf.frequency); lfo.start();
    layers.wind = ctx.createGain(); layers.wind.gain.value = 0;
    wind.connect(wf).connect(layers.wind).connect(ambBus);

    schedTimer = setInterval(scheduler, 120);
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      document.hidden ? ctx.suspend() : ctx.resume();
    });
  }
  if (ctx.state !== 'running') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) ramp(master.gain, m ? 0 : 0.9, 0.2);
}
export const isMuted = () => muted;

// what the app is showing: drives the ambience
export function setScene(s) {
  scene = { ...scene, ...s };
  if (!ctx) return;
  ramp(ambBus.gain, scene.active ? (ducking ? 0.22 : 1) : 0, ducking ? 0.4 : 1.2);
  const n = scene.night;
  ramp(layers.city.gain, (n ? 0.1 : 0.32) * (scene.stage >= 5 && !n ? 0.8 : 1));
  ramp(layers.wind.gain, Math.max(0, (scene.h - 0.35) * 0.55) * (n ? 0.4 : 1), 1);
}

/* ---------- one-shot building blocks ---------- */
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function noiseHit({ t = now(), freq = 2000, q = 3, type = 'bandpass', peak = 0.4, d = 0.05, pan = 0, bus = sfxBus }) {
  const s = ctx.createBufferSource(); s.buffer = whiteBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  s.connect(f).connect(g); if (p) { p.pan.value = pan; g.connect(p).connect(bus); } else g.connect(bus);
  env(g, t, 0.002, peak, d);
  s.start(t, Math.random() * 2); s.stop(t + d + 0.05);
}
// inharmonic partials = struck steel
function metal({ t = now(), base = 220, peak = 0.25, d = 1.2, pan = 0, bus = sfxBus, partials = [1, 2.76, 5.4, 8.93] }) {
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const out = ctx.createGain(); out.gain.value = 1;
  if (p) { p.pan.value = pan; out.connect(p).connect(bus); } else out.connect(bus);
  partials.forEach((m, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m * (1 + (Math.random() - 0.5) * 0.01);
    const g = ctx.createGain(); o.connect(g).connect(out);
    env(g, t, 0.003, peak / (i + 1), d / (1 + i * 0.6));
    o.start(t); o.stop(t + d + 0.1);
  });
  noiseHit({ t, freq: base * 12, q: 1, peak: peak * 0.6, d: 0.03, pan, bus });
}

/* ---------- ambience events, picked by stage ---------- */
let nextEvt = 0;
function scheduler() {
  if (!ctx || muted || ducking || !scene.active || scene.night || ctx.state !== 'running') return;
  if (now() < nextEvt) return;
  const st = scene.stage, pan = Math.random() * 1.6 - 0.8;
  if (st === 0) {
    // demolition: heavy thuds and rubble
    noiseHit({ freq: 120, q: 0.7, type: 'lowpass', peak: 0.7, d: 0.5, pan, bus: ambBus });
    for (let i = 0; i < 6; i++) noiseHit({ t: now() + 0.1 + Math.random() * 0.6, freq: 900 + Math.random() * 1500, q: 2, peak: 0.08, d: 0.06, pan, bus: ambBus });
    nextEvt = now() + 1.2 + Math.random() * 1.6;
  } else if (st <= 3) {
    // rivet gun bursts, plus a steel clang now and then
    const n = 10 + (Math.random() * 14 | 0), rate = 0.035 + Math.random() * 0.012;
    for (let i = 0; i < n; i++) noiseHit({ t: now() + i * rate, freq: 2600 + Math.random() * 600, q: 6, peak: 0.13, d: 0.025, pan, bus: ambBus });
    if (Math.random() < 0.45) metal({ t: now() + n * rate + 0.3, base: 140 + Math.random() * 120, peak: 0.07, d: 1.6, pan: -pan, bus: ambBus });
    nextEvt = now() + 1.4 + Math.random() * 2.2;
  } else if (st === 4) {
    // up top: sparse clangs carried on the wind
    metal({ base: 300 + Math.random() * 200, peak: 0.05, d: 2.2, pan, bus: ambBus });
    nextEvt = now() + 2.5 + Math.random() * 3;
  } else {
    // opening day: a distant crowd murmur swell
    noiseHit({ freq: 700, q: 0.6, peak: 0.05, d: 1.6, pan, bus: ambBus });
    nextEvt = now() + 3 + Math.random() * 3;
  }
}

/* ---------- UI sounds ---------- */
export function tick() {
  if (!ctx || muted) return;
  noiseHit({ freq: 4200, q: 8, peak: 0.12, d: 0.012 });
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 1900;
  o.connect(g).connect(sfxBus); env(g, now(), 0.001, 0.04, 0.015); o.start(); o.stop(now() + 0.03);
}
export function clank() { if (ctx && !muted) metal({ base: 196, peak: 0.28, d: 1.4 }); }
export function scanWhoosh() {
  if (!ctx || muted) return;
  const s = ctx.createBufferSource(); s.buffer = whiteBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
  const g = ctx.createGain(); s.connect(f).connect(g).connect(sfxBus);
  const t = now();
  f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.7);
  env(g, t, 0.05, 0.35, 0.7); s.start(t); s.stop(t + 0.9);
  // shimmer as the outline draws
  [523.25, 659.25, 783.99, 1046.5].forEach((fr, i) => {
    const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = 'triangle'; o.frequency.value = fr;
    o.connect(gg).connect(sfxBus); env(gg, t + 0.6 + i * 0.09, 0.01, 0.06, 1.2); o.start(t + 0.6 + i * 0.09); o.stop(t + 2.2);
  });
}
export function liftOff() {
  if (!ctx || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  o.connect(f).connect(g).connect(sfxBus);
  const t = now();
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(220, t + 1.1);
  env(g, t, 0.3, 0.12, 0.9); o.start(t); o.stop(t + 1.4);
}
export function passSting() {
  if (!ctx || muted) return;
  [392, 523.25, 659.25].forEach((fr, i) => metal({ t: now() + i * 0.12, base: fr, peak: 0.12, d: 1.2, partials: [1, 2, 3.01] }));
}
export function lightSwitch() {
  if (!ctx || muted) return;
  const t = now();
  noiseHit({ t, freq: 180, q: 0.8, type: 'lowpass', peak: 0.9, d: 0.35 });   // breaker thunk
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 60;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
  o.connect(f).connect(g).connect(sfxBus); env(g, t + 0.05, 0.4, 0.05, 2.4); o.start(t); o.stop(t + 3); // electric hum
  [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((fr, i) => {          // rising sparkle
    const oo = ctx.createOscillator(), gg = ctx.createGain(); oo.type = 'sine'; oo.frequency.value = fr * 2;
    oo.connect(gg).connect(sfxBus); env(gg, t + 0.3 + i * 0.32, 0.02, 0.05, 1.4); oo.start(t + 0.3 + i * 0.32); oo.stop(t + 2.5 + i * 0.32);
  });
}

/* ---------- finale music (assets/finale.mp3, plays once when the lights come on) ---------- */
let finaleBuf = null, finaleSrc = null;
function loadFinale() {
  if (!finaleBuf) finaleBuf = fetch('assets/finale.mp3').then(r => r.arrayBuffer())
    .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)));
  return finaleBuf;
}
export function preloadFinale() { if (ctx) loadFinale().catch(() => {}); }
export async function startJazz() {
  if (!ctx) return;
  stopJazz(true);
  let buf; try { buf = await loadFinale(); } catch (e) { return; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(musicBus);
  finaleSrc = src;
  musicBus.gain.cancelScheduledValues(now()); musicBus.gain.setValueAtTime(0.0001, now());
  musicBus.gain.exponentialRampToValueAtTime(0.9, now() + 0.6);
  src.onended = () => { if (finaleSrc === src) finaleSrc = null; };
  src.start();
}
export function stopJazz(instant = false) {
  if (!ctx || !finaleSrc) return;
  const s = finaleSrc; finaleSrc = null;
  if (instant) { try { s.stop(); } catch (e) {} return; }
  ramp(musicBus.gain, 0, 0.8);
  setTimeout(() => { try { s.stop(); } catch (e) {} }, 1000);
}

/* ---------- narration (assets/narration/01.mp3 … 06.mp3) ---------- */
const voiceBufs = {};
function loadVoice(i) {
  if (!voiceBufs[i]) voiceBufs[i] = fetch(`assets/narration/0${i + 1}.mp3`)
    .then(r => r.arrayBuffer())
    .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)));
  return voiceBufs[i];
}
export function preloadNarration(n = 6) { if (ctx) for (let i = 0; i < n; i++) loadVoice(i).catch(() => {}); }

let voiceSrc = null;
// plays stage i's narration; resolves when it ends (or right away if stopped / unavailable)
export async function speak(i) {
  if (!ctx) return;
  stopVoice();
  let buf;
  try { buf = await loadVoice(i); } catch (e) { return; }
  return new Promise(resolve => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(voiceBus);
    voiceSrc = src;
    ducking = true; setScene({});
    src.onended = () => {
      if (voiceSrc === src) { voiceSrc = null; ducking = false; setScene({}); }
      resolve();
    };
    src.start();
  });
}
export function stopVoice() {
  if (voiceSrc) { const s = voiceSrc; voiceSrc = null; try { s.stop(); } catch (e) {} }
  if (ducking) { ducking = false; setScene({}); }
}

// loudness probe (used by the automated test)
export function level() {
  if (!analyser) return -1;
  const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a);
  return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
}

// paper flutter for the newspaper transition
export function paperRustle() {
  if (!ctx || muted) return;
  const t0 = now();
  for (let i = 0; i < 14; i++) {
    const t = t0 + i * 0.035 + Math.random() * 0.02;
    noiseHit({ t, freq: 1800 + Math.random() * 2600, q: 0.9, peak: 0.07 + Math.random() * 0.08, d: 0.05 + Math.random() * 0.06, pan: Math.random() * 1.2 - 0.6 });
  }
  noiseHit({ t: t0, freq: 600, q: 0.5, peak: 0.12, d: 0.45 });
}
