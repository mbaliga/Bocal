import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const state = {
  catalog: null,
  sax: null,
  instrument: 'alto-sax',
  model: null,
  modelEntry: null,
  mode: 'learn',
  view: 'front',
  selectedIndex: 0,
  selectedChoice: 0,
  manualKeys: new Set(),
  anchors: new Map(),
  selectedMesh: null,
  selectedMaterialStates: [],
  clickStart: null,
};

const initialInstrument = new URLSearchParams(window.location.search).get('instrument') || 'alto-sax';
const canvas = $('model-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = null;
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 2;
controls.maxDistance = 30;
scene.add(new THREE.HemisphereLight(0xf7f1ff, 0x161621, 2.15));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.6); keyLight.position.set(5, 8, 7); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x7c65ff, 2.0); rimLight.position.set(-6, 4, -5); scene.add(rimLight);
const cyanLight = new THREE.PointLight(0x19ecd1, 7.0, 13); cyanLight.position.set(-3, 1, 5); scene.add(cyanLight);
const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const keyWorld = new Map();
let modelBox = new THREE.Box3();
let modelRadius = 4;

function resize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  resize();
  controls.update();
  renderer.render(scene, camera);
  updateAnchorScreenPositions();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function midiName(midi) {
  const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
function frequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
function noteHtml(note, octave) { return `${note}<sup>${octave}</sup>`; }
function choiceList(f) {
  return [{ id:`${f.id}-primary`, label:f.primaryLabel || 'Primary', keys:f.keys, hint:f.hint, useWhen:'' }, ...(f.alternates || [])];
}

async function init() {
  const [catalog, sax] = await Promise.all([
    fetch('./catalog-v04.json').then(r => r.json()),
    fetch('./data/sax-metadata.json').then(r => r.json()),
  ]);
  state.catalog = catalog; state.sax = sax;
  state.selectedIndex = Math.max(0, sax.fingerings.findIndex(f => f.id === 'a4'));
  buildInstrumentSelect();
  buildNoteBrowser();
  buildModeSwitch();
  buildViewSwitch();
  wireButtons();
  await loadInstrument(initialInstrument);
}

function buildInstrumentSelect() {
  const select = $('instrument-select');
  select.innerHTML = '';
  state.catalog.instruments.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id; option.textContent = `${item.name} · ${item.key}`; select.appendChild(option);
  });
  select.value = state.instrument;
  select.addEventListener('change', () => loadInstrument(select.value));
}
function buildModeSwitch() {
  $('mode-switch').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    if (state.instrument !== 'alto-sax') return;
    state.mode = btn.dataset.mode;
    state.manualKeys.clear();
    $('mode-switch').querySelectorAll('button').forEach(b => { const active=b===btn; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    $('check-button').hidden = state.mode !== 'challenge';
    $('challenge-result').hidden = true;
    renderSaxState();
  }));
}
function buildViewSwitch() {
  $('view-switch').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
}
function wireButtons() {
  $('reset-button').addEventListener('click', () => setView(state.view, true));
  $('interaction-button').addEventListener('click', () => {
    controls.enabled = !controls.enabled;
    $('interaction-button').classList.toggle('active', controls.enabled);
  });
  $('hear-button').addEventListener('click', playSelectedTone);
  $('check-button').addEventListener('click', checkChallenge);
  $('credit-button').addEventListener('click', showCredit);
  $('close-credit').addEventListener('click', () => $('credit-dialog').close());
  canvas.addEventListener('pointerdown', e => state.clickStart = [e.clientX, e.clientY]);
  canvas.addEventListener('pointerup', e => {
    if (!state.clickStart) return;
    const d = Math.hypot(e.clientX - state.clickStart[0], e.clientY - state.clickStart[1]);
    state.clickStart = null;
    if (d < 7 && state.instrument !== 'alto-sax') inspectPreviewPart(e);
  });
}

function buildNoteBrowser() {
  const host = $('note-browser'); host.innerHTML = '';
  state.sax.fingerings.forEach((f, index) => {
    const b = document.createElement('button');
    b.innerHTML = noteHtml(f.note, f.octave);
    b.addEventListener('click', () => { state.selectedIndex = index; state.selectedChoice = 0; state.manualKeys.clear(); renderSaxState(); });
    host.appendChild(b);
  });
}

async function loadInstrument(id) {
  state.instrument = id;
  state.modelEntry = state.catalog.instruments.find(i => i.id === id);
  if (!state.modelEntry) return;
  $('instrument-select').value = id;
  $('loading').classList.remove('done');
  $('loading').textContent = 'Loading detailed instrument…';
  clearSelection();
  if (state.model) { scene.remove(state.model); disposeObject(state.model); state.model = null; }
  clearAnchors();
  try {
    const gltf = await loader.loadAsync(`./${state.modelEntry.modelPath}`);
    state.model = gltf.scene;
    scene.add(state.model);
    normalizeModel(state.model, id);
    configureInstrumentUI(id);
    if (id === 'alto-sax') buildSaxAnchors();
    setView('front', true);
    $('loading').classList.add('done');
  } catch (err) {
    console.error(err);
    $('loading').textContent = 'Detailed model could not be opened on this renderer.';
  }
}

function normalizeModel(model, id) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetHeight = id === 'alto-sax' ? 6.6 : 6.2;
  const scale = targetHeight / Math.max(size.y, 0.0001);
  model.scale.multiplyScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  // Reference assets are authored upright; keep original orientation and normalize around the origin.
  model.updateMatrixWorld(true);
  modelBox = new THREE.Box3().setFromObject(model);
  const sphere = modelBox.getBoundingSphere(new THREE.Sphere());
  modelRadius = Math.max(2.4, sphere.radius);
  controls.minDistance = modelRadius * 1.05;
  controls.maxDistance = modelRadius * 4.8;
}

function configureInstrumentUI(id) {
  const entry = state.modelEntry;
  const isSax = id === 'alto-sax';
  $('model-truth').textContent = isSax ? 'Licensed detailed mesh · interactive fingering targets aligned to validated control data' : 'Licensed detailed anatomy mesh · selectable authored mechanisms';
  $('model-boundary').textContent = entry.note;
  $('release-truth').textContent = entry.note;
  $('sax-panel').hidden = !isSax;
  $('oboe-panel').hidden = isSax;
  $('mode-switch').hidden = !isSax;
  $('note-browser').hidden = !isSax;
  $('legend').hidden = !isSax;
  $('pitch-badge').hidden = !isSax;
  if (isSax) {
    $('instrument-kicker').textContent = 'INSTRUMENT LAB · VALIDATED INTERACTIVE ALTO';
    $('lab-title').textContent = 'See the touch. Follow the mechanism.';
    $('lab-copy').textContent = 'Choose a written note or tap a target on the detailed saxophone. Solid cyan marks the player touch; the trace explains the linked mechanism.';
    setViewLabels(['Player','Left controls','Right controls','Thumb / back']);
    renderSaxState();
  } else {
    $('instrument-kicker').textContent = 'INSTRUMENT LAB · OBOE ANATOMY PREVIEW';
    $('lab-title').textContent = 'Inspect the real mechanism.';
    $('lab-copy').textContent = 'This optimized reference keeps the model’s separately authored rods, springs and key assemblies selectable. Fingering lessons will follow only after expert validation.';
    $('parts-title').textContent = 'Inspect the real mechanism.';
    $('parts-copy').textContent = 'This optimized Howarth S20C reference keeps separately authored rods, springs and key assemblies selectable. Fingering lessons stay locked until expert validation.';
    $('reference-name').textContent = 'Howarth S20C';
    $('reference-meta').textContent = 'Optimized for mobile · 392 separated meshes';
    $('preview-status').textContent = '◉ Preview, not fingering trainer';
    setViewLabels(['Front','Left','Right','Back']);
    $('selected-part').textContent = 'Tap any visible mechanism';
    $('part-detail').textContent = 'Part inspection changes no fingering state.';
  }
}
function setViewLabels(labels) {
  $('view-switch').querySelectorAll('button').forEach((b,i) => b.textContent = labels[i]);
}

function setView(view, force = false) {
  state.view = view;
  $('view-switch').querySelectorAll('button').forEach(b => { const active=b.dataset.view===view; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  const d = modelRadius * 2.6;
  const target = new THREE.Vector3(0,0,0);
  const pos = {
    front: new THREE.Vector3(0, 0, d),
    left: new THREE.Vector3(-d, 0, 0),
    right: new THREE.Vector3(d, 0, 0),
    back: new THREE.Vector3(0, 0, -d),
  }[view] || new THREE.Vector3(0,0,d);
  if (force) camera.position.copy(pos); else camera.position.lerp(pos, 1);
  controls.target.copy(target); controls.update();
  filterAnchorsForView();
}

function mapRange(v, inA, inB, outA, outB) { return outA + (v - inA) * (outB - outA) / (inB - inA); }
function surfaceAnchor(key) {
  const box = modelBox;
  const size = box.getSize(new THREE.Vector3());
  const minY=-1.74,maxY=2.4,minX=-0.66,maxX=0.61;
  const y = mapRange(key.position[1], minY, maxY, box.min.y + size.y*0.10, box.max.y - size.y*0.08);
  const x = mapRange(key.position[0], minX, maxX, box.min.x + size.x*0.28, box.max.x - size.x*0.28);
  const centerZ = (box.min.z + box.max.z) * 0.5;
  let origin, dir;
  if (key.side === 'back') { origin = new THREE.Vector3(x,y,box.min.z-size.z*.25); dir = new THREE.Vector3(0,0,1); }
  else if (key.side === 'left') { origin = new THREE.Vector3(box.min.x-size.x*.25,y,centerZ+size.z*.08); dir = new THREE.Vector3(1,0,0); }
  else if (key.side === 'right') { origin = new THREE.Vector3(box.max.x+size.x*.25,y,centerZ+size.z*.08); dir = new THREE.Vector3(-1,0,0); }
  else { origin = new THREE.Vector3(x,y,box.max.z+size.z*.25); dir = new THREE.Vector3(0,0,-1); }
  raycaster.set(origin, dir.normalize());
  const hits = raycaster.intersectObject(state.model, true).filter(h => h.object?.isMesh);
  if (hits.length) return hits[0].point.clone();
  if (key.side === 'back') return new THREE.Vector3(x,y,box.min.z);
  if (key.side === 'left') return new THREE.Vector3(box.min.x,y,centerZ);
  if (key.side === 'right') return new THREE.Vector3(box.max.x,y,centerZ);
  return new THREE.Vector3(x,y,box.max.z);
}

function buildSaxAnchors() {
  clearAnchors(); keyWorld.clear();
  state.sax.keys.forEach(key => {
    const world = surfaceAnchor(key); keyWorld.set(key.id, world);
    const el = document.createElement('button');
    el.className='anchor'; el.dataset.id=key.id; el.dataset.label=key.short; el.setAttribute('aria-label', `${key.name}, ${key.hand} ${key.finger}`);
    el.addEventListener('click', ev => { ev.stopPropagation(); toggleKey(key.id); });
    $('anchor-layer').appendChild(el); state.anchors.set(key.id, el);
  });
  filterAnchorsForView();
}
function clearAnchors(){ $('anchor-layer').innerHTML=''; state.anchors.clear(); keyWorld.clear(); }
function filterAnchorsForView() {
  if (state.instrument !== 'alto-sax') return;
  state.sax.keys.forEach(key => {
    const el=state.anchors.get(key.id); if(!el) return;
    const show = state.view==='front' ? key.side!=='back' : state.view==='left' ? (key.hand==='Left'||key.side==='left') : state.view==='right' ? (key.hand==='Right'||key.side==='right') : (key.side==='back'||key.id==='octave');
    el.classList.toggle('hidden', !show);
  });
}
function updateAnchorScreenPositions() {
  if (state.instrument !== 'alto-sax' || !state.model) return;
  const rect = canvas.getBoundingClientRect();
  for (const [id, world] of keyWorld.entries()) {
    const el = state.anchors.get(id); if (!el || el.classList.contains('hidden')) continue;
    const v = world.clone().project(camera);
    const x = (v.x*.5+.5)*rect.width; const y=(-v.y*.5+.5)*rect.height;
    el.style.left=`${x}px`; el.style.top=`${y}px`;
    el.style.display = (v.z < -1 || v.z > 1 || x<0 || y<0 || x>rect.width || y>rect.height) ? 'none' : '';
  }
}

function activeKeys() {
  if (state.mode==='challenge' || state.manualKeys.size) return new Set(state.manualKeys);
  return new Set(choiceList(state.sax.fingerings[state.selectedIndex])[state.selectedChoice]?.keys || []);
}
function toggleKey(id) {
  if (state.manualKeys.has(id)) state.manualKeys.delete(id); else state.manualKeys.add(id);
  if (state.mode === 'learn') {
    const match = findFingeringMatch(state.manualKeys);
    if (match) { state.selectedIndex=match.index; state.selectedChoice=match.choice; }
  }
  $('challenge-result').hidden=true;
  renderSaxState();
}
function findFingeringMatch(keys) {
  const a=[...keys].sort().join('|');
  for(let i=0;i<state.sax.fingerings.length;i++){
    const choices=choiceList(state.sax.fingerings[i]);
    for(let j=0;j<choices.length;j++) if([...choices[j].keys].sort().join('|')===a) return {index:i,choice:j};
  }
  return null;
}

function renderSaxState() {
  if (!state.sax) return;
  const f=state.sax.fingerings[state.selectedIndex];
  const choices=choiceList(f); state.selectedChoice=Math.min(state.selectedChoice, choices.length-1);
  const choice=choices[state.selectedChoice];
  const active=activeKeys();
  [...$('note-browser').children].forEach((b,i)=>b.classList.toggle('active',i===state.selectedIndex));
  const concertMidi=f.midi-9; const hz=frequency(concertMidi);
  $('badge-note').innerHTML=noteHtml(f.note,f.octave); $('badge-level').textContent=`${f.level} register`;
  $('written-pitch').innerHTML=noteHtml(f.note,f.octave); $('concert-pitch').textContent=midiName(concertMidi);
  $('hear-button').textContent=`🔊 Hear ${hz.toFixed(1)} Hz`; $('hear-button').dataset.hz=hz.toFixed(4);
  $('finger-hint').textContent=choice.hint || f.hint; $('contact-count').textContent=active.size;
  const list=$('contact-list'); list.innerHTML='';
  if(!active.size){ const empty=document.createElement('div'); empty.className='contact-item'; empty.innerHTML='<i>○</i><div><strong>Open fingering</strong><small>No player touch-piece is pressed.</small></div>'; list.appendChild(empty); }
  [...active].forEach(id=>{
    const key=state.sax.keys.find(k=>k.id===id); const mechanic=state.sax.mechanics[id]; if(!key)return;
    const row=document.createElement('div'); row.className='contact-item';
    const linked=(mechanic?.linkedPads||[]).map(p=>`${p.motion==='opens'?'Opens':'Closes'} ${p.name}${p.condition?` (${p.condition})`:''}`).join(' · ');
    row.innerHTML=`<i>${key.short}</i><div><strong>${key.name} · ${key.hand} ${key.finger}</strong><small>${linked || mechanic?.explanation || ''}</small></div>`; list.appendChild(row);
  });
  state.sax.keys.forEach(key=>{ const el=state.anchors.get(key.id); if(!el)return; el.classList.toggle('active',active.has(key.id)); el.classList.toggle('dim',state.mode==='challenge' && !active.has(key.id)); });
}
function checkChallenge(){
  const f=state.sax.fingerings[state.selectedIndex]; const a=[...state.manualKeys].sort().join('|');
  const ok=choiceList(f).some(c=>[...c.keys].sort().join('|')===a);
  const box=$('challenge-result'); box.hidden=false; box.className=`challenge-result ${ok?'ok':'retry'}`; box.textContent=ok?'Correct fingering route. Now play it and check the sound.':'Not yet. Compare the fingertip targets and try once more.';
}
function playSelectedTone(){
  const hz=Number($('hear-button').dataset.hz||261.63); const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
  const ac=new AC(); const osc=ac.createOscillator(); const gain=ac.createGain(); osc.type='sine'; osc.frequency.value=hz; gain.gain.setValueAtTime(.0001,ac.currentTime); gain.gain.exponentialRampToValueAtTime(.16,ac.currentTime+.025); gain.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+1.05); osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime+1.1); osc.onended=()=>ac.close();
}

function inspectPreviewPart(event){
  if(!state.model)return; const rect=canvas.getBoundingClientRect(); pointer.x=((event.clientX-rect.left)/rect.width)*2-1; pointer.y=-((event.clientY-rect.top)/rect.height)*2+1; raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObject(state.model,true).filter(h=>h.object?.isMesh); if(!hits.length)return; clearSelection(); const mesh=hits[0].object; state.selectedMesh=mesh;
  $('selected-part').textContent=mesh.name || mesh.parent?.name || 'Authored oboe mechanism';
  const faces=mesh.geometry?.index ? Math.floor(mesh.geometry.index.count/3) : Math.floor((mesh.geometry?.attributes?.position?.count||0)/3);
  $('part-detail').textContent=`Selectable mesh · approximately ${faces.toLocaleString()} triangles · anatomy preview only.`;
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material]; mats.filter(Boolean).forEach(mat=>{ const original={mat,emissive:mat.emissive?.clone?.(),intensity:mat.emissiveIntensity}; state.selectedMaterialStates.push(original); if(mat.emissive){mat.emissive.set(0x19ecd1);mat.emissiveIntensity=.55;} });
}
function clearSelection(){ state.selectedMaterialStates.forEach(s=>{if(s.emissive&&s.mat.emissive)s.mat.emissive.copy(s.emissive); if(s.intensity!==undefined)s.mat.emissiveIntensity=s.intensity;}); state.selectedMaterialStates=[]; state.selectedMesh=null; }
function disposeObject(obj){ obj.traverse(o=>{ if(o.geometry)o.geometry.dispose?.(); if(o.material){const arr=Array.isArray(o.material)?o.material:[o.material];arr.forEach(m=>m.dispose?.());} }); }
async function showCredit(){ const e=state.modelEntry; $('credit-title').textContent=e.credit; $('credit-copy').textContent=`${e.license} · ${e.source}`; try{$('credit-license').textContent=await fetch(`./${e.licenseFile}`).then(r=>r.text());}catch{$('credit-license').textContent=e.note;} $('credit-dialog').showModal(); }

init().catch(err=>{console.error(err);$('loading').textContent='Bocal Lab failed to initialize.'});
