"use client";

import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Ear,
  ExternalLink,
  Eye,
  Hand,
  Headphones,
  Info,
  Lightbulb,
  Link2,
  MousePointer2,
  Palette,
  RefreshCw,
  Rotate3D,
  Shuffle,
  Sparkles,
  Volume2,
  Wind,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { animateEducationalSaxKeys, buildEducationalAltoSaxophone } from "./alto-sax-model";
import {
  ALTO_FINGERINGS,
  midiToFrequency,
  midiToName,
  SAX_KEYS,
  SAX_MECHANICS,
  type Fingering,
  type FingeringOption,
  type SaxKeyId,
  writtenToConcert,
} from "./sax-data";
import {
  SAX_COLORWAYS,
  SAX_SETUP_PARTS,
  SETUP_FOUNDATION_SOURCE,
  type SaxColorway,
  type SetupPartId,
  type SetupVariant,
  type ToneProfile,
} from "./sax-setup-data";

type TrainerMode = "learn" | "challenge";

type FingeringChoice = {
  id: string;
  label: string;
  keys: SaxKeyId[];
  hint: string;
  useWhen?: string;
  isPrimary: boolean;
};

function sameKeys(left: Set<SaxKeyId>, right: SaxKeyId[]) {
  return left.size === right.length && right.every((key) => left.has(key));
}

function fingeringChoices(fingering: Fingering): FingeringChoice[] {
  return [
    {
      id: `${fingering.id}-primary`,
      label: fingering.primaryLabel ?? "Primary",
      keys: fingering.keys,
      hint: fingering.hint,
      isPrimary: true,
    },
    ...(fingering.alternates ?? []).map((alternate: FingeringOption) => ({
      ...alternate,
      isPrimary: false,
    })),
  ];
}

function hexColour(value: number) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function SaxophoneModel({
  activeKeys,
  onKeyToggle,
  resetView,
  colorway,
  showGuides,
}: {
  activeKeys: Set<SaxKeyId>;
  onKeyToggle: (id: SaxKeyId) => void;
  resetView: number;
  colorway: SaxColorway;
  showGuides: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeKeys);
  const callbackRef = useRef(onKeyToggle);
  const colorwayRef = useRef(colorway);
  const guideRef = useRef(showGuides);
  const applyColorwayRef = useRef<((next: SaxColorway) => void) | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => { activeRef.current = activeKeys; }, [activeKeys]);
  useEffect(() => { callbackRef.current = onKeyToggle; }, [onKeyToggle]);
  useEffect(() => { guideRef.current = showGuides; }, [showGuides]);
  useEffect(() => {
    colorwayRef.current = colorway;
    applyColorwayRef.current?.(colorway);
  }, [colorway]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(4.45, 0.82, 11.7);
    controlsRef.current.target.set(0.18, 0.3, 0);
    controlsRef.current.update();
  }, [resetView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0b0c, 0.026);
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(4.45, 0.82, 11.7);
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
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 7.2;
    controls.maxDistance = 16;
    controls.minPolarAngle = 0.42;
    controls.maxPolarAngle = Math.PI - 0.35;
    controls.target.set(0.18, 0.3, 0);
    controls.autoRotate = false;
    controls.update();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xd7d8ff, 0x16120b, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffefb0, 6.1);
    keyLight.position.set(-4, 7, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8e7bff, 4.2);
    rimLight.position.set(5, 2, -5);
    scene.add(rimLight);
    const cyanLight = new THREE.PointLight(0x08fed5, 20, 8, 2);
    cyanLight.position.set(-2, -1, 3);
    scene.add(cyanLight);

    const { model, mechanisms: keyGroups, applyColorway } = buildEducationalAltoSaxophone(colorwayRef.current);
    applyColorwayRef.current = applyColorway;
    scene.add(model);

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
    const hitTargets = Array.from(keyGroups.values()).flatMap((mechanism) => mechanism.hitTargets);
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(hitTargets, false);
    };
    const findKeyId = (object: THREE.Object3D | undefined) => object?.userData.keyId as SaxKeyId | undefined;
    const onPointerMove = (event: PointerEvent) => {
      renderer.domElement.style.cursor = findKeyId(setPointer(event)[0]?.object) ? "pointer" : "grab";
    };
    const onPointerUp = (event: PointerEvent) => {
      const keyId = findKeyId(setPointer(event)[0]?.object);
      if (keyId) callbackRef.current(keyId);
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

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
      animateEducationalSaxKeys(keyGroups, activeRef.current, guideRef.current);
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
      controls.dispose();
      renderer.dispose();
      applyColorwayRef.current = null;
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

  const fallbackStyle = {
    "--sax-body": hexColour(colorway.body),
    "--sax-body-hi": hexColour(colorway.bodyHighlight),
    "--sax-metal": hexColour(colorway.keywork),
    "--sax-metal-hi": hexColour(colorway.keyworkLight),
  } as CSSProperties;

  return (
    <div
      className="saxophone-canvas"
      ref={containerRef}
      role="img"
      aria-label="Interactive three-dimensional alto saxophone with separately marked finger contacts and linked pads"
      style={fallbackStyle}
    >
      {webglUnavailable && (
        <div className="sax-lite-view">
          <span className="lite-label"><Rotate3D size={13} /> Interactive lite view</span>
          <div className="lite-sax" aria-hidden="true">
            <i className="lite-mouthpiece" />
            <i className="lite-neck" />
            <i className="lite-body" />
            <i className="lite-bow" />
            <i className="lite-bell" />
            <i className="lite-bell-rim" />
            <i className="lite-rod lite-rod-left" />
            <i className="lite-rod lite-rod-right" />
            <i className="lite-brace" />
          </div>
          {SAX_KEYS.map((key) => {
            const left = 50 + key.position[0] * 18;
            const top = 19 + (3 - key.position[1]) * 9.5;
            return (
              <button
                key={key.id}
                className={`lite-key ${activeKeys.has(key.id) ? "is-active" : ""}`}
                style={{ left: `${left}%`, top: `${top}%` }}
                onClick={() => onKeyToggle(key.id)}
                aria-label={key.name}
              ><span>{key.short}</span></button>
            );
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
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [trainerMode, setTrainerMode] = useState<TrainerMode>("learn");
  const [activeKeys, setActiveKeys] = useState<Set<SaxKeyId>>(() => new Set(ALTO_FINGERINGS[initialIndex].keys));
  const [challenge, setChallenge] = useState<Fingering | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "retry">("idle");
  const [resetView, setResetView] = useState(0);
  const [showGuides, setShowGuides] = useState(true);
  const [colorwayId, setColorwayId] = useState(SAX_COLORWAYS[0].id);
  const [setupPartId, setSetupPartId] = useState<SetupPartId>("reed");
  const [comparisonIds, setComparisonIds] = useState<string[]>(["reed-signature", "reed-french"]);
  const [demoPlaying, setDemoPlaying] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const selected = ALTO_FINGERINGS[selectedIndex];
  const choices = fingeringChoices(selected);
  const selectedChoice = choices[Math.min(choiceIndex, choices.length - 1)];
  const colorway = SAX_COLORWAYS.find((candidate) => candidate.id === colorwayId) ?? SAX_COLORWAYS[0];
  const setupPart = SAX_SETUP_PARTS.find((part) => part.id === setupPartId) ?? SAX_SETUP_PARTS[0];
  const activeKeyDetails = SAX_KEYS.filter((key) => activeKeys.has(key.id));
  const concertMidi = writtenToConcert(selected.midi);
  const soundingHz = midiToFrequency(concertMidi);

  const getAudioContext = useCallback(async () => {
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    if (context.state === "suspended") await context.resume();
    return context;
  }, []);

  useEffect(() => () => { void audioRef.current?.close(); }, []);

  const chooseChoice = useCallback((fingering: Fingering, index: number) => {
    const nextChoice = fingeringChoices(fingering)[index] ?? fingeringChoices(fingering)[0];
    setChoiceIndex(index);
    setActiveKeys(new Set(nextChoice.keys));
    setFeedback("idle");
  }, []);

  const chooseNote = useCallback((index: number) => {
    const wrapped = (index + ALTO_FINGERINGS.length) % ALTO_FINGERINGS.length;
    const next = ALTO_FINGERINGS[wrapped];
    setSelectedIndex(wrapped);
    chooseChoice(next, 0);
  }, [chooseChoice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") chooseNote(selectedIndex + 1);
      if (event.key === "ArrowLeft") chooseNote(selectedIndex - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseNote, selectedIndex]);

  const findMatch = useCallback((next: Set<SaxKeyId>) => {
    for (let fingeringIndex = 0; fingeringIndex < ALTO_FINGERINGS.length; fingeringIndex += 1) {
      const options = fingeringChoices(ALTO_FINGERINGS[fingeringIndex]);
      const optionIndex = options.findIndex((option) => sameKeys(next, option.keys));
      if (optionIndex >= 0) return { fingeringIndex, optionIndex };
    }
    return null;
  }, []);

  const toggleKey = useCallback((id: SaxKeyId) => {
    setActiveKeys((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (trainerMode === "learn") {
        const match = findMatch(next);
        if (match) {
          setSelectedIndex(match.fingeringIndex);
          setChoiceIndex(match.optionIndex);
        }
      }
      setFeedback("idle");
      return next;
    });
  }, [findMatch, trainerMode]);

  const playTone = async () => {
    const context = await getAudioContext();
    const now = context.currentTime;
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.11, now + 0.06);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
    filter.connect(master).connect(context.destination);
    [1, 2, 3].forEach((multiple, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.value = soundingHz * multiple;
      gain.gain.value = [0.72, 0.2, 0.08][index];
      oscillator.connect(gain).connect(filter);
      oscillator.start(now);
      oscillator.stop(now + 1.7);
    });
  };

  const playCharacterDemo = async (id: string, profile: ToneProfile) => {
    const context = await getAudioContext();
    const now = context.currentTime;
    const duration = 1.45;
    const attack = 0.045 + (1 - profile.response) * 0.13 + profile.resistance * 0.035;
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7 + profile.projection * 1.4;
    filter.frequency.setValueAtTime(1150 + profile.brightness * 3700, now);
    const peak = 0.085;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(peak, now + attack);
    master.gain.setValueAtTime(peak * (0.9 + profile.projection * 0.1), now + duration - 0.28);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    filter.connect(master).connect(context.destination);

    const weights = [1, 0.36 + profile.brightness * 0.22, 0.17 + profile.brightness * 0.25, 0.08 + profile.brightness * 0.2, 0.04 + profile.brightness * 0.14];
    const normalizer = weights.reduce((sum, weight) => sum + weight, 0);
    weights.forEach((weight, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 220 * (index + 1);
      oscillator.detune.value = index > 0 ? (index % 2 === 0 ? 1.5 : -1.5) : 0;
      gain.gain.value = weight / normalizer;
      oscillator.connect(gain).connect(filter);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    });

    setDemoPlaying(id);
    window.setTimeout(() => setDemoPlaying((current) => current === id ? null : current), duration * 1000);
  };

  const startChallenge = () => {
    const next = ALTO_FINGERINGS[Math.floor(Math.random() * (ALTO_FINGERINGS.length - 4)) + 4];
    setTrainerMode("challenge");
    setChallenge(next);
    setSelectedIndex(ALTO_FINGERINGS.indexOf(next));
    setChoiceIndex(0);
    setActiveKeys(new Set());
    setFeedback("idle");
  };

  const showAnswer = () => {
    const answer = challenge ?? selected;
    setChoiceIndex(0);
    setActiveKeys(new Set(answer.keys));
    setFeedback("idle");
  };

  const checkChallenge = () => {
    if (!challenge) return;
    const validChoices = fingeringChoices(challenge);
    setFeedback(validChoices.some((choice) => sameKeys(activeKeys, choice.keys)) ? "correct" : "retry");
  };

  const switchToLearn = () => {
    setTrainerMode("learn");
    setChallenge(null);
    setFeedback("idle");
    setActiveKeys(new Set(selectedChoice.keys));
  };

  const selectSetupPart = (partId: SetupPartId) => {
    setSetupPartId(partId);
    const nextPart = SAX_SETUP_PARTS.find((part) => part.id === partId);
    setComparisonIds(nextPart?.variants.slice(0, 2).map((variant) => variant.id) ?? []);
  };

  const toggleComparison = (variantId: string) => {
    setComparisonIds((current) => {
      if (current.includes(variantId)) return current.filter((id) => id !== variantId);
      if (current.length < 2) return [...current, variantId];
      return [current[1], variantId];
    });
  };

  const leftKeys = activeKeyDetails.filter((key) => key.hand === "Left");
  const rightKeys = activeKeyDetails.filter((key) => key.hand === "Right");
  const linkedPadCount = activeKeyDetails.reduce((total, key) => total + SAX_MECHANICS[key.id].linkedPads.length, 0);

  return (
    <div className="sax-lab-view">
      <header className="lab-header">
        <div>
          <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Tuner</button>
          <p className="eyebrow">Sax lab · Validated interactive alto</p>
          <h1>See the touch. Follow the mechanism.</h1>
          <p>Choose a written note or operate the touch-pieces yourself. Cyan fill means finger contact; outlined pads are linked outputs.</p>
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

      <div className="colourway-quickbar">
        <span><Palette size={14} /> Instrument colourway</span>
        <div>
          {SAX_COLORWAYS.map((candidate) => (
            <button
              key={candidate.id}
              className={candidate.id === colorway.id ? "is-active" : ""}
              onClick={() => setColorwayId(candidate.id)}
              title={candidate.name}
              aria-label={`Use ${candidate.name} colourway`}
            >
              <i style={{ background: `linear-gradient(135deg, ${hexColour(candidate.body)} 0 56%, ${hexColour(candidate.keyworkLight)} 57%)` }} />
              <b>{candidate.name}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="lab-workspace">
        <section className="model-stage">
          <div className="model-toolbar">
            <span><MousePointer2 size={14} /> Tap the touch, not the cup</span>
            <div>
              <button aria-label={`${showGuides ? "Hide" : "Show"} fingertip guides`} aria-pressed={showGuides} className={showGuides ? "is-active" : ""} onClick={() => setShowGuides((value) => !value)}><Hand size={14} /> Fingertips {showGuides ? "on" : "off"}</button>
              <button aria-label="Reset saxophone view" onClick={() => setResetView((value) => value + 1)}><RefreshCw size={14} /> Reset view</button>
            </div>
          </div>
          <SaxophoneModel
            activeKeys={activeKeys}
            onKeyToggle={toggleKey}
            resetView={resetView}
            colorway={colorway}
            showGuides={showGuides}
          />
          <div className="model-note-badge">
            <small>{trainerMode === "challenge" ? "Build this fingering" : "Written pitch"}</small>
            <strong>{selected.note}<sup>{selected.octave}</sup></strong>
            <span>{selected.level} register</span>
          </div>
          <div className="model-legend" aria-label="Model legend">
            <span><i className="legend-touch" /> Finger here</span>
            <span><i className="legend-pad" /> Linked pad</span>
            <span><i className="legend-metal" /> Keywork</span>
          </div>
          <div className="model-accuracy-label">Pedagogical mechanism map · Yamaha-system fingering baseline · not service CAD</div>
          <div className="drag-hint"><Rotate3D size={15} /> Drag to orbit</div>
        </section>

        <aside className="fingering-panel">
          {trainerMode === "challenge" ? (
            <div className="challenge-head">
              <span className="panel-kicker"><Sparkles size={14} /> Finger memory</span>
              <h2>Build {selected.note}<sup>{selected.octave}</sup></h2>
              <p>Primary or validated alternate fingerings are accepted.</p>
              {feedback === "correct" && <div className="answer-state correct"><Check size={17} /> That&apos;s it. Clean and correct.</div>}
              {feedback === "retry" && <div className="answer-state retry"><X size={17} /> Not yet. Compare fingertip targets and try once more.</div>}
              <button className="challenge-button" onClick={checkChallenge}><Check size={17} /> Check fingering</button>
              <button className="reveal-button" onClick={showAnswer}><CircleHelp size={15} /> Show primary</button>
            </div>
          ) : (
            <>
              <div className="pitch-pair">
                <div><small>Written</small><strong>{selected.note}<sup>{selected.octave}</sup></strong></div>
                <ArrowRight size={18} />
                <div><small>Concert pitch</small><strong>{midiToName(concertMidi)}</strong></div>
              </div>

              {choices.length > 1 && (
                <div className="fingering-choices" aria-label="Primary and alternate fingerings">
                  <small>Fingering route</small>
                  <div>
                    {choices.map((choice, index) => (
                      <button
                        key={choice.id}
                        className={index === choiceIndex ? "is-active" : ""}
                        onClick={() => chooseChoice(selected, index)}
                      >{choice.label}</button>
                    ))}
                  </div>
                  {selectedChoice.useWhen && <p><Info size={13} /> {selectedChoice.useWhen}</p>}
                </div>
              )}

              <button className="tone-button" onClick={() => void playTone()}><Volume2 size={17} /> Hear {soundingHz.toFixed(1)} Hz</button>
              <div className="finger-hint"><Lightbulb size={16} /><p>{selectedChoice.hint}</p></div>
            </>
          )}

          <div className="pressed-section">
            <div className="pressed-heading"><span>Finger contacts</span><strong>{activeKeys.size}</strong></div>
            {activeKeys.size === 0 ? (
              <div className="open-fingering"><Hand size={18} /><span>Open fingering</span><small>No player touch-piece is pressed.</small></div>
            ) : (
              <div className="hand-columns">
                <KeyColumn title="Left hand" keys={leftKeys} />
                <KeyColumn title="Right hand" keys={rightKeys} />
              </div>
            )}
          </div>

          {activeKeys.size > 0 && (
            <details className="linked-pad-trace" open>
              <summary><Link2 size={14} /> Linked pad trace <span>{linkedPadCount}</span></summary>
              <div>
                {activeKeyDetails.map((key) => {
                  const mechanic = SAX_MECHANICS[key.id];
                  return (
                    <article key={key.id}>
                      <i>{key.short}</i>
                      <div>
                        <strong>{key.name}</strong>
                        <span>{mechanic.linkedPads.map((pad) => `${pad.motion === "opens" ? "Opens" : "Closes"} ${pad.name}${pad.condition ? ` (${pad.condition})` : ""}`).join(" · ")}</span>
                        <small>{mechanic.explanation}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
          )}

          <div className="lab-tip"><Ear size={15} /><span><strong>Read the encoding literally.</strong> Solid cyan is a fingertip target. A cyan ring is linked motion only.</span></div>
        </aside>
      </div>

      <SetupExplorer
        selectedPartId={setupPartId}
        selectedPart={setupPart}
        onPartSelect={selectSetupPart}
        colorway={colorway}
        onColorwaySelect={setColorwayId}
        comparisonIds={comparisonIds}
        onComparisonToggle={toggleComparison}
        onDemo={(variant) => void playCharacterDemo(variant.id, variant.tone)}
        demoPlaying={demoPlaying}
      />

      <div className="lab-footer-cards">
        <article><span><Wind size={16} /> Instrument truth</span><strong>Inputs and outputs are no longer conflated.</strong><p>Finger contacts fill cyan; linked cups keep their metal finish and receive a thin ring.</p></article>
        <article><span><Headphones size={16} /> Setup literacy</span><strong>Compare what a variant changes — and what it does not.</strong><p>Manufacturer claims are labelled, compatibility caveats stay visible, and colour is not assigned imaginary tone.</p></article>
        <article><span><MousePointer2 size={16} /> Validated routes</span><strong>Primary and Yamaha-chart alternates are explicit.</strong><p>Front E and F show the touch-pieces the finger actually contacts, including their linked B-pad state.</p></article>
      </div>
    </div>
  );
}

function SetupExplorer({
  selectedPartId,
  selectedPart,
  onPartSelect,
  colorway,
  onColorwaySelect,
  comparisonIds,
  onComparisonToggle,
  onDemo,
  demoPlaying,
}: {
  selectedPartId: SetupPartId;
  selectedPart: (typeof SAX_SETUP_PARTS)[number];
  onPartSelect: (id: SetupPartId) => void;
  colorway: SaxColorway;
  onColorwaySelect: (id: string) => void;
  comparisonIds: string[];
  onComparisonToggle: (id: string) => void;
  onDemo: (variant: SetupVariant) => void;
  demoPlaying: string | null;
}) {
  const compared = useMemo(
    () => selectedPart.variants.filter((variant) => comparisonIds.includes(variant.id)),
    [comparisonIds, selectedPart.variants],
  );

  return (
    <section className="setup-explorer">
      <header>
        <div>
          <p className="eyebrow">Build your setup</p>
          <h2>Select a part. Understand the trade-off.</h2>
          <p>Explore the assembly from finish to reed, compare two variants, and hear an equal-loudness illustrative character demo where sound is relevant.</p>
        </div>
        <a href={SETUP_FOUNDATION_SOURCE} target="_blank" rel="noreferrer">Selection foundation <ExternalLink size={13} /></a>
      </header>

      <nav className="setup-part-tabs" aria-label="Saxophone setup parts">
        {SAX_SETUP_PARTS.map((part) => (
          <button key={part.id} className={selectedPartId === part.id ? "is-active" : ""} onClick={() => onPartSelect(part.id)}>
            <span>{part.label}</span><small>{part.shortDescription}</small>
          </button>
        ))}
      </nav>

      <div className="setup-part-intro">
        <div><strong>What it changes</strong><p>{selectedPart.explainer}</p></div>
        <div><Info size={16} /><p>{selectedPart.caveat}</p></div>
      </div>

      {selectedPartId === "finish" ? (
        <div className="finish-grid">
          {SAX_COLORWAYS.map((candidate) => (
            <button key={candidate.id} className={candidate.id === colorway.id ? "is-active" : ""} onClick={() => onColorwaySelect(candidate.id)}>
              <span style={{ background: `linear-gradient(135deg, ${hexColour(candidate.body)} 0 58%, ${hexColour(candidate.keyworkLight)} 59%)` }} />
              <div><strong>{candidate.name}</strong><small>{candidate.description}</small></div>
              {candidate.id === colorway.id && <Check size={16} />}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="compare-status">
            <span><AudioLines size={15} /> A/B comparison</span>
            <p>{compared.length === 2 ? `${compared[0].name} vs ${compared[1].name}` : "Select two variants to compare."}</p>
            <small>Bars are directional summaries, not measurements.</small>
          </div>
          <div className="variant-grid">
            {selectedPart.variants.map((variant) => (
              <SetupVariantCard
                key={variant.id}
                variant={variant}
                selected={comparisonIds.includes(variant.id)}
                onToggle={() => onComparisonToggle(variant.id)}
                onDemo={() => onDemo(variant)}
                playing={demoPlaying === variant.id}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SetupVariantCard({
  variant,
  selected,
  onToggle,
  onDemo,
  playing,
}: {
  variant: SetupVariant;
  selected: boolean;
  onToggle: () => void;
  onDemo: () => void;
  playing: boolean;
}) {
  return (
    <article className={`variant-card ${selected ? "is-compared" : ""}`}>
      <header>
        <div><small>{variant.eyebrow}</small><h3>{variant.name}</h3></div>
        <button className="compare-toggle" onClick={onToggle} aria-pressed={selected}>{selected ? <Check size={14} /> : "+"} {selected ? "Comparing" : "Compare"}</button>
      </header>
      <p>{variant.summary}</p>
      {variant.facts && <ul>{variant.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>}
      <div className="attribute-stack">
        {variant.attributes.map((attribute) => (
          <div className="attribute-row" key={attribute.label}>
            <div><strong>{attribute.label}</strong><span>{attribute.low}</span><span>{attribute.high}</span></div>
            <i><b style={{ width: `${attribute.value}%` }} /></i>
          </div>
        ))}
      </div>
      <div className="variant-use"><Lightbulb size={14} /><p>{variant.useCase}</p></div>
      <footer>
        <button onClick={onDemo}><Volume2 size={14} /> {playing ? "Playing…" : "Illustrative demo"}</button>
        <a href={variant.sourceUrl} target="_blank" rel="noreferrer">{variant.evidence} <ExternalLink size={11} /></a>
      </footer>
    </article>
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
