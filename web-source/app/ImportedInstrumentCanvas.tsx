"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  DEFAULT_HIGHLIGHT,
  ENVIRONMENTS,
  OBOE_KEY_FINISHES,
  OBOE_WOOD_TYPES,
  SAX_BODY_FINISHES,
  SAX_KEYWORK_FINISHES,
  SAX_LIGATURE_OPTIONS,
  SAX_MOUTHPIECE_OPTIONS,
  classifyOboePart,
  classifySaxPart,
  type ModelId,
  type ModelLook,
} from "./model-looks";

export type InstrumentViewId = "front" | "left" | "right" | "back";

export type FingeringMarker = {
  id: string;
  short: string;
  name: string;
  position: [number, number, number];
  side?: "left" | "right" | "back";
  hand?: "Left" | "Right";
  finger?: string;
};

type MarkerVisual = {
  marker: FingeringMarker;
  group: THREE.Group;
  contactMaterial: THREE.MeshStandardMaterial;
  ringMaterial: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  haloMaterial: THREE.SpriteMaterial;
  halo: THREE.Sprite;
};

const EMPTY_FINGERING_MARKERS: readonly FingeringMarker[] = Object.freeze([]);

const VIEW_POSITIONS: Record<InstrumentViewId, [number, number, number]> = {
  front: [0, 0.2, 12.2],
  left: [-10.2, 0.2, 6.8],
  right: [10.2, 0.2, 6.8],
  back: [0, 0.2, -12.2],
};

const PLAYER_POV_POSITION: [number, number, number] = [0, -1.6, 4.4];

function cleanPartName(name: string) {
  return name
    .replace(/_My_Oboe_0$/i, "")
    .replace(/^Object_\d+$/i, "Instrument surface")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markerBelongsInView(marker: FingeringMarker, view: InstrumentViewId) {
  if (view === "back") return marker.side === "back";
  if (view === "left") return marker.side !== "right" && marker.side !== "back";
  if (view === "right") return marker.side !== "left" && marker.side !== "back";
  return marker.side !== "back";
}

/** Ancestor chain (immediate parent first) up to the model root, by name. */
function ancestorNames(object: THREE.Object3D, root: THREE.Object3D | null, limit = 6): string[] {
  const names: string[] = [];
  let current: THREE.Object3D | null = object.parent;
  let steps = 0;
  while (current && steps < limit) {
    names.push(current.name);
    if (current === root) break;
    current = current.parent;
    steps += 1;
  }
  return names;
}

export function classifyInstrumentPart(name: string, ancestors: string[] = []) {
  if (ancestors.includes("Moving")) return "Key / lever (moves)";
  if (ancestors.includes("Static")) return "Post, pillar or spring (fixed)";
  if (ancestors.includes("Oboe_Base")) return "Body";
  const value = name.toLowerCase();
  if (value.includes("padandrod") || value.includes("pad and rod")) return "Key and pad assembly";
  if (value.includes("spring")) return "Spring";
  if (value.includes("rodoutcap") || value.includes("cap")) return "Rod cap";
  if (value.includes("rod")) return "Rod / axle";
  if (value.includes("key")) return "Keywork";
  if (value.includes("oboe_base") || value.includes("oboe base") || value === "oboe") return "Instrument body";
  return "Instrument component";
}

/**
 * The pre-look default material: a single legible "bronze study" finish
 * (body vs. keywork) used before a ModelLook is applied, and as the
 * fallback whenever a mesh cannot be classified. `0xd7a94d` (keywork) and
 * `0xa66d2d` (body) are the honest, unmodified reference colours -- kept as
 * literal defaults here rather than only in model-looks.ts so the rendering
 * layer always has a legible fallback with no external data dependency.
 */
function bronzeStudyMaterial(meshName: string, source: THREE.Material) {
  const signature = `${meshName} ${source.name}`.toLowerCase();
  const namedKeywork = /(key|rod|spring|lever|cap|ring|guard|brace|pad|pearl|metal)/.test(signature);
  const sourceColor = "color" in source && source.color instanceof THREE.Color ? source.color : null;
  const sourceLuminance = sourceColor
    ? sourceColor.r * 0.2126 + sourceColor.g * 0.7152 + sourceColor.b * 0.0722
    : 0;
  const isKeywork = namedKeywork || sourceLuminance > 0.42;
  const material = new THREE.MeshPhysicalMaterial({
    color: isKeywork ? 0xd7a94d : 0xa66d2d,
    emissive: isKeywork ? 0x241404 : 0x170b02,
    emissiveIntensity: isKeywork ? 0.12 : 0.08,
    metalness: isKeywork ? 0.88 : 0.76,
    roughness: isKeywork ? 0.24 : 0.36,
    clearcoat: 0.58,
    clearcoatRoughness: 0.28,
    side: source.side,
  });
  material.name = `Bocal bronze study · ${source.name || meshName || "instrument"}`;
  material.userData.bocalBronzeStudy = true;
  return material;
}

function saxLookMaterial(meshName: string, source: THREE.Material, look: ModelLook) {
  const role = classifySaxPart(meshName);
  const body = SAX_BODY_FINISHES.find((f) => f.id === look.bodyFinish) ?? SAX_BODY_FINISHES[0];
  const keywork = SAX_KEYWORK_FINISHES.find((f) => f.id === look.keyworkFinish) ?? SAX_KEYWORK_FINISHES[0];
  const mouthpiece = SAX_MOUTHPIECE_OPTIONS.find((m) => m.id === look.mouthpiece) ?? SAX_MOUTHPIECE_OPTIONS[0];
  const ligature = SAX_LIGATURE_OPTIONS.find((l) => l.id === look.ligature) ?? SAX_LIGATURE_OPTIONS[0];

  let color = body.body;
  let metalness = 0.76;
  let roughness = 0.36;
  if (role === "keywork") {
    color = keywork.keywork;
    metalness = keywork.id === "black-nickel" ? 0.7 : 0.9;
    roughness = keywork.id === "black-nickel" ? 0.35 : 0.2;
  } else if (role === "mouthpiece") {
    color = mouthpiece.color;
    metalness = mouthpiece.metallic ? 0.85 : 0.05;
    roughness = mouthpiece.metallic ? 0.25 : 0.55;
  } else if (role === "ligature") {
    color = ligature.color;
    metalness = 0.82;
    roughness = 0.24;
  }

  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    side: source.side,
  });
  material.name = `Bocal look · ${role} · ${meshName}`;
  material.userData.bocalLookRole = role;
  return material;
}

async function oboeLookMaterial(
  meshName: string,
  source: THREE.MeshStandardMaterial,
  ancestors: string[],
  look: ModelLook,
  parser: { getDependency: (type: string, index: number) => Promise<unknown> } | null,
  goldTextureCache: { current: THREE.Texture | null | undefined },
) {
  const role = classifyOboePart(ancestors);
  const wood = OBOE_WOOD_TYPES.find((w) => w.id === look.bodyFinish) ?? OBOE_WOOD_TYPES[0];
  const keyFinish = OBOE_KEY_FINISHES.find((k) => k.id === look.keyworkFinish) ?? OBOE_KEY_FINISHES[0];

  const material = new THREE.MeshStandardMaterial({
    map: source.map ?? null,
    normalMap: source.normalMap ?? null,
    roughnessMap: source.roughnessMap ?? null,
    metalnessMap: source.metalnessMap ?? null,
    metalness: role === "keywork" ? 0.85 : 0.15,
    roughness: role === "keywork" ? 0.32 : 0.55,
    side: source.side,
  });

  if (role === "body") {
    material.color.setHex(wood.tint);
  } else if (keyFinish.useGoldTexture) {
    if (goldTextureCache.current === undefined && parser) {
      try {
        goldTextureCache.current = (await parser.getDependency("texture", 3)) as THREE.Texture;
      } catch {
        goldTextureCache.current = null;
      }
    }
    if (goldTextureCache.current) {
      material.map = goldTextureCache.current;
      material.color.setHex(0xffffff);
    } else {
      material.color.setHex(0xc8922f);
    }
  } else {
    material.color.setHex(keyFinish.tint);
  }
  material.name = `Bocal look · ${role} · ${meshName}`;
  material.userData.bocalLookRole = role;
  return material;
}

export function ImportedInstrumentCanvas({
  src,
  label,
  viewPreset,
  resetView,
  inspectParts = false,
  onPartSelect,
  isolateRootName,
  fingeringMarkers = EMPTY_FINGERING_MARKERS,
  activeMarkerIds,
  showFingeringGuides = false,
  onMarkerToggle,
  modelId,
  look,
}: {
  src: string;
  label: string;
  viewPreset: InstrumentViewId;
  resetView: number;
  inspectParts?: boolean;
  onPartSelect?: (part: { name: string; category: string } | null) => void;
  isolateRootName?: string;
  fingeringMarkers?: readonly FingeringMarker[];
  activeMarkerIds?: ReadonlySet<string>;
  showFingeringGuides?: boolean;
  onMarkerToggle?: (id: string) => void;
  modelId?: ModelId;
  look?: ModelLook;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const markerVisualsRef = useRef<Map<string, MarkerVisual>>(new Map());
  const markerToggleRef = useRef(onMarkerToggle);
  const partSelectRef = useRef(onPartSelect);
  const activeMarkerIdsRef = useRef(activeMarkerIds);
  const showFingeringGuidesRef = useRef(showFingeringGuides);
  const viewPresetRef = useRef(viewPreset);
  const lookRef = useRef(look);
  const needsRenderRef = useRef(true);
  const applyLookRef = useRef<(() => void) | null>(null);
  const applyEnvironmentRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-webgl">("loading");

  useEffect(() => { markerToggleRef.current = onMarkerToggle; }, [onMarkerToggle]);
  useEffect(() => { partSelectRef.current = onPartSelect; }, [onPartSelect]);

  useEffect(() => {
    activeMarkerIdsRef.current = activeMarkerIds;
    showFingeringGuidesRef.current = showFingeringGuides;
    viewPresetRef.current = viewPreset;
    const highlight = lookRef.current?.highlight ?? DEFAULT_HIGHLIGHT;
    markerVisualsRef.current.forEach((visual, id) => {
      const active = activeMarkerIds?.has(id) ?? false;
      visual.group.visible = (active || showFingeringGuides) && markerBelongsInView(visual.marker, viewPreset);
      visual.group.scale.setScalar(active ? 1.04 : 0.72);
      visual.contactMaterial.color.setHex(active ? highlight : 0x2a261d);
      visual.contactMaterial.emissive.setHex(active ? highlight : 0x000000);
      visual.contactMaterial.emissiveIntensity = active ? 2.4 : 0;
      visual.contactMaterial.opacity = active ? 0.92 : 0.18;
      visual.ringMaterial.color.setHex(active ? highlight : 0xc99837);
      visual.ringMaterial.opacity = active ? 1 : 0.36;
      visual.haloMaterial.opacity = active ? 0.72 : 0.08;
      visual.halo.scale.setScalar(active ? 0.74 : 0.42);
    });
    needsRenderRef.current = true;
  }, [activeMarkerIds, showFingeringGuides, viewPreset, look?.highlight]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    let position = VIEW_POSITIONS[viewPreset];
    if (look?.cameraPreset === "mirrored") position = [-position[0], position[1], position[2]];
    if (look?.cameraPreset === "player-pov") position = PLAYER_POV_POSITION;
    cameraRef.current.position.set(...position);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
    needsRenderRef.current = true;
  }, [resetView, viewPreset, look?.cameraPreset]);

  // Apply look (finish/keywork/mouthpiece/ligature/exploded) to the already
  // loaded model in place -- never remounts the renderer.
  useEffect(() => {
    lookRef.current = look;
    applyLookRef.current?.();
    needsRenderRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow: only re-applies material work when a material-affecting field changes, not on every look identity change (environment/background/cameraPreset/highlight are handled by their own effects).
  }, [look?.bodyFinish, look?.keyworkFinish, look?.mouthpiece, look?.ligature, look?.exploded]);

  useEffect(() => {
    applyEnvironmentRef.current?.();
    needsRenderRef.current = true;
  }, [look?.environment]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(...VIEW_POSITIONS.front);
    cameraRef.current = camera;

    const canvas = document.createElement("canvas");
    const contextOptions = { antialias: true, alpha: true, powerPreference: "high-performance" as const };
    let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      context = canvas.getContext("webgl2", contextOptions) as WebGL2RenderingContext | null;
      context ??= canvas.getContext("webgl", contextOptions) as WebGLRenderingContext | null;
    } catch {
      context = null;
    }
    if (!context) {
      const fallbackTimer = window.setTimeout(() => setStatus("no-webgl"), 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const baseExposure = 1.82;
    renderer.toneMappingExposure = baseExposure;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    const envMap = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
    scene.environment = envMap;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 7.1;
    controls.maxDistance = 17;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;
    controls.addEventListener("change", () => { needsRenderRef.current = true; });

    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    scene.add(new THREE.HemisphereLight(0xf7f6ff, 0x33291c, 4.4));
    const keyLight = new THREE.DirectionalLight(0xffefc4, 8.2);
    keyLight.position.set(-4, 7, 7);
    scene.add(keyLight);
    const frontFill = new THREE.DirectionalLight(0xf7f3ff, 5.6);
    frontFill.position.set(0, 0.8, 8);
    scene.add(frontFill);
    const rimLight = new THREE.DirectionalLight(0x8e7bff, 5.1);
    rimLight.position.set(5, 2, -6);
    scene.add(rimLight);
    const highlightAtMount = lookRef.current?.highlight ?? DEFAULT_HIGHLIGHT;
    const cyanLight = new THREE.PointLight(highlightAtMount, 16, 9, 2);
    cyanLight.position.set(-2.5, -1.8, 3.2);
    scene.add(cyanLight);

    applyEnvironmentRef.current = () => {
      const envId = lookRef.current?.environment ?? "studio";
      const environment = ENVIRONMENTS.find((e) => e.id === envId) ?? ENVIRONMENTS[0];
      keyLight.color.setHex(environment.lightTint);
      frontFill.color.setHex(environment.lightTint);
      renderer.toneMappingExposure = baseExposure * environment.exposureScale;
      const background = lookRef.current?.background ?? "dark";
      container.dataset.modelBackground = background;
    };
    applyEnvironmentRef.current();

    const markerVisuals = new Map<string, MarkerVisual>();
    const markerHitTargets: THREE.Mesh[] = [];
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext("2d");
    if (glowContext) {
      const gradient = glowContext.createRadialGradient(64, 64, 3, 64, 64, 64);
      gradient.addColorStop(0, "rgba(8,254,213,1)");
      gradient.addColorStop(0.24, "rgba(8,254,213,.58)");
      gradient.addColorStop(0.58, "rgba(8,254,213,.16)");
      gradient.addColorStop(1, "rgba(8,254,213,0)");
      glowContext.fillStyle = gradient;
      glowContext.fillRect(0, 0, 128, 128);
    }
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    for (const marker of fingeringMarkers) {
      const active = activeMarkerIdsRef.current?.has(marker.id) ?? false;
      const highlight = lookRef.current?.highlight ?? DEFAULT_HIGHLIGHT;
      const group = new THREE.Group();
      group.position.set(...marker.position);
      group.visible = (active || showFingeringGuidesRef.current) && markerBelongsInView(marker, viewPresetRef.current);

      const contactMaterial = new THREE.MeshStandardMaterial({
        color: active ? highlight : 0x2a261d,
        emissive: active ? highlight : 0x000000,
        emissiveIntensity: active ? 2.4 : 0,
        metalness: 0.08,
        roughness: 0.25,
        transparent: true,
        opacity: active ? 0.92 : 0.18,
        depthTest: false,
      });
      const contact = new THREE.Mesh(new THREE.SphereGeometry(0.1, 22, 14), contactMaterial);
      contact.scale.set(1, 1, 0.55);
      contact.renderOrder = 20;
      group.add(contact);

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: active ? highlight : 0xc99837,
        transparent: true,
        opacity: active ? 0.98 : 0.44,
        depthTest: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 10, 34), ringMaterial);
      ring.renderOrder = 21;
      group.add(ring);

      const haloMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: highlight,
        transparent: true,
        opacity: active ? 0.72 : 0.08,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Sprite(haloMaterial);
      halo.scale.setScalar(active ? 0.74 : 0.42);
      halo.renderOrder = 19;
      group.add(halo);

      const hitTarget = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitTarget.userData.fingeringId = marker.id;
      group.add(hitTarget);
      markerHitTargets.push(hitTarget);

      group.scale.setScalar(active ? 1.04 : 0.72);
      scene.add(group);
      markerVisuals.set(marker.id, { marker, group, contactMaterial, ringMaterial, ring, haloMaterial, halo });
    }
    markerVisualsRef.current = markerVisuals;

    let disposed = false;
    let importedRoot: THREE.Object3D | null = null;
    let selectionBox: THREE.BoxHelper | null = null;
    const explodableMeshes: THREE.Mesh[] = [];
    const goldTextureCache: { current: THREE.Texture | null | undefined } = { current: undefined };
    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        if (disposed) return;
        importedRoot = isolateRootName ? gltf.scene.getObjectByName(isolateRootName) ?? gltf.scene : gltf.scene;
        const root = importedRoot;
        // P0 fix: reparent with scene.attach() (preserves matrixWorld) BEFORE
        // measuring, so ancestor scale/rotation the isolated node relied on
        // (e.g. the oboe FBX's 0.01 scale) is baked into its transform
        // rather than silently dropped by a later scene.add(). Normalising
        // on the largest extent (not always .y) protects a future
        // horizontally-authored import from the same class of bug.
        scene.attach(root);
        const firstBox = new THREE.Box3().setFromObject(root);
        const size = firstBox.getSize(new THREE.Vector3());
        const largestExtent = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 7.1 / largestExtent;
        root.scale.multiplyScalar(scale);
        const normalizedBox = new THREE.Box3().setFromObject(root);
        const center = normalizedBox.getCenter(new THREE.Vector3());
        root.position.sub(center);
        root.position.y += 0.05;

        const isOboe = modelId === "oboe";
        const materialPromises: Promise<void>[] = [];
        let explodeIndex = 0;
        root.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = false;
            object.receiveShadow = false;
            object.userData.basePosition = object.position.clone();
            const ancestors = ancestorNames(object, root);
            const role = isOboe ? classifyOboePart(ancestors) : classifySaxPart(object.name);
            if (role === "keywork") {
              explodeIndex += 1;
              const sign = explodeIndex % 2 === 0 ? 1 : -1;
              object.userData.explodeOffset = new THREE.Vector3(sign * (0.12 + 0.01 * explodeIndex), 0, 0);
              explodableMeshes.push(object);
            } else if (role === "mouthpiece" || role === "ligature") {
              object.userData.explodeOffset = new THREE.Vector3(0, 0, role === "mouthpiece" ? -0.55 : -0.3);
              explodableMeshes.push(object);
            }

            const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
            const fallbackMaterials = sourceMaterials.map((material) => bronzeStudyMaterial(object.name, material));
            object.material = Array.isArray(object.material) ? fallbackMaterials : fallbackMaterials[0];
            object.userData.bocalBronzeStudy = true;

            const currentLook = lookRef.current;
            if (currentLook) {
              if (isOboe) {
                const sourceForOboe = sourceMaterials[0] as THREE.MeshStandardMaterial;
                materialPromises.push(
                  oboeLookMaterial(object.name, sourceForOboe, ancestors, currentLook, gltf.parser as unknown as { getDependency: (type: string, index: number) => Promise<unknown> }, goldTextureCache).then((material) => {
                    object.material = material;
                  }),
                );
              } else {
                const fallback = object.material;
                object.material = saxLookMaterial(object.name, sourceMaterials[0], currentLook);
                if (fallback instanceof THREE.Material) fallback.dispose();
                else if (Array.isArray(fallback)) fallback.forEach((m) => m.dispose());
              }
            }
          }
        });
        Promise.all(materialPromises).then(() => { needsRenderRef.current = true; });

        applyLookRef.current = () => {
          const currentLook = lookRef.current;
          if (!currentLook || !importedRoot) return;
          importedRoot.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            if (isOboe) {
              const sourceForOboe = object.material as THREE.MeshStandardMaterial;
              void oboeLookMaterial(object.name, sourceForOboe, ancestorNames(object, importedRoot), currentLook, gltf.parser as unknown as { getDependency: (type: string, index: number) => Promise<unknown> }, goldTextureCache).then((material) => {
                const previous = object.material;
                object.material = material;
                if (previous instanceof THREE.Material) previous.dispose();
                needsRenderRef.current = true;
              });
            } else {
              const previous = object.material;
              object.material = saxLookMaterial(object.name, Array.isArray(previous) ? previous[0] : previous, currentLook);
              if (previous instanceof THREE.Material) previous.dispose();
              else if (Array.isArray(previous)) previous.forEach((m) => m.dispose());
            }
            const offset = object.userData.explodeOffset as THREE.Vector3 | undefined;
            const base = object.userData.basePosition as THREE.Vector3 | undefined;
            if (offset && base) {
              object.position.copy(currentLook.exploded ? base.clone().add(offset) : base);
            }
          });
        };

        scene.add(root);
        setStatus("ready");
        needsRenderRef.current = true;
      },
      undefined,
      () => {
        if (!disposed) setStatus("error");
      },
    );

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };
    const fingeringHit = () => raycaster.intersectObjects(markerHitTargets, false)[0];
    const onPointerMove = (event: PointerEvent) => {
      setPointer(event);
      renderer.domElement.style.cursor = fingeringHit() ? "pointer" : "grab";
    };
    const onPointerUp = (event: PointerEvent) => {
      setPointer(event);
      const markerId = fingeringHit()?.object.userData.fingeringId as string | undefined;
      if (markerId) {
        markerToggleRef.current?.(markerId);
        return;
      }
      if (!inspectParts || !importedRoot) return;
      const hit = raycaster.intersectObject(importedRoot, true)[0];
      if (!hit) {
        partSelectRef.current?.(null);
        return;
      }
      const rawName = hit.object.name || hit.object.parent?.name || "Instrument component";
      const name = cleanPartName(rawName);
      const ancestors = ancestorNames(hit.object, importedRoot);
      partSelectRef.current?.({ name, category: classifyInstrumentPart(name, ancestors) });
      if (selectionBox) scene.remove(selectionBox);
      selectionBox = new THREE.BoxHelper(hit.object, lookRef.current?.highlight ?? DEFAULT_HIGHLIGHT);
      selectionBox.material.transparent = true;
      selectionBox.material.opacity = 0.72;
      scene.add(selectionBox);
      needsRenderRef.current = true;
    };
    let pointerDownPosition: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pointerDownPosition = { x: event.clientX, y: event.clientY };
    };
    const onPointerRelease = (event: PointerEvent) => {
      const moved = pointerDownPosition
        ? Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y)
        : 0;
      pointerDownPosition = null;
      if (moved <= 6) onPointerUp(event);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerRelease);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      needsRenderRef.current = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let visible = true;
    const intersectionObserver = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          (entries) => {
            visible = entries[0]?.isIntersecting ?? true;
            if (visible) needsRenderRef.current = true;
          },
          { threshold: 0.01 },
        )
      : null;
    intersectionObserver?.observe(container);

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      if (!visible) return;
      controls.update();
      const hasActiveMarker = Array.from(activeMarkerIdsRef.current ?? []).length > 0;
      if (hasActiveMarker) {
        const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08;
        markerVisuals.forEach((visual, id) => {
          visual.ring.lookAt(camera.position);
          if (activeMarkerIdsRef.current?.has(id)) visual.halo.scale.setScalar(0.74 * pulse);
        });
        needsRenderRef.current = true;
      }
      selectionBox?.update();
      if (!needsRenderRef.current) return;
      renderer.render(scene, camera);
      needsRenderRef.current = false;
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      intersectionObserver?.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerRelease);
      controls.dispose();
      applyLookRef.current = null;
      applyEnvironmentRef.current = null;
      pmremGenerator.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        } else if (object instanceof THREE.Sprite) {
          object.material.dispose();
        }
      });
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
      markerVisualsRef.current = new Map();
      glowTexture.dispose();
    };
  }, [fingeringMarkers, inspectParts, isolateRootName, src, modelId]);

  return (
    <div className="imported-instrument-canvas" ref={containerRef} role="img" aria-label={label}>
      {status === "loading" && <div className="model-loading"><span /> Loading optimized model…</div>}
      {status === "error" && <div className="model-fallback"><strong>Model could not load.</strong><span>The learning tools remain available.</span></div>}
      {status === "no-webgl" && <div className="model-fallback"><strong>3D is unavailable here.</strong><span>Open Bocal in a WebGL-capable browser to inspect this instrument.</span></div>}
    </div>
  );
}
