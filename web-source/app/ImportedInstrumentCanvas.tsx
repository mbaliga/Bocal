"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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

export function classifyInstrumentPart(name: string) {
  const value = name.toLowerCase();
  if (value.includes("padandrod") || value.includes("pad and rod")) return "Key and pad assembly";
  if (value.includes("spring")) return "Spring";
  if (value.includes("rodoutcap") || value.includes("cap")) return "Rod cap";
  if (value.includes("rod")) return "Rod / axle";
  if (value.includes("key")) return "Keywork";
  if (value.includes("oboe_base") || value.includes("oboe base") || value === "oboe") return "Instrument body";
  return "Instrument component";
}

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
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-webgl">("loading");

  useEffect(() => { markerToggleRef.current = onMarkerToggle; }, [onMarkerToggle]);
  useEffect(() => { partSelectRef.current = onPartSelect; }, [onPartSelect]);

  useEffect(() => {
    activeMarkerIdsRef.current = activeMarkerIds;
    showFingeringGuidesRef.current = showFingeringGuides;
    viewPresetRef.current = viewPreset;
    markerVisualsRef.current.forEach((visual, id) => {
      const active = activeMarkerIds?.has(id) ?? false;
      visual.group.visible = (active || showFingeringGuides) && markerBelongsInView(visual.marker, viewPreset);
      visual.group.scale.setScalar(active ? 1.04 : 0.72);
      visual.contactMaterial.color.setHex(active ? 0x08fed5 : 0x2a261d);
      visual.contactMaterial.emissive.setHex(active ? 0x075f52 : 0x000000);
      visual.contactMaterial.emissiveIntensity = active ? 2.4 : 0;
      visual.contactMaterial.opacity = active ? 0.92 : 0.18;
      visual.ringMaterial.color.setHex(active ? 0x08fed5 : 0xc99837);
      visual.ringMaterial.opacity = active ? 1 : 0.36;
      visual.haloMaterial.opacity = active ? 0.72 : 0.08;
      visual.halo.scale.setScalar(active ? 0.74 : 0.42);
    });
  }, [activeMarkerIds, showFingeringGuides, viewPreset]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(...VIEW_POSITIONS[viewPreset]);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, [resetView, viewPreset]);

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
    renderer.toneMappingExposure = 1.82;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 7.1;
    controls.maxDistance = 17;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;

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
    const cyanLight = new THREE.PointLight(0x08fed5, 16, 9, 2);
    cyanLight.position.set(-2.5, -1.8, 3.2);
    scene.add(cyanLight);

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
      const group = new THREE.Group();
      group.position.set(...marker.position);
      group.visible = (active || showFingeringGuidesRef.current) && markerBelongsInView(marker, viewPresetRef.current);

      const contactMaterial = new THREE.MeshStandardMaterial({
        color: active ? 0x08fed5 : 0x2a261d,
        emissive: active ? 0x075f52 : 0x000000,
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
        color: active ? 0x08fed5 : 0xc99837,
        transparent: true,
        opacity: active ? 0.98 : 0.44,
        depthTest: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 10, 34), ringMaterial);
      ring.renderOrder = 21;
      group.add(ring);

      const haloMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x08fed5,
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
    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        if (disposed) return;
        importedRoot = isolateRootName ? gltf.scene.getObjectByName(isolateRootName) ?? gltf.scene : gltf.scene;
        const firstBox = new THREE.Box3().setFromObject(importedRoot);
        const size = firstBox.getSize(new THREE.Vector3());
        const scale = 7.1 / Math.max(size.y, 0.001);
        importedRoot.scale.multiplyScalar(scale);
        const normalizedBox = new THREE.Box3().setFromObject(importedRoot);
        const center = normalizedBox.getCenter(new THREE.Vector3());
        importedRoot.position.sub(center);
        importedRoot.position.y += 0.05;
        importedRoot.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = false;
            object.receiveShadow = false;
            const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
            const bronzeMaterials = sourceMaterials.map((material) => bronzeStudyMaterial(object.name, material));
            object.material = Array.isArray(object.material) ? bronzeMaterials : bronzeMaterials[0];
            object.userData.bocalBronzeStudy = true;
          }
        });
        scene.add(importedRoot);
        setStatus("ready");
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
      partSelectRef.current?.({ name, category: classifyInstrumentPart(name) });
      if (selectionBox) scene.remove(selectionBox);
      selectionBox = new THREE.BoxHelper(hit.object, 0x08fed5);
      selectionBox.material.transparent = true;
      selectionBox.material.opacity = 0.72;
      scene.add(selectionBox);
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
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let animationFrame = 0;
    const animate = () => {
      controls.update();
      selectionBox?.update();
      const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08;
      markerVisuals.forEach((visual, id) => {
        visual.ring.lookAt(camera.position);
        if (activeMarkerIdsRef.current?.has(id)) visual.halo.scale.setScalar(0.74 * pulse);
      });
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerRelease);
      controls.dispose();
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
  }, [fingeringMarkers, inspectParts, isolateRootName, src]);

  return (
    <div className="imported-instrument-canvas" ref={containerRef} role="img" aria-label={label}>
      {status === "loading" && <div className="model-loading"><span /> Loading optimized model…</div>}
      {status === "error" && <div className="model-fallback"><strong>Model could not load.</strong><span>The learning tools remain available.</span></div>}
      {status === "no-webgl" && <div className="model-fallback"><strong>3D is unavailable here.</strong><span>Open Bocal in a WebGL-capable browser to inspect this instrument.</span></div>}
    </div>
  );
}
