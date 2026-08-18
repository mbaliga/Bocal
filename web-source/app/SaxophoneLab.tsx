"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Ear,
  Eye,
  Hand,
  Headphones,
  Lightbulb,
  MousePointer2,
  RefreshCw,
  Rotate3D,
  Shuffle,
  Sparkles,
  Volume2,
  Wind,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ALTO_FINGERINGS,
  midiToFrequency,
  midiToName,
  SAX_KEYS,
  type Fingering,
  type SaxKeyId,
  writtenToConcert,
} from "./sax-data";

type TrainerMode = "learn" | "challenge";

const GOLD = new THREE.Color(0xb89235);
const GOLD_ACTIVE = new THREE.Color(0x08fed5);
const EMISSIVE_OFF = new THREE.Color(0x000000);
const EMISSIVE_ON = new THREE.Color(0x075a4f);

function sameKeys(left: Set<SaxKeyId>, right: SaxKeyId[]) {
  return left.size === right.length && right.every((key) => left.has(key));
}

function SaxophoneModel({
  activeKeys,
  onKeyToggle,
  resetView,
}: {
  activeKeys: Set<SaxKeyId>;
  onKeyToggle: (id: SaxKeyId) => void;
  resetView: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeKeys);
  const callbackRef = useRef(onKeyToggle);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => { activeRef.current = activeKeys; }, [activeKeys]);
  useEffect(() => { callbackRef.current = onKeyToggle; }, [onKeyToggle]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(6.4, 1.4, 10.5);
    controlsRef.current.target.set(0.25, 0.35, 0);
    controlsRef.current.update();
  }, [resetView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0b0c, 0.026);
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(6.4, 1.4, 10.5);
    cameraRef.current = camera;

    const rendererCanvas = document.createElement("canvas");
    const contextOptions = { antialias: true, alpha: true, powerPreference: "high-performance" as const };
    let renderingContext: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      renderingContext = rendererCanvas.getContext("webgl2", contextOptions) as WebGL2RenderingContext | null;
      renderingContext ??= rendererCanvas.getContext("webgl", contextOptions) as WebGLRenderingContext | null;
    } catch {
      renderingContext = null;
    }
    if (!renderingContext) {
      const fallbackTimer = window.setTimeout(() => setWebglUnavailable(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    const renderer = new THREE.WebGLRenderer({ canvas: rendererCanvas, context: renderingContext, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 7.2;
    controls.maxDistance = 16;
    controls.minPolarAngle = 0.42;
    controls.maxPolarAngle = Math.PI - 0.35;
    controls.target.set(0.25, 0.35, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.48;
    controls.update();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xd7d8ff, 0x16120b, 2.2));
    const keyLight = new THREE.DirectionalLight(0xfff2bd, 5.5);
    keyLight.position.set(-4, 7, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8e7bff, 4.5);
    rimLight.position.set(5, 2, -5);
    scene.add(rimLight);
    const cyanLight = new THREE.PointLight(0x08fed5, 28, 8, 2);
    cyanLight.position.set(-2, -1, 3);
    scene.add(cyanLight);

    const model = new THREE.Group();
    model.rotation.y = -0.23;
    model.position.y = -0.15;
    scene.add(model);

    const lacquer = new THREE.MeshPhysicalMaterial({
      color: 0xb88a28,
      metalness: 0.86,
      roughness: 0.24,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
    });
    const darkBrass = new THREE.MeshStandardMaterial({ color: 0x5f4717, metalness: 0.88, roughness: 0.3 });
    const pearl = new THREE.MeshPhysicalMaterial({ color: 0xddd9c7, roughness: 0.28, metalness: 0.06, clearcoat: 0.8 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.32, metalness: 0.28 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.38, 5.25, 32), lacquer);
    body.position.set(0, 0.33, 0);
    model.add(body);

    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -2.29, 0),
      new THREE.Vector3(0.03, -2.72, 0),
      new THREE.Vector3(0.42, -3.02, 0),
      new THREE.Vector3(0.9, -2.91, 0),
      new THREE.Vector3(1.23, -2.48, 0),
    ]);
    const bow = new THREE.Mesh(new THREE.TubeGeometry(bowCurve, 48, 0.39, 20, false), lacquer);
    model.add(bow);

    const bellTube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 2.45, 32), lacquer);
    bellTube.position.set(1.23, -1.28, 0);
    model.add(bellTube);

    const bellProfile = [
      new THREE.Vector2(0.42, -0.65),
      new THREE.Vector2(0.43, -0.12),
      new THREE.Vector2(0.48, 0.22),
      new THREE.Vector2(0.67, 0.52),
      new THREE.Vector2(0.99, 0.68),
      new THREE.Vector2(1.06, 0.74),
    ];
    const bell = new THREE.Mesh(new THREE.LatheGeometry(bellProfile, 48), lacquer);
    bell.position.set(1.23, 0.29, 0);
    model.add(bell);
    const bellRim = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.055, 12, 64), lacquer);
    bellRim.rotation.x = Math.PI / 2;
    bellRim.position.set(1.23, 1.03, 0);
    model.add(bellRim);
    const bellShadow = new THREE.Mesh(new THREE.CircleGeometry(0.97, 48), darkBrass);
    bellShadow.rotation.x = -Math.PI / 2;
    bellShadow.position.set(1.23, 1.015, 0);
    model.add(bellShadow);

    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.94, 0),
      new THREE.Vector3(-0.04, 3.38, 0),
      new THREE.Vector3(-0.38, 3.72, 0),
      new THREE.Vector3(-0.91, 3.78, 0),
      new THREE.Vector3(-1.35, 3.56, 0),
    ]);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 52, 0.19, 18, false), lacquer);
    model.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.42, 20), new THREE.MeshStandardMaterial({ color: 0x9d733c, roughness: 0.9 }));
    cork.rotation.z = Math.PI / 2 - 0.15;
    cork.position.set(-1.51, 3.47, 0);
    model.add(cork);
    const mouthpiece = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.75, 8, 20), black);
    mouthpiece.rotation.z = Math.PI / 2 - 0.17;
    mouthpiece.scale.set(0.78, 1, 0.62);
    mouthpiece.position.set(-1.94, 3.37, 0);
    model.add(mouthpiece);
    const ligature = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 22), lacquer);
    ligature.rotation.z = Math.PI / 2 - 0.16;
    ligature.position.set(-1.7, 3.42, 0);
    model.add(ligature);

    const addRod = (x: number, y: number, length: number, z: number) => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, length, 10), lacquer);
      rod.position.set(x, y, z);
      model.add(rod);
    };
    addRod(-0.46, 0.52, 4.12, 0.02);
    addRod(0.48, -0.38, 3.35, 0.03);
    addRod(-0.02, 0.7, 3.6, -0.34);

    for (let y = -1.8; y <= 2.5; y += 0.52) {
      const post = new THREE.Mesh(new THREE.SphereGeometry(0.057, 12, 8), lacquer);
      post.position.set(y % 1 > 0.5 ? 0.46 : -0.45, y, 0.02);
      model.add(post);
    }

    // Bottom bow guard: a protective wire loop wrapping the body just above
    // the bow. The body's cylinder radius at y=-1.84 is ~0.374 (interpolated
    // between its 0.38 bottom / 0.31 top radii); this rides just outside
    // that, centered on the body's own axis, rather than the ring radius
    // 0.5 offset (0.07, z 0.45) it shipped with, which put roughly a third
    // of the loop floating visibly clear of the body with no surface to
    // wrap.
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.035, 8, 36, Math.PI * 1.22), lacquer);
    guard.rotation.set(Math.PI / 2, 0.2, -0.52);
    guard.position.set(0, -1.84, 0);
    model.add(guard);

    const strapRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 24), lacquer);
    strapRing.rotation.y = Math.PI / 2;
    strapRing.position.set(-0.39, 1.08, -0.15);
    model.add(strapRing);

    const keyGroups = new Map<SaxKeyId, THREE.Group>();
    for (const key of SAX_KEYS) {
      const group = new THREE.Group();
      group.position.set(...key.position);
      group.userData.keyId = key.id;
      group.userData.baseZ = key.position[2];

      const keyMaterial = new THREE.MeshStandardMaterial({
        color: GOLD.clone(),
        emissive: EMISSIVE_OFF.clone(),
        metalness: 0.82,
        roughness: 0.22,
      });
      group.userData.material = keyMaterial;

      const cupSize = key.id === "octave" ? 0.14 : key.id.startsWith("palm") ? 0.16 : 0.19;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(cupSize, cupSize, 0.06, 24), keyMaterial);
      cup.rotation.x = Math.PI / 2;
      cup.userData.keyId = key.id;
      group.add(cup);

      if (["lh1", "lh2", "lh3", "rh1", "rh2", "rh3"].includes(key.id)) {
        const touch = new THREE.Mesh(new THREE.CylinderGeometry(cupSize * 0.72, cupSize * 0.72, 0.066, 24), pearl);
        touch.rotation.x = Math.PI / 2;
        touch.position.z = 0.036;
        touch.userData.keyId = key.id;
        group.add(touch);
      }

      const stemLength = key.side === "left" || key.side === "right" ? 0.46 : 0.32;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(stemLength, 0.045, 0.045), keyMaterial);
      stem.position.x = key.side === "left" ? 0.22 : key.side === "right" ? -0.22 : 0.16;
      stem.userData.keyId = key.id;
      group.add(stem);
      model.add(group);
      keyGroups.set(key.id, group);
    }

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.9, 64),
      new THREE.MeshBasicMaterial({ color: 0x0e0e10, transparent: true, opacity: 0.72 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.22;
    scene.add(floor);
    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.32, 64),
      new THREE.MeshBasicMaterial({ color: 0x37333f, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = -3.21;
    scene.add(floorRing);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(Array.from(keyGroups.values()), true);
    };
    const findKeyId = (object: THREE.Object3D | undefined) => {
      let current = object;
      while (current) {
        if (current.userData.keyId) return current.userData.keyId as SaxKeyId;
        current = current.parent ?? undefined;
      }
      return null;
    };
    const onPointerMove = (event: PointerEvent) => {
      renderer.domElement.style.cursor = findKeyId(setPointer(event)[0]?.object) ? "pointer" : "grab";
    };
    const onPointerUp = (event: PointerEvent) => {
      const keyId = findKeyId(setPointer(event)[0]?.object);
      if (keyId) callbackRef.current(keyId);
    };
    const stopAutoRotate = () => { controls.autoRotate = false; };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerdown", stopAutoRotate);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let animationFrame = 0;
    const animate = () => {
      for (const [id, group] of keyGroups) {
        const active = activeRef.current.has(id);
        const material = group.userData.material as THREE.MeshStandardMaterial;
        material.color.lerp(active ? GOLD_ACTIVE : GOLD, 0.16);
        material.emissive.lerp(active ? EMISSIVE_ON : EMISSIVE_OFF, 0.16);
        const targetZ = (group.userData.baseZ as number) + (active ? -0.075 : 0);
        group.position.z += (targetZ - group.position.z) * 0.18;
      }
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerdown", stopAutoRotate);
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="saxophone-canvas" ref={containerRef} role="img" aria-label="Interactive three-dimensional alto saxophone with clickable keys">
      {webglUnavailable && (
        <div className="sax-lite-view">
          <span className="lite-label"><Rotate3D size={13} /> Interactive lite view</span>
          <div className="lite-sax" aria-hidden="true"><i className="lite-neck" /><i className="lite-body" /><i className="lite-bow" /><i className="lite-bell" /></div>
          {SAX_KEYS.map((key) => {
            const left = 50 + key.position[0] * 18;
            const top = 19 + (3 - key.position[1]) * 9.5;
            return <button key={key.id} className={`lite-key ${activeKeys.has(key.id) ? "is-active" : ""}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => onKeyToggle(key.id)} aria-label={key.name}><span>{key.short}</span></button>;
          })}
          <p>This browser cannot draw WebGL. Every fingering control still works.</p>
        </div>
      )}
    </div>
  );
}

export function SaxophoneLab({ onBack }: { onBack: () => void }) {
  const initialIndex = ALTO_FINGERINGS.findIndex((fingering) => fingering.id === "a4");
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [trainerMode, setTrainerMode] = useState<TrainerMode>("learn");
  const [activeKeys, setActiveKeys] = useState<Set<SaxKeyId>>(() => new Set(ALTO_FINGERINGS[initialIndex].keys));
  const [challenge, setChallenge] = useState<Fingering | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "retry">("idle");
  const [resetView, setResetView] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  const selected = ALTO_FINGERINGS[selectedIndex];
  const activeKeyDetails = SAX_KEYS.filter((key) => activeKeys.has(key.id));
  const concertMidi = writtenToConcert(selected.midi);
  const soundingHz = midiToFrequency(concertMidi);

  const chooseNote = useCallback((index: number) => {
    const wrapped = (index + ALTO_FINGERINGS.length) % ALTO_FINGERINGS.length;
    setSelectedIndex(wrapped);
    setActiveKeys(new Set(ALTO_FINGERINGS[wrapped].keys));
    setFeedback("idle");
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") chooseNote(selectedIndex + 1);
      if (event.key === "ArrowLeft") chooseNote(selectedIndex - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseNote, selectedIndex]);

  const toggleKey = useCallback((id: SaxKeyId) => {
    setActiveKeys((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (trainerMode === "learn") {
        const matchIndex = ALTO_FINGERINGS.findIndex((fingering) => sameKeys(next, fingering.keys));
        if (matchIndex >= 0) setSelectedIndex(matchIndex);
      }
      setFeedback("idle");
      return next;
    });
  }, [trainerMode]);

  const playTone = () => {
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const overtone = context.createOscillator();
    const overtoneGain = context.createGain();
    oscillator.type = "triangle";
    overtone.type = "sine";
    oscillator.frequency.value = soundingHz;
    overtone.frequency.value = soundingHz * 2;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.13, context.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.7);
    overtoneGain.gain.setValueAtTime(0.0001, context.currentTime);
    overtoneGain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.08);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.55);
    oscillator.connect(gain).connect(context.destination);
    overtone.connect(overtoneGain).connect(context.destination);
    oscillator.start(); overtone.start();
    oscillator.stop(context.currentTime + 1.75); overtone.stop(context.currentTime + 1.75);
  };

  const startChallenge = () => {
    const next = ALTO_FINGERINGS[Math.floor(Math.random() * 26) + 4];
    setTrainerMode("challenge");
    setChallenge(next);
    setSelectedIndex(ALTO_FINGERINGS.indexOf(next));
    setActiveKeys(new Set());
    setFeedback("idle");
  };

  const showAnswer = () => {
    const answer = challenge ?? selected;
    setActiveKeys(new Set(answer.keys));
    setFeedback("idle");
  };

  const checkChallenge = () => {
    if (!challenge) return;
    setFeedback(sameKeys(activeKeys, challenge.keys) ? "correct" : "retry");
  };

  const switchToLearn = () => {
    setTrainerMode("learn");
    setChallenge(null);
    setFeedback("idle");
    setActiveKeys(new Set(selected.keys));
  };

  const leftKeys = activeKeyDetails.filter((key) => key.hand === "Left");
  const rightKeys = activeKeyDetails.filter((key) => key.hand === "Right");

  return (
    <div className="sax-lab-view">
      <header className="lab-header">
        <div>
          <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Tuner</button>
          <p className="eyebrow">Sax lab · Interactive alto</p>
          <h1>Learn it with your hands.</h1>
          <p>Choose a written note or press the keys yourself. Drag to rotate; scroll or pinch to inspect.</p>
        </div>
        <div className="lab-mode-switch" aria-label="Trainer mode">
          <button className={trainerMode === "learn" ? "is-active" : ""} onClick={switchToLearn}><Eye size={15} /> Learn</button>
          <button className={trainerMode === "challenge" ? "is-active" : ""} onClick={startChallenge}><Shuffle size={15} /> Challenge</button>
        </div>
      </header>

      <div className="note-browser" aria-label="Written note selector">
        <button className="note-arrow" aria-label="Previous note" onClick={() => chooseNote(selectedIndex - 1)}><ChevronLeft size={18} /></button>
        <div className="note-scroll">
          {ALTO_FINGERINGS.map((fingering, index) => (
            <button
              key={fingering.id}
              className={index === selectedIndex ? "is-active" : ""}
              onClick={() => chooseNote(index)}
              aria-label={`${fingering.note} ${fingering.octave}`}
            >
              {fingering.note}<sup>{fingering.octave}</sup>
            </button>
          ))}
        </div>
        <button className="note-arrow" aria-label="Next note" onClick={() => chooseNote(selectedIndex + 1)}><ChevronRight size={18} /></button>
      </div>

      <div className="lab-workspace">
        <section className="model-stage">
          <div className="model-toolbar">
            <span><MousePointer2 size={14} /> Tap any key</span>
            <button onClick={() => setResetView((value) => value + 1)}><RefreshCw size={14} /> Reset view</button>
          </div>
          <SaxophoneModel activeKeys={activeKeys} onKeyToggle={toggleKey} resetView={resetView} />
          <div className="model-note-badge">
            <small>{trainerMode === "challenge" ? "Build this fingering" : "Written pitch"}</small>
            <strong>{selected.note}<sup>{selected.octave}</sup></strong>
            <span>{selected.level} register</span>
          </div>
          <div className="drag-hint"><Rotate3D size={15} /> Drag to orbit</div>
        </section>

        <aside className="fingering-panel">
          {trainerMode === "challenge" ? (
            <div className="challenge-head">
              <span className="panel-kicker"><Sparkles size={14} /> Finger memory</span>
              <h2>Build {selected.note}<sup>{selected.octave}</sup></h2>
              <p>Press the keys on the model, then check your answer.</p>
              {feedback === "correct" && <div className="answer-state correct"><Check size={17} /> That&apos;s it. Clean and correct.</div>}
              {feedback === "retry" && <div className="answer-state retry"><X size={17} /> Not yet. Compare your hands and try once more.</div>}
              <button className="challenge-button" onClick={checkChallenge}><Check size={17} /> Check fingering</button>
              <button className="reveal-button" onClick={showAnswer}><CircleHelp size={15} /> Show answer</button>
            </div>
          ) : (
            <>
              <div className="pitch-pair">
                <div><small>Written</small><strong>{selected.note}<sup>{selected.octave}</sup></strong></div>
                <ArrowRight size={18} />
                <div><small>Concert pitch</small><strong>{midiToName(concertMidi)}</strong></div>
              </div>
              <button className="tone-button" onClick={playTone}><Volume2 size={17} /> Hear {soundingHz.toFixed(1)} Hz</button>
              <div className="finger-hint"><Lightbulb size={16} /><p>{selected.hint}</p></div>
            </>
          )}

          <div className="pressed-section">
            <div className="pressed-heading"><span>Keys pressed</span><strong>{activeKeys.size}</strong></div>
            {activeKeys.size === 0 ? (
              <div className="open-fingering"><Hand size={18} /><span>Open fingering</span><small>All main keys stay lifted.</small></div>
            ) : (
              <div className="hand-columns">
                <KeyColumn title="Left hand" keys={leftKeys} />
                <KeyColumn title="Right hand" keys={rightKeys} />
              </div>
            )}
          </div>

          <div className="lab-tip"><Ear size={15} /><span><strong>Listen before you play.</strong> Hear the center, then match it.</span></div>
        </aside>
      </div>

      <div className="lab-footer-cards">
        <article><span><Wind size={16} /> Instrument truth</span><strong>E♭ transposition is handled everywhere.</strong><p>Written notes stay familiar; Bocal also shows what the room hears.</p></article>
        <article><span><Headphones size={16} /> Silent rehearsal</span><strong>Practise finger changes without the horn.</strong><p>Build muscle memory on the model, then transfer it to the instrument.</p></article>
        <article><span><MousePointer2 size={16} /> Free explore</span><strong>Every visible key is interactive.</strong><p>Tap the model to discover mechanisms and match common fingerings.</p></article>
      </div>
    </div>
  );
}

function KeyColumn({ title, keys }: { title: string; keys: typeof SAX_KEYS }) {
  return (
    <div className="key-column">
      <small>{title}</small>
      {keys.length === 0 ? <span className="no-key">—</span> : keys.map((key) => (
        <div className="key-chip" key={key.id}><i>{key.short}</i><span>{key.name}<small>{key.finger}</small></span></div>
      ))}
    </div>
  );
}
