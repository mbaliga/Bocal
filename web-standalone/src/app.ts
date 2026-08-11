import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ALTO_FINGERINGS, type SaxKeyId } from "./sax-data";

type CatalogItem = {
  id: string; name: string; family: string; key: string; transpose: number;
  tier: string; interactiveControls?: number; fingering?: string; file: string;
};
type Manifest = { instrumentCount: number; instruments: CatalogItem[] };
type Pitch = { hz: number; confidence: number; concertMidi: number; writtenMidi: number; cents: number };

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const $$ = <T extends HTMLElement>(selector: string) => [...document.querySelectorAll(selector)] as T[];
const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const STORAGE = {
  sessions: "bocal.sessions.v1", plan: "bocal.plan.v1", lesson: "bocal.lesson.v1"
};

let manifest: Manifest;
let currentInstrument: CatalogItem;
let audio: AudioContext | null = null;
let inputStream: MediaStream | null = null;
let analyser: AnalyserNode | null = null;
let analysisTimer = 0;
let latestFrame = new Float32Array(0);
let latestPitch: Pitch | null = null;
let currentA4 = 440;
let pitchFrames = 0;
let inTuneFrames = 0;
let centsHistory: number[] = [];
let midiHistory: number[] = [];
let sessionStartedAt = 0;
let sessionElapsed = 0;
let sessionTicker = 0;
let timedStop = 0;

function noteName(midi: number) {
  return `${NOTES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function hzForMidi(midi: number) {
  return currentA4 * 2 ** ((midi - 69) / 12);
}

function ensureAudio() {
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

function rms(frame: Float32Array) {
  let sum = 0;
  for (const x of frame) sum += x * x;
  return Math.sqrt(sum / frame.length);
}

// Clean-room implementation of the difference/CMND stages described by YIN.
function yin(frame: Float32Array, sampleRate: number): { hz: number; confidence: number } | null {
  if (rms(frame) < 0.009) return null;
  const half = Math.floor(frame.length / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / 2200));
  const maxTau = Math.min(half - 1, Math.floor(sampleRate / 45));
  const diff = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    let d = 0;
    for (let i = 0; i < half; i += 1) {
      const delta = frame[i] - frame[i + tau];
      d += delta * delta;
    }
    diff[tau] = d;
  }
  let running = 0;
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxTau; tau += 1) {
    running += diff[tau];
    cmnd[tau] = running ? (diff[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minTau; t < maxTau; t += 1) {
    if (cmnd[t] < 0.14 && cmnd[t] <= cmnd[t + 1]) { tau = t; break; }
  }
  if (tau < 0) {
    let best = 1;
    for (let t = minTau; t <= maxTau; t += 1) if (cmnd[t] < best) { best = cmnd[t]; tau = t; }
    if (best > 0.28) return null;
  }
  const left = cmnd[Math.max(minTau, tau - 1)], mid = cmnd[tau], right = cmnd[Math.min(maxTau, tau + 1)];
  const denom = 2 * (2 * mid - left - right);
  const refined = denom ? tau + (right - left) / denom : tau;
  return { hz: sampleRate / refined, confidence: Math.max(0, Math.min(1, 1 - mid)) };
}

function makePitch(hz: number, confidence: number): Pitch {
  const floatMidi = 69 + 12 * Math.log2(hz / currentA4);
  const concertMidi = Math.round(floatMidi);
  const writtenMidi = concertMidi - (currentInstrument?.transpose ?? 0);
  const cents = 1200 * Math.log2(hz / hzForMidi(concertMidi));
  return { hz, confidence, concertMidi, writtenMidi, cents };
}

function renderPitch(p: Pitch | null) {
  const tolerance = Number($("#tolerance").getAttribute("value") ?? ($<HTMLSelectElement>("#tolerance").value || 10));
  if (!p) {
    $("#mic-state").textContent = inputStream ? "Listening · play a steady note" : "Mic off";
    return;
  }
  latestPitch = p;
  pitchFrames += 1;
  if (Math.abs(p.cents) <= tolerance) inTuneFrames += 1;
  centsHistory.push(p.cents); if (centsHistory.length > 180) centsHistory.shift();
  midiHistory.push(p.concertMidi); if (midiHistory.length > 180) midiHistory.shift();
  const written = noteName(p.writtenMidi);
  const concert = noteName(p.concertMidi);
  const showConcert = $<HTMLSelectElement>("#pitch-display").value === "concert";
  $("#written-note").textContent = showConcert ? NOTES[p.concertMidi % 12] : NOTES[p.writtenMidi % 12];
  $("#note-octave").textContent = String(Math.floor((showConcert ? p.concertMidi : p.writtenMidi) / 12) - 1);
  $("#frequency").textContent = p.hz.toFixed(1);
  $("#concert-note").textContent = showConcert ? `${concert} concert` : `${written} written · ${concert} concert`;
  const state = Math.abs(p.cents) <= tolerance ? "centered" : p.cents < 0 ? "flat" : "sharp";
  $("#cents").textContent = `${p.cents >= 0 ? "+" : ""}${p.cents.toFixed(1)} cents · ${state}`;
  $("#cent-marker").style.left = `${Math.max(0, Math.min(100, 50 + p.cents))}%`;
  $("#mic-state").textContent = `${Math.round(p.confidence * 100)}% clear · ${state}`;
  $("#mic-state").classList.add("live");
  $("#in-tune-score").textContent = `${Math.round(100 * inTuneFrames / pitchFrames)}%`;
  const recent = centsHistory.slice(-40);
  const mean = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
  const sd = Math.sqrt(recent.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, recent.length));
  $("#stability-score").textContent = `${Math.max(0, Math.round(100 - sd * 4))}%`;
  $("#detected-count").textContent = String(pitchFrames);
  const range = [...new Set(midiHistory)].sort((a, b) => a - b);
  $("#range-score").textContent = range.length ? `${noteName(range[0])}–${noteName(range.at(-1)!)} ` : "—";
  drawPitchTrace(); drawWaveform(); drawHarmonics();
}

async function toggleMic() {
  if (inputStream) { stopMic(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { $("#mic-state").textContent = "Microphone unavailable"; return; }
  try {
    inputStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = ensureAudio();
    analyser = ctx.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(inputStream).connect(analyser);
    latestFrame = new Float32Array(analyser.fftSize);
    $("#mic-toggle").textContent = "■ Stop";
    $("#mic-state").classList.add("live");
    analyzeInput();
  } catch (error) {
    $("#mic-state").textContent = error instanceof Error ? error.message : "Microphone permission denied";
  }
}

function analyzeInput() {
  if (!analyser || !inputStream) return;
  analyser.getFloatTimeDomainData(latestFrame);
  const result = yin(latestFrame.subarray(0, 2048), ensureAudio().sampleRate);
  renderPitch(result ? makePitch(result.hz, result.confidence) : null);
  analysisTimer = window.setTimeout(analyzeInput, 45);
}

function stopMic() {
  window.clearTimeout(analysisTimer);
  inputStream?.getTracks().forEach(track => track.stop());
  inputStream = null; analyser = null;
  $("#mic-toggle").textContent = "◉ Listen";
  $("#mic-state").textContent = "Mic off"; $("#mic-state").classList.remove("live");
}

function canvas2d(id: string) {
  const canvas = $<HTMLCanvasElement>(id); return { canvas, ctx: canvas.getContext("2d")! };
}

function drawPitchTrace() {
  const { canvas, ctx } = canvas2d("#pitch-trace");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#272a31"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
  if (centsHistory.length < 2) return;
  ctx.strokeStyle = "#39e8cf"; ctx.lineWidth = 4; ctx.beginPath();
  centsHistory.forEach((c, i) => {
    const x = i / Math.max(1, centsHistory.length - 1) * canvas.width;
    const y = canvas.height / 2 - Math.max(-50, Math.min(50, c)) / 50 * (canvas.height * .42);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }); ctx.stroke();
}

function drawWaveform() {
  const { canvas, ctx } = canvas2d("#waveform");
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = "#292b32"; ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
  if (!latestFrame.length) return;
  ctx.strokeStyle = "#9b8cff"; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 0; x < canvas.width; x += 2) {
    const i = Math.floor(x / canvas.width * latestFrame.length);
    const y = canvas.height / 2 - latestFrame[i] * canvas.height * .44;
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  } ctx.stroke();
}

function harmonicEnergy(frame: Float32Array, frequency: number, sampleRate: number) {
  let re = 0, im = 0;
  for (let i = 0; i < frame.length; i += 1) { const a = 2 * Math.PI * frequency * i / sampleRate; re += frame[i] * Math.cos(a); im -= frame[i] * Math.sin(a); }
  return Math.sqrt(re * re + im * im) / frame.length;
}

function drawHarmonics() {
  const { canvas, ctx } = canvas2d("#harmonics"); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!latestPitch || !latestFrame.length) return;
  const values = Array.from({ length: 12 }, (_, i) => harmonicEnergy(latestFrame.subarray(0, 2048), latestPitch!.hz * (i + 1), ensureAudio().sampleRate));
  const max = Math.max(...values, .00001); const gap = 12; const width = (canvas.width - gap * 13) / 12;
  values.forEach((v, i) => { const h = v / max * (canvas.height - 45); ctx.fillStyle = i < 6 ? "#9b8cff" : "#39e8cf"; ctx.fillRect(gap + i * (width + gap), canvas.height - 24 - h, width, h); ctx.fillStyle = "#777a84"; ctx.font = "18px system-ui"; ctx.fillText(String(i + 1), gap + i * (width + gap), canvas.height - 5); });
  const weighted = values.reduce((s, v, i) => s + v * (i + 1), 0) / Math.max(.0001, values.reduce((a, b) => a + b, 0));
  $("#brightness").textContent = weighted < 3 ? "Dark" : weighted < 5 ? "Balanced" : "Bright";
  $("#clarity").textContent = `${Math.round((latestPitch?.confidence ?? 0) * 100)}%`;
  $("#note-start").textContent = centsHistory.length ? `${centsHistory[0].toFixed(0)}¢` : "—";
  const recent = centsHistory.slice(-60); $("#vibrato").textContent = recent.length ? `${(Math.max(...recent) - Math.min(...recent)).toFixed(0)}¢` : "—";
}

function playReference() {
  const ctx = ensureAudio(); const target = latestPitch ? hzForMidi(latestPitch.concertMidi) : hzForMidi(60);
  const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = "sine"; osc.frequency.value = target;
  gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.15, ctx.currentTime + .03); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1.45);
  osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1.5);
}

// 3D lab ---------------------------------------------------------------------
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, controls: OrbitControls;
let modelRoot: THREE.Object3D | null = null;
let interactive = new Map<string, THREE.Object3D>();
let pressed = new Set<string>();
const loader = new GLTFLoader();

function init3d() {
  const host = $("#model-canvas"); scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(31, 1, .05, 100); camera.position.set(7, 1, 11);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; host.append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 28;
  scene.add(new THREE.HemisphereLight(0xd9dcff, 0x120d08, 2.8)); const key = new THREE.DirectionalLight(0xffedb7, 5.2); key.position.set(-4, 8, 6); scene.add(key); const rim = new THREE.DirectionalLight(0x9b8cff, 4); rim.position.set(6, 3, -6); scene.add(rim);
  const resize = () => { const r = host.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(host); resize();
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  renderer.domElement.addEventListener("pointerup", event => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1)); ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects([...interactive.values()], true)[0]; if (!hit) return; let object: THREE.Object3D | null = hit.object; while (object && !object.userData.interactive) object = object.parent; if (object) toggleControl(object); });
  const tick = () => { requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); }; tick(); resetCamera();
}

function resetCamera() { if (!camera || !controls) return; camera.position.set(7, 1, 11); controls.target.set(0, 0, 0); controls.update(); }

function setHighlight(object: THREE.Object3D, active: boolean) {
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.userData.originalMaterial) child.userData.originalMaterial = child.material;
    if (active) { const material = (child.material as THREE.MeshStandardMaterial).clone(); material.color.set(0x39e8cf); if ("emissive" in material) material.emissive.set(0x075a4f); child.material = material; }
    else child.material = child.userData.originalMaterial;
  });
}

function toggleControl(object: THREE.Object3D) {
  const id = object.userData.keyId ?? object.name.replace("key__", "");
  pressed.has(id) ? pressed.delete(id) : pressed.add(id); setHighlight(object, pressed.has(id));
  $("#selected-control").textContent = object.userData.label ?? id;
  $("#control-detail").textContent = [object.userData.finger, object.userData.side, object.userData.partType].filter(Boolean).join(" · ");
  updatePressed();
}

function updatePressed() {
  $("#pressed-keys").textContent = pressed.size ? [...pressed].join(", ") : "Open";
  if (currentInstrument.id === "alto-sax") {
    const match = ALTO_FINGERINGS.find(f => f.keys.length === pressed.size && f.keys.every(k => pressed.has(k)));
    $("#fingering-result").textContent = match ? `${match.note}${match.octave} written · ${match.hint}` : pressed.size ? "No exact core-range fingering match yet. Alternate and altissimo fingerings belong in the validated expansion set." : "Open fingering maps to written C♯5 in the core chart.";
  }
}

function applyFingering(keys: SaxKeyId[], button: HTMLButtonElement) {
  pressed.clear(); interactive.forEach(object => setHighlight(object, false)); keys.forEach(key => { pressed.add(key); const object = interactive.get(key); if (object) setHighlight(object, true); });
  $$("#note-browser button").forEach(b => b.classList.toggle("active", b === button)); updatePressed();
}

function renderNoteBrowser() {
  const host = $("#note-browser"); host.replaceChildren();
  if (currentInstrument?.family !== "Saxophones") { host.innerHTML = "<p class='callout'>Part exploration is active. Note-level fingering awaits instrument-specialist validation.</p>"; return; }
  for (const f of ALTO_FINGERINGS) { const b = document.createElement("button"); b.textContent = `${f.note}${f.octave}`; b.title = f.hint; b.addEventListener("click", () => applyFingering(f.keys, b)); host.append(b); }
}

function loadModel(item: CatalogItem) {
  if (!scene) return;
  $("#model-status").textContent = "Loading local GLB…"; $("#model-name").textContent = item.name;
  if (modelRoot) scene.remove(modelRoot); interactive.clear(); pressed.clear();
  loader.load(`./models/${item.id}.glb`, gltf => {
    modelRoot = gltf.scene; const box = new THREE.Box3().setFromObject(modelRoot); const size = box.getSize(new THREE.Vector3()); const max = Math.max(size.x, size.y, size.z); modelRoot.scale.multiplyScalar(6.8 / max); box.setFromObject(modelRoot); const center = box.getCenter(new THREE.Vector3()); modelRoot.position.sub(center); scene.add(modelRoot);
    modelRoot.traverse(o => { if (o.userData?.interactive || o.name.startsWith("key__")) interactive.set(o.userData.keyId ?? o.name.replace("key__", ""), o); });
    $("#model-status").textContent = `${interactive.size} interactive controls · educational geometry v1`; resetCamera(); renderNoteBrowser(); updatePressed();
  }, undefined, error => { $("#model-status").textContent = `Model load failed: ${String(error)}`; });
}

// Metronome ------------------------------------------------------------------
let metroRunning = false, metroTimer = 0, nextTickTime = 0, tickIndex = 0;
const tapTimes: number[] = [];
function meterParts() { const [top, bottom] = $<HTMLSelectElement>("#meter").value.split("/").map(Number); return { top, bottom }; }
function drawBeatLights(active = -1) { const host = $("#beat-lights"); const top = meterParts().top; host.replaceChildren(...Array.from({ length: top }, (_, i) => { const el = document.createElement("i"); el.textContent = String(i + 1); el.classList.toggle("active", i === active); return el; })); }
function clickAt(time: number, accent: boolean, silent: boolean) {
  if (!silent) { const ctx = ensureAudio(), osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = accent ? 1380 : 940; gain.gain.setValueAtTime(accent ? .25 : .13, time); gain.gain.exponentialRampToValueAtTime(.0001, time + .055); osc.connect(gain).connect(ctx.destination); osc.start(time); osc.stop(time + .06); }
}
function scheduleMetro() {
  if (!metroRunning) return; const ctx = ensureAudio(); const bpm = Number($("#tempo").textContent); const subdiv = Number($<HTMLSelectElement>("#subdivision").value); const { top } = meterParts();
  while (nextTickTime < ctx.currentTime + .12) {
    const beat = Math.floor(tickIndex / subdiv) % top; const within = tickIndex % subdiv; const downbeat = beat === 0 && within === 0; const silent = $<HTMLInputElement>("#random-silence").checked && !downbeat && Math.random() < .28;
    clickAt(nextTickTime, downbeat && $<HTMLInputElement>("#accent").checked, silent);
    if (within === 0) { const delay = Math.max(0, (nextTickTime - ctx.currentTime) * 1000); window.setTimeout(() => { drawBeatLights(beat); if ($<HTMLInputElement>("#haptics").checked && navigator.vibrate) navigator.vibrate(downbeat ? [18, 30, 12] : 12); }, delay); }
    nextTickTime += 60 / bpm / subdiv; tickIndex += 1;
  }
  metroTimer = window.setTimeout(scheduleMetro, 25);
}
function toggleMetro() { metroRunning = !metroRunning; if (metroRunning) { nextTickTime = ensureAudio().currentTime + .06; tickIndex = 0; scheduleMetro(); } else { clearTimeout(metroTimer); drawBeatLights(); } $("#metro-toggle").textContent = metroRunning ? "Stop pulse" : "Start pulse"; $("#beat-status").textContent = metroRunning ? "Running" : "Stopped"; $("#beat-status").classList.toggle("live", metroRunning); }
function setTempo(value: number) { const tempo = Math.max(30, Math.min(260, Math.round(value))); $("#tempo").textContent = String(tempo); $<HTMLInputElement>("#tempo-slider").value = String(tempo); }
function tapTempo() { const now = performance.now(); if (tapTimes.length && now - tapTimes.at(-1)! > 2400) tapTimes.length = 0; tapTimes.push(now); if (tapTimes.length > 7) tapTimes.shift(); if (tapTimes.length > 1) { const span = tapTimes.at(-1)! - tapTimes[0]; setTempo(60000 * (tapTimes.length - 1) / span); } }

// Tone generator -------------------------------------------------------------
const toneNodes = new Map<number, { osc: OscillatorNode; gain: GainNode }>();
const JUST = [1,16/15,9/8,6/5,5/4,4/3,45/32,3/2,8/5,5/3,9/5,15/8];
const PYTH = [1,256/243,9/8,32/27,81/64,4/3,729/512,3/2,128/81,27/16,16/9,243/128];
function toneFrequency(midi: number) { const temperament = $<HTMLSelectElement>("#temperament").value; if (temperament === "equal") return hzForMidi(midi); const octave = Math.floor(midi / 12) - 1, pc = ((midi % 12) + 12) % 12; const c = currentA4 * 2 ** (((octave + 1) * 12 - 69) / 12); return c * (temperament === "just-major" ? JUST[pc] : PYTH[pc]); }
function stopTone(midi: number) { const node = toneNodes.get(midi); if (!node) return; const now = ensureAudio().currentTime; node.gain.gain.cancelScheduledValues(now); node.gain.gain.setTargetAtTime(.0001, now, .025); node.osc.stop(now + .15); toneNodes.delete(midi); document.querySelector(`[data-midi="${midi}"]`)?.classList.remove("active"); }
function playTone(midi: number) { if (toneNodes.has(midi)) { stopTone(midi); return; } const ctx = ensureAudio(), osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = $<HTMLSelectElement>("#wave").value as OscillatorType; osc.frequency.value = toneFrequency(midi); gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.095, ctx.currentTime + .025); osc.connect(gain).connect(ctx.destination); osc.start(); toneNodes.set(midi, { osc, gain }); document.querySelector(`[data-midi="${midi}"]`)?.classList.add("active"); if (!$<HTMLInputElement>("#sustain").checked) window.setTimeout(() => stopTone(midi), 850); }
function stopAllTones() { [...toneNodes.keys()].forEach(stopTone); }
function renderKeyboard() { stopAllTones(); const host = $("#keyboard"), octave = Number($<HTMLSelectElement>("#tone-octave").value); host.replaceChildren(); for (let i = 0; i < 24; i += 1) { const midi = (octave + 1) * 12 + i, pc = midi % 12; const b = document.createElement("button"); b.className = `piano-key ${[1,3,6,8,10].includes(pc) ? "black" : ""}`; b.dataset.midi = String(midi); b.textContent = noteName(midi); b.addEventListener("click", () => playTone(midi)); host.append(b); } }

// Practice and recording -----------------------------------------------------
function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; } }
function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`; }
function toggleSession() {
  if (!sessionStartedAt) { sessionStartedAt = Date.now(); $("#session-toggle").textContent = "End practice"; sessionTicker = window.setInterval(() => { sessionElapsed = Math.floor((Date.now() - sessionStartedAt) / 1000); $("#session-clock").textContent = formatTime(sessionElapsed); }, 1000); }
  else { const sessions = readJson<any[]>(STORAGE.sessions, []); sessions.unshift({ startedAt: new Date(sessionStartedAt).toISOString(), seconds: sessionElapsed, instrumentId: currentInstrument.id, inTunePercent: pitchFrames ? Math.round(100 * inTuneFrames / pitchFrames) : null }); localStorage.setItem(STORAGE.sessions, JSON.stringify(sessions.slice(0, 100))); clearInterval(sessionTicker); sessionStartedAt = 0; sessionElapsed = 0; $("#session-clock").textContent = "00:00"; $("#session-toggle").textContent = "Start practice"; clearTimeout(timedStop); renderSessions(); }
}
function startTimedPractice() { if (!sessionStartedAt) toggleSession(); clearTimeout(timedStop); const minutes = Math.max(1, Number($<HTMLInputElement>("#practice-minutes").value)); timedStop = window.setTimeout(() => { if (sessionStartedAt) toggleSession(); if (navigator.vibrate) navigator.vibrate([100,70,100]); alert("Timed practice block complete."); }, minutes * 60_000); $("#timed-practice").textContent = `${minutes}-minute block running`; }
function renderSessions() { const host = $("#session-list"), sessions = readJson<any[]>(STORAGE.sessions, []); host.replaceChildren(); if (!sessions.length) { host.textContent = "No completed sessions on this device yet."; return; } for (const s of sessions.slice(0, 8)) { const row = document.createElement("div"); row.className = "session-row"; row.innerHTML = `<span>${new Date(s.startedAt).toLocaleDateString()} · ${s.instrumentId}</span><strong>${formatTime(s.seconds)}</strong>`; host.append(row); } }
type PlanItem = { id: string; text: string; minutes: number; done: boolean };
function renderPlan() { const host = $("#plan-items"), plan = readJson<PlanItem[]>(STORAGE.plan, [{ id:"long-tones",text:"Long tones: center and release",minutes:8,done:false },{ id:"scale",text:"D major scale with a drone",minutes:10,done:false },{ id:"repertoire",text:"Repertoire trouble loop",minutes:12,done:false }]); localStorage.setItem(STORAGE.plan, JSON.stringify(plan)); host.replaceChildren(); for (const item of plan) { const row = document.createElement("label"); row.className="plan-row"; const check=document.createElement("input"); check.type="checkbox"; check.checked=item.done; check.addEventListener("change",()=>{item.done=check.checked;localStorage.setItem(STORAGE.plan,JSON.stringify(plan));}); const text=document.createElement("input"); text.type="text"; text.value=item.text; text.addEventListener("change",()=>{item.text=text.value;localStorage.setItem(STORAGE.plan,JSON.stringify(plan));}); const min=document.createElement("small"); min.textContent=`${item.minutes} min`; row.append(check,text,min); host.append(row); } }
function addPlan() { const plan=readJson<PlanItem[]>(STORAGE.plan,[]); plan.push({id:crypto.randomUUID(),text:"New focus item",minutes:5,done:false}); localStorage.setItem(STORAGE.plan,JSON.stringify(plan)); renderPlan(); }
function exportData() { const payload={schemaVersion:1,exportedAt:new Date().toISOString(),sessions:readJson(STORAGE.sessions,[]),plan:readJson(STORAGE.plan,[]),lessonNote:localStorage.getItem(STORAGE.lesson)??""}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`bocal-export-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href); }
let mediaRecorder: MediaRecorder | null = null, recordChunks: Blob[] = [], recorderStream: MediaStream | null = null;
async function toggleRecording() { if (mediaRecorder?.state === "recording") { mediaRecorder.stop(); return; } try { recorderStream = await navigator.mediaDevices.getUserMedia({audio:true}); recordChunks=[]; mediaRecorder=new MediaRecorder(recorderStream); mediaRecorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data)}; mediaRecorder.onstop=()=>{const blob=new Blob(recordChunks,{type:mediaRecorder?.mimeType||"audio/webm"}); addRecording(blob); recorderStream?.getTracks().forEach(t=>t.stop()); recorderStream=null; $("#record-toggle").textContent="Start recording";}; mediaRecorder.start(); $("#record-toggle").textContent="Stop recording"; } catch { alert("Microphone permission is required to record."); } }
function addRecording(blob: Blob) { const host=$("#recordings"),url=URL.createObjectURL(blob),row=document.createElement("div");row.className="recording-row";const player=document.createElement("audio");player.controls=true;player.src=url;const link=document.createElement("a");link.href=url;link.download=`bocal-take-${Date.now()}.webm`;link.textContent="Download";row.append(player,link);host.prepend(row); }

function routeTo(route: string) { $$(".view").forEach(v=>v.classList.toggle("active",v.dataset.view===route)); $$("[data-route]").forEach(b=>b.classList.toggle("active",b.dataset.route===route)); if(route==="lab") window.setTimeout(()=>renderer && renderer.setSize($("#model-canvas").clientWidth,$("#model-canvas").clientHeight,false),0); location.hash=route; }
function wireEvents() {
  $$("[data-route]").forEach(b=>b.addEventListener("click",()=>routeTo(b.dataset.route!)));
  $("#mic-toggle").addEventListener("click",toggleMic); $("#reference-tone").addEventListener("click",playReference);
  $<HTMLInputElement>("#a4").addEventListener("input",e=>{currentA4=Number((e.target as HTMLInputElement).value);$("#a4-output").textContent=`${currentA4} Hz`;});
  $("#session-toggle").addEventListener("click",toggleSession); $("#reset-camera").addEventListener("click",resetCamera);
  $("#tempo-down").addEventListener("click",()=>setTempo(Number($("#tempo").textContent)-1)); $("#tempo-up").addEventListener("click",()=>setTempo(Number($("#tempo").textContent)+1));
  $<HTMLInputElement>("#tempo-slider").addEventListener("input",e=>setTempo(Number((e.target as HTMLInputElement).value))); $("#tap-tempo").addEventListener("click",tapTempo); $("#metro-toggle").addEventListener("click",toggleMetro); $("#meter").addEventListener("change",()=>drawBeatLights()); $("#timed-practice").addEventListener("click",startTimedPractice);
  $("#stop-tones").addEventListener("click",stopAllTones); $("#tone-octave").addEventListener("change",renderKeyboard);
  $("#add-plan").addEventListener("click",addPlan); $("#export-data").addEventListener("click",exportData); $("#record-toggle").addEventListener("click",toggleRecording); $("#clear-recordings").addEventListener("click",()=>$("#recordings").replaceChildren());
  $("#save-note").addEventListener("click",()=>{localStorage.setItem(STORAGE.lesson,$<HTMLTextAreaElement>("#lesson-note").value);$("#save-note").textContent="Saved locally";setTimeout(()=>$("#save-note").textContent="Save on device",1200)});
  $<HTMLSelectElement>("#instrument-select").addEventListener("change",e=>{currentInstrument=manifest.instruments.find(i=>i.id===(e.target as HTMLSelectElement).value)!;loadModel(currentInstrument);});
}

async function init() {
  manifest = await fetch("./catalog.json").then(r=>r.json());
  const select=$<HTMLSelectElement>("#instrument-select"); let family=""; for(const item of manifest.instruments){if(item.family!==family){family=item.family;const group=document.createElement("optgroup");group.label=family;select.append(group);}const option=document.createElement("option");option.value=item.id;option.textContent=`${item.name} · ${item.key}`;select.lastElementChild!.append(option);} currentInstrument=manifest.instruments.find(i=>i.id==="alto-sax")!;select.value=currentInstrument.id;
  const mobile=$(".mobile-nav"); for(const original of $$("#main-nav .nav-item")){const b=document.createElement("button");b.dataset.route=original.dataset.route;b.innerHTML=`<span>${original.querySelector("span")?.textContent}</span>${original.querySelector("b")?.textContent}`;mobile.append(b);}
  $("#lesson-note").textContent=localStorage.getItem(STORAGE.lesson)??"";
  init3d(); loadModel(currentInstrument); renderKeyboard(); drawBeatLights(); renderPlan(); renderSessions(); wireEvents();
  routeTo(location.hash.slice(1)||"tune");
}

void init();

