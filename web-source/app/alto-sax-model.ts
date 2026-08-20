import * as THREE from "three";
import { SAX_KEYS, SAX_MECHANICS, type SaxKeyId } from "./sax-data";
import { SAX_COLORWAYS, type SaxColorway } from "./sax-setup-data";

const FRONT = new THREE.Vector3(0, 0, 1);
const BACK = new THREE.Vector3(0, 0, -1);
const LEFT = new THREE.Vector3(-1, 0, 0.16).normalize();
const RIGHT = new THREE.Vector3(1, 0, 0.16).normalize();
const LOCAL_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_Z = new THREE.Vector3(0, 0, 1);
const ACTIVE = new THREE.Color(0x08fed5);
const ACTIVE_EMISSIVE = new THREE.Color(0x075a4f);
const NO_EMISSIVE = new THREE.Color(0x000000);

type TouchKind = "pearl" | "paddle" | "teardrop" | "roller" | "thumb";

type KeySpec = {
  kind: TouchKind;
  pad: [number, number, number];
  padNormal?: "front" | "back" | "left" | "right";
  cup?: number;
  angle?: number;
  travel?: number;
};

export type KeyMechanism = {
  root: THREE.Group;
  touch: THREE.Group;
  cup: THREE.Group;
  travel: THREE.Vector3;
  cupTravel: THREE.Vector3;
  touchMaterial: THREE.MeshStandardMaterial;
  touchRest: THREE.Color;
  brassMaterial: THREE.MeshStandardMaterial;
  guideMaterial: THREE.MeshPhysicalMaterial;
  guide: THREE.Mesh;
  padIndicatorMaterial: THREE.MeshBasicMaterial;
  hitTargets: THREE.Object3D[];
  touchPress: number;
  cupPress: number;
};

const KEY_SPECS: Record<SaxKeyId, KeySpec> = {
  octave: { kind: "thumb", pad: [-0.05, 3.23, -0.16], padNormal: "back", cup: 0.095, travel: 0.045 },
  frontF: { kind: "teardrop", pad: [0.12, 2.48, 0.34], cup: 0.105, angle: -0.3 },
  lh1: { kind: "pearl", pad: [0.15, 2.13, 0.39], cup: 0.17 },
  bis: { kind: "pearl", pad: [0.3, 1.82, 0.34], cup: 0.105 },
  lh2: { kind: "pearl", pad: [0.14, 1.48, 0.42], cup: 0.175 },
  lh3: { kind: "pearl", pad: [0.14, 0.82, 0.44], cup: 0.19 },
  palmD: { kind: "paddle", pad: [-0.38, 2.23, 0.08], padNormal: "left", cup: 0.13, angle: -0.2 },
  palmEb: { kind: "paddle", pad: [-0.4, 1.72, 0.08], padNormal: "left", cup: 0.14, angle: 0.12 },
  palmF: { kind: "paddle", pad: [-0.43, 1.19, 0.07], padNormal: "left", cup: 0.145, angle: 0.25 },
  gsharp: { kind: "paddle", pad: [-0.22, 0.38, 0.4], cup: 0.17, angle: -0.15 },
  lowCsharp: { kind: "roller", pad: [-0.18, -0.22, 0.44], cup: 0.19, angle: 0.12 },
  lowB: { kind: "roller", pad: [1.26, -0.02, 0.47], cup: 0.28, angle: -0.12 },
  lowBb: { kind: "roller", pad: [1.28, 0.48, 0.6], cup: 0.33, angle: 0.08 },
  rh1: { kind: "pearl", pad: [-0.13, 0.18, 0.46], cup: 0.19 },
  rh2: { kind: "pearl", pad: [-0.13, -0.47, 0.47], cup: 0.2 },
  rh3: { kind: "pearl", pad: [-0.13, -1.11, 0.48], cup: 0.21 },
  sideC: { kind: "paddle", pad: [0.39, 0.48, 0.1], padNormal: "right", cup: 0.15, angle: -0.15 },
  sideBb: { kind: "paddle", pad: [0.41, 0.02, 0.1], padNormal: "right", cup: 0.155, angle: 0.08 },
  highFsharp: { kind: "paddle", pad: [0.43, -0.68, 0.09], padNormal: "right", cup: 0.17, angle: 0.12 },
  altFsharp: { kind: "paddle", pad: [0.4, -1.31, 0.1], padNormal: "right", cup: 0.145, angle: -0.12 },
  sideE: { kind: "paddle", pad: [0.37, 0.92, 0.09], padNormal: "right", cup: 0.14, angle: -0.22 },
  lowC: { kind: "roller", pad: [0.14, -1.56, 0.49], cup: 0.22, angle: 0.12 },
  lowEb: { kind: "roller", pad: [0.72, -2.22, 0.35], cup: 0.23, angle: -0.12 },
};

function normalFor(side: KeySpec["padNormal"] | "front" | "back" | "left" | "right") {
  if (side === "back") return BACK.clone();
  if (side === "left") return LEFT.clone();
  if (side === "right") return RIGHT.clone();
  return FRONT.clone();
}

function setCylinderNormal(object: THREE.Object3D, normal: THREE.Vector3) {
  object.quaternion.setFromUnitVectors(LOCAL_Y, normal.clone().normalize());
}

function setFaceNormal(object: THREE.Object3D, normal: THREE.Vector3) {
  object.quaternion.setFromUnitVectors(LOCAL_Z, normal.clone().normalize());
}

function cylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 10,
) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(LOCAL_Y, direction.normalize());
  return mesh;
}

function taperedCylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  material: THREE.Material,
  radialSegments = 20,
) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusEnd, radiusStart, direction.length(), radialSegments),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(LOCAL_Y, direction.normalize());
  return mesh;
}

function tube(
  points: Array<[number, number, number]>,
  radius: number,
  material: THREE.Material,
  segments = 48,
) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 12, false), material);
}

function addRing(
  parent: THREE.Object3D,
  position: THREE.Vector3,
  radius: number,
  tubeRadius: number,
  normal: THREE.Vector3,
  material: THREE.Material,
) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeRadius, 8, 32), material);
  ring.position.copy(position);
  setFaceNormal(ring, normal);
  parent.add(ring);
  return ring;
}

function addDisc(
  parent: THREE.Object3D,
  position: THREE.Vector3,
  radius: number,
  depth: number,
  normal: THREE.Vector3,
  material: THREE.Material,
) {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 24), material);
  disc.position.copy(position);
  setCylinderNormal(disc, normal);
  parent.add(disc);
  return disc;
}

function keyNormal(id: SaxKeyId) {
  const key = SAX_KEYS.find((candidate) => candidate.id === id);
  return normalFor(key?.side ?? "front");
}

function makeTouch(
  kind: TouchKind,
  position: THREE.Vector3,
  normal: THREE.Vector3,
  angle: number,
  brass: THREE.MeshStandardMaterial,
  touchMaterial: THREE.MeshStandardMaterial,
  parent: THREE.Group,
) {
  if (kind === "pearl") {
    addDisc(parent, position, 0.17, 0.055, normal, brass);
    const pearl = addDisc(parent, position.clone().addScaledVector(normal, 0.034), 0.122, 0.062, normal, touchMaterial);
    return [pearl];
  }

  if (kind === "roller") {
    const rollerDirection = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(0.12);
    const roller = cylinderBetween(
      position.clone().sub(rollerDirection),
      position.clone().add(rollerDirection),
      0.09,
      touchMaterial,
      16,
    );
    parent.add(roller);
    const axleDirection = rollerDirection.clone().normalize().multiplyScalar(0.17);
    const axle = cylinderBetween(
      position.clone().sub(axleDirection),
      position.clone().add(axleDirection),
      0.025,
      brass,
    );
    parent.add(axle);
    return [roller];
  }

  const length = kind === "thumb" ? 0.28 : kind === "teardrop" ? 0.2 : 0.17;
  const radius = kind === "thumb" ? 0.12 : kind === "teardrop" ? 0.105 : 0.11;
  const paddle = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), touchMaterial);
  paddle.position.copy(position);
  paddle.scale.z = 0.34;
  setFaceNormal(paddle, normal);
  paddle.rotateOnAxis(normal, angle);
  if (kind === "teardrop") paddle.scale.set(0.78, 1.18, 0.32);
  parent.add(paddle);

  const border = new THREE.Mesh(new THREE.CapsuleGeometry(radius + 0.025, length + 0.015, 6, 12), brass);
  border.position.copy(position).addScaledVector(normal, -0.026);
  border.scale.z = 0.22;
  setFaceNormal(border, normal);
  border.rotateOnAxis(normal, angle);
  if (kind === "teardrop") border.scale.set(0.8, 1.2, 0.22);
  parent.add(border);
  return [paddle];
}

function addRodSystem(model: THREE.Group, lacquer: THREE.Material, darkBrass: THREE.Material) {
  const rods = [
    { x: -0.47, z: 0.02, y: 0.55, length: 4.12 },
    { x: 0.48, z: 0.01, y: -0.15, length: 3.62 },
    { x: -0.02, z: -0.38, y: 0.72, length: 3.55 },
    { x: 0.34, z: 0.27, y: 1.46, length: 2.48 },
  ];
  for (const rod of rods) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, rod.length, 10), lacquer);
    mesh.position.set(rod.x, rod.y, rod.z);
    model.add(mesh);
    const count = Math.max(3, Math.floor(rod.length / 0.62));
    for (let index = 0; index <= count; index += 1) {
      const y = rod.y - rod.length / 2 + (rod.length * index) / count;
      const bodyRadius = 0.28 + Math.max(0, 2.55 - y) * 0.032;
      const bodyPoint = new THREE.Vector3(
        THREE.MathUtils.clamp(rod.x, -bodyRadius, bodyRadius),
        y,
        rod.z < 0 ? -Math.sqrt(Math.max(0, bodyRadius ** 2 - Math.min(bodyRadius ** 2, rod.x ** 2))) : 0.18,
      );
      const postPoint = new THREE.Vector3(rod.x, y, rod.z);
      model.add(cylinderBetween(bodyPoint, postPoint, 0.035, lacquer, 8));
      const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8), darkBrass);
      pivot.position.copy(postPoint);
      model.add(pivot);
    }
  }
}

function addBowGuard(model: THREE.Group, lacquer: THREE.Material) {
  model.add(tube([
    [-0.34, -2.0, 0.42],
    [-0.25, -2.5, 0.57],
    [0.25, -2.78, 0.62],
    [0.83, -2.64, 0.58],
    [1.06, -2.26, 0.48],
  ], 0.035, lacquer, 42));
  model.add(tube([
    [-0.24, -2.07, 0.53],
    [-0.06, -2.39, 0.69],
    [0.37, -2.55, 0.72],
    [0.78, -2.42, 0.67],
    [0.96, -2.17, 0.56],
  ], 0.027, lacquer, 38));
  for (const x of [0.02, 0.38, 0.72]) {
    model.add(cylinderBetween(
      new THREE.Vector3(x - 0.04, -2.57 + Math.abs(x - 0.38) * 0.3, 0.61),
      new THREE.Vector3(x, -2.4 + Math.abs(x - 0.38) * 0.12, 0.72),
      0.025,
      lacquer,
      8,
    ));
  }
}

function addBellGuards(model: THREE.Group, lacquer: THREE.Material) {
  const bellRod = cylinderBetween(
    new THREE.Vector3(0.78, -1.22, -0.17),
    new THREE.Vector3(0.78, 0.56, -0.17),
    0.03,
    lacquer,
  );
  model.add(bellRod);
  for (const y of [-0.98, -0.27, 0.43]) {
    model.add(cylinderBetween(
      new THREE.Vector3(0.78, y, -0.17),
      new THREE.Vector3(0.94, y, -0.13),
      0.035,
      lacquer,
      8,
    ));
  }
  const outer = tube([
    [0.78, -0.42, 0.62],
    [0.92, 0.12, 0.8],
    [1.2, 0.58, 0.9],
    [1.55, 0.69, 0.75],
  ], 0.034, lacquer, 36);
  model.add(outer);
  model.add(tube([
    [0.87, -0.36, 0.72],
    [1.04, 0.13, 0.91],
    [1.29, 0.48, 0.98],
    [1.5, 0.56, 0.83],
  ], 0.027, lacquer, 32));
  model.add(cylinderBetween(new THREE.Vector3(0.93, 0.02, 0.78), new THREE.Vector3(1.07, 0.12, 0.92), 0.025, lacquer));
  model.add(cylinderBetween(new THREE.Vector3(1.25, 0.49, 0.92), new THREE.Vector3(1.3, 0.34, 1.02), 0.025, lacquer));
}

function keyArmPoints(id: SaxKeyId, touchPosition: THREE.Vector3, padPosition: THREE.Vector3) {
  if (id === "lowB" || id === "lowBb") {
    const lowerY = id === "lowBb" ? -0.78 : -0.55;
    return [
      touchPosition.clone().add(new THREE.Vector3(0, 0, -0.035)),
      new THREE.Vector3(-0.47, touchPosition.y, 0),
      new THREE.Vector3(-0.47, lowerY, -0.16),
      new THREE.Vector3(0.78, lowerY, -0.17),
      new THREE.Vector3(0.78, padPosition.y, -0.17),
      padPosition,
    ];
  }
  const bridgePoint = touchPosition.clone().lerp(padPosition, 0.5);
  bridgePoint.z -= id === "octave" ? 0.08 : 0.16;
  return [
    touchPosition.clone().add(new THREE.Vector3(0, 0, -0.035)),
    bridgePoint,
    padPosition,
  ];
}

export function buildEducationalAltoSaxophone(initialColorway: SaxColorway = SAX_COLORWAYS[0]) {
  const model = new THREE.Group();
  // Player view is deliberately square to the front stack. Oblique display
  // angles made the upper and lower hand positions appear to sit on one side.
  model.rotation.y = 0;
  model.rotation.z = -0.025;
  model.position.set(-0.18, -0.03, 0);

  const lacquer = new THREE.MeshPhysicalMaterial({
    color: initialColorway.body,
    metalness: 0.88,
    roughness: initialColorway.roughness ?? 0.2,
    clearcoat: 0.82,
    clearcoatRoughness: 0.14,
    iridescence: initialColorway.iridescence ?? 0,
    iridescenceIOR: initialColorway.iridescenceIOR ?? 1.3,
  });
  const lacquerLight = new THREE.MeshPhysicalMaterial({
    color: initialColorway.bodyHighlight,
    metalness: 0.9,
    roughness: Math.min((initialColorway.roughness ?? 0.2) + 0.03, 1),
    clearcoat: 0.74,
    clearcoatRoughness: 0.16,
    iridescence: initialColorway.iridescence ?? 0,
    iridescenceIOR: initialColorway.iridescenceIOR ?? 1.3,
  });
  const keyMetal = new THREE.MeshStandardMaterial({ color: initialColorway.keywork, metalness: 0.9, roughness: 0.19 });
  const keyMetalLight = new THREE.MeshStandardMaterial({ color: initialColorway.keyworkLight, metalness: 0.92, roughness: 0.16 });
  const darkBrass = new THREE.MeshStandardMaterial({ color: initialColorway.keyworkDark, metalness: 0.84, roughness: 0.34 });
  const padMaterial = new THREE.MeshStandardMaterial({ color: 0x1e1710, metalness: 0.18, roughness: 0.74 });
  const corkMaterial = new THREE.MeshStandardMaterial({ color: 0xa77a43, roughness: 0.92, metalness: 0 });
  const mouthpieceMaterial = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.2, metalness: 0.18, clearcoat: 0.75 });
  const reedMaterial = new THREE.MeshStandardMaterial({ color: 0xd1aa66, roughness: 0.68, metalness: 0 });

  // A real alto is a conical tube: the bore and body widen continuously toward the bow.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.445, 4.78, 48), lacquer);
  body.position.set(0, 0.25, 0);
  model.add(body);
  const bodyHighlight = new THREE.Mesh(new THREE.CylinderGeometry(0.272, 0.452, 4.55, 48, 1, true, 2.75, 0.48), lacquerLight);
  bodyHighlight.position.set(0, 0.29, 0);
  model.add(bodyHighlight);

  // Receiver, neck screw and upper ferrules.
  for (const y of [2.61, 2.7]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(y === 2.7 ? 0.305 : 0.292, 0.028, 10, 36), keyMetalLight);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y;
    model.add(collar);
  }
  const screwStem = cylinderBetween(new THREE.Vector3(0.29, 2.66, 0), new THREE.Vector3(0.49, 2.66, 0), 0.038, keyMetalLight);
  model.add(screwStem);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 18), keyMetalLight);
  screw.rotation.z = Math.PI / 2;
  screw.position.set(0.52, 2.66, 0);
  model.add(screw);

  // U-shaped bow and its rising bell branch.
  model.add(tube([
    [0, -2.15, 0],
    [0.01, -2.54, 0],
    [0.29, -2.84, 0],
    [0.72, -2.91, 0],
    [1.08, -2.68, 0],
    [1.27, -2.27, 0],
  ], 0.44, lacquer, 64));
  const bellBranch = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.43, 1.9, 40), lacquer);
  bellBranch.position.set(1.27, -1.36, 0);
  model.add(bellBranch);

  // Offset bell with a visible flare, dark throat and reinforced rim.
  const bellProfile = [
    new THREE.Vector2(0.39, -0.72),
    new THREE.Vector2(0.41, -0.28),
    new THREE.Vector2(0.46, 0.06),
    new THREE.Vector2(0.58, 0.34),
    new THREE.Vector2(0.78, 0.56),
    new THREE.Vector2(1.02, 0.72),
    new THREE.Vector2(1.08, 0.76),
  ];
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellProfile, 64), lacquer);
  bell.position.set(1.27, 0.18, 0);
  model.add(bell);
  const bellThroat = new THREE.Mesh(new THREE.CircleGeometry(1.0, 64), darkBrass);
  bellThroat.rotation.x = -Math.PI / 2;
  bellThroat.position.set(1.27, 0.935, 0);
  model.add(bellThroat);
  const bellRim = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.055, 12, 72), keyMetalLight);
  bellRim.rotation.x = Math.PI / 2;
  bellRim.position.set(1.27, 0.94, 0);
  model.add(bellRim);
  const bellRing = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.025, 8, 42), keyMetalLight);
  bellRing.rotation.x = Math.PI / 2;
  bellRing.position.set(1.27, -0.42, 0);
  model.add(bellRing);

  // The neck follows the recognisable rising crook of an alto, then narrows into cork and mouthpiece.
  model.add(tube([
    [0, 2.7, 0],
    [-0.02, 3.1, 0],
    [-0.2, 3.47, 0],
    [-0.57, 3.72, 0],
    [-0.98, 3.77, 0],
    [-1.33, 3.63, 0],
  ], 0.185, lacquer, 62));
  model.add(taperedCylinderBetween(
    new THREE.Vector3(-1.31, 3.63, 0),
    new THREE.Vector3(-1.73, 3.48, 0),
    0.18,
    0.152,
    corkMaterial,
  ));
  model.add(taperedCylinderBetween(
    new THREE.Vector3(-1.58, 3.53, 0),
    new THREE.Vector3(-2.35, 3.24, 0),
    0.205,
    0.095,
    mouthpieceMaterial,
    28,
  ));
  model.add(taperedCylinderBetween(
    new THREE.Vector3(-1.6, 3.51, 0),
    new THREE.Vector3(-1.79, 3.44, 0),
    0.22,
    0.205,
    keyMetalLight,
    24,
  ));
  const reed = taperedCylinderBetween(
    new THREE.Vector3(-1.7, 3.44, 0.12),
    new THREE.Vector3(-2.27, 3.22, 0.08),
    0.11,
    0.055,
    reedMaterial,
    12,
  );
  reed.scale.z = 0.18;
  model.add(reed);

  // Bell-to-body brace: two contact points and a central medallion make the silhouette convincing.
  const braceCenter = new THREE.Vector3(0.63, -0.5, -0.16);
  model.add(cylinderBetween(new THREE.Vector3(0.38, -0.6, -0.18), braceCenter, 0.055, keyMetal));
  model.add(cylinderBetween(braceCenter, new THREE.Vector3(0.92, -0.42, -0.17), 0.055, keyMetal));
  const braceMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 24), keyMetalLight);
  braceMedallion.rotation.x = Math.PI / 2;
  braceMedallion.position.copy(braceCenter);
  model.add(braceMedallion);

  addRodSystem(model, keyMetal, darkBrass);
  addBowGuard(model, keyMetalLight);
  addBellGuards(model, keyMetalLight);

  // Strap ring and right-thumb hook are independent fittings, not tone-hole keys.
  const strapMount = cylinderBetween(new THREE.Vector3(-0.34, 1.08, -0.18), new THREE.Vector3(-0.55, 1.08, -0.2), 0.04, keyMetalLight);
  model.add(strapMount);
  addRing(model, new THREE.Vector3(-0.59, 1.08, -0.2), 0.13, 0.026, RIGHT, keyMetalLight);
  const thumbHook = tube([
    [0.2, -0.14, -0.4],
    [0.36, -0.14, -0.55],
    [0.5, -0.12, -0.47],
  ], 0.06, keyMetalLight, 24);
  model.add(thumbHook);

  // Subtle decorative cutting on the bell adds depth without pretending to be repair-grade engraving.
  for (const offset of [-0.12, 0.08, 0.28]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.36 + offset * 0.2, 0.01, 5, 28, Math.PI * 1.15), keyMetal);
    arc.rotation.set(Math.PI / 2, 0.2, -0.6 + offset);
    arc.position.set(1.22, 0.54 + offset * 0.25, 0.68);
    model.add(arc);
  }

  const mechanisms = new Map<SaxKeyId, KeyMechanism>();
  for (const key of SAX_KEYS) {
    const spec = KEY_SPECS[key.id];
    const root = new THREE.Group();
    root.userData.keyId = key.id;
    const touch = new THREE.Group();
    const cup = new THREE.Group();
    root.add(touch, cup);

    const restBrass = new THREE.Color(key.id === "octave" ? initialColorway.keyworkLight : initialColorway.keywork);
    const brass = new THREE.MeshStandardMaterial({
      color: restBrass.clone(),
      metalness: 0.88,
      roughness: 0.2,
    });
    const restTouch = new THREE.Color(spec.kind === "pearl" ? initialColorway.pearl : initialColorway.keyworkLight);
    const touchMaterial = new THREE.MeshStandardMaterial({
      color: restTouch.clone(),
      emissive: NO_EMISSIVE.clone(),
      metalness: spec.kind === "pearl" ? 0.08 : 0.84,
      roughness: spec.kind === "pearl" ? 0.24 : 0.22,
    });

    const touchPosition = new THREE.Vector3(...key.position);
    const touchNormal = keyNormal(key.id);
    const padPosition = new THREE.Vector3(...spec.pad);
    const padNormal = normalFor(spec.padNormal ?? "front");
    const hitTargets = makeTouch(spec.kind, touchPosition, touchNormal, spec.angle ?? 0, brass, touchMaterial, touch);

    // A curved arm visually explains which remote pad each touch-piece controls.
    const arm = tube(
      keyArmPoints(key.id, touchPosition, padPosition).map((point) => [point.x, point.y, point.z] as [number, number, number]),
      0.025,
      brass,
      key.id === "lowB" || key.id === "lowBb" ? 42 : 22,
    );
    arm.userData.keyId = key.id;
    touch.add(arm);

    const cupRadius = spec.cup ?? 0.17;
    const holePosition = padPosition.clone().addScaledVector(padNormal, -0.06);
    addRing(model, holePosition, cupRadius * 0.82, 0.022, padNormal, darkBrass);
    addDisc(model, holePosition.clone().addScaledVector(padNormal, -0.012), cupRadius * 0.72, 0.018, padNormal, padMaterial);
    addDisc(cup, padPosition, cupRadius, 0.055, padNormal, brass);
    addDisc(cup, padPosition.clone().addScaledVector(padNormal, -0.034), cupRadius * 0.78, 0.03, padNormal, padMaterial);

    // Linked pads stay metallic. A thin ring indicates mechanical output
    // without mis-teaching the cup as another place for a finger.
    const padIndicatorMaterial = new THREE.MeshBasicMaterial({
      color: ACTIVE,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const padIndicator = addRing(
      cup,
      padPosition.clone().addScaledVector(padNormal, 0.038),
      cupRadius * 1.08,
      0.018,
      padNormal,
      padIndicatorMaterial,
    );
    padIndicator.renderOrder = 6;

    // A deliberately abstract fingertip marker: translucent, optional and
    // positioned at the actual touch-piece rather than at a linked pad cup.
    const guideMaterial = new THREE.MeshPhysicalMaterial({
      color: ACTIVE,
      emissive: ACTIVE_EMISSIVE.clone(),
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      roughness: 0.16,
      transmission: 0.18,
      clearcoat: 0.7,
    });
    const guide = new THREE.Mesh(new THREE.SphereGeometry(0.145, 22, 16), guideMaterial);
    guide.position.copy(touchPosition).addScaledVector(touchNormal, 0.22);
    guide.scale.set(0.88, 1.28, 0.62);
    setFaceNormal(guide, touchNormal);
    guide.renderOrder = 20;
    guide.raycast = () => undefined;
    root.add(guide);

    root.traverse((object) => { object.userData.keyId = key.id; });
    model.add(root);
    const travelDistance = spec.travel ?? 0.058;
    const padDirection = SAX_MECHANICS[key.id].cupMotion === "opens" ? 1 : -1;
    mechanisms.set(key.id, {
      root,
      touch,
      cup,
      travel: touchNormal.clone().multiplyScalar(-travelDistance),
      cupTravel: padNormal.clone().multiplyScalar(padDirection * Math.min(travelDistance, 0.06)),
      touchMaterial,
      touchRest: restTouch,
      brassMaterial: brass,
      guideMaterial,
      guide,
      padIndicatorMaterial,
      hitTargets,
      touchPress: 0,
      cupPress: 0,
    });
  }

  const applyColorway = (colorway: SaxColorway) => {
    lacquer.color.setHex(colorway.body);
    lacquer.roughness = colorway.roughness ?? 0.2;
    lacquer.iridescence = colorway.iridescence ?? 0;
    lacquer.iridescenceIOR = colorway.iridescenceIOR ?? 1.3;
    lacquerLight.color.setHex(colorway.bodyHighlight);
    lacquerLight.roughness = Math.min((colorway.roughness ?? 0.2) + 0.03, 1);
    lacquerLight.iridescence = colorway.iridescence ?? 0;
    lacquerLight.iridescenceIOR = colorway.iridescenceIOR ?? 1.3;
    keyMetal.color.setHex(colorway.keywork);
    keyMetalLight.color.setHex(colorway.keyworkLight);
    darkBrass.color.setHex(colorway.keyworkDark);
    for (const [id, mechanism] of mechanisms) {
      mechanism.brassMaterial.color.setHex(id === "octave" ? colorway.keyworkLight : colorway.keywork);
      mechanism.touchRest.setHex(KEY_SPECS[id].kind === "pearl" ? colorway.pearl : colorway.keyworkLight);
    }
  };

  applyColorway(initialColorway);
  return { model, mechanisms, applyColorway };
}

export function animateEducationalSaxKeys(
  mechanisms: Map<SaxKeyId, KeyMechanism>,
  activeKeys: Set<SaxKeyId>,
  showGuides = false,
) {
  const activeCups = new Set<SaxKeyId>(activeKeys);
  for (const id of activeKeys) {
    for (const coupledId of SAX_MECHANICS[id].coupledCupIds ?? []) activeCups.add(coupledId);
  }

  for (const [id, mechanism] of mechanisms) {
    const isTouchActive = activeKeys.has(id);
    const isCupActive = activeCups.has(id);
    mechanism.touchPress += ((isTouchActive ? 1 : 0) - mechanism.touchPress) * 0.17;
    mechanism.cupPress += ((isCupActive ? 1 : 0) - mechanism.cupPress) * 0.17;
    mechanism.touch.position.copy(mechanism.travel).multiplyScalar(mechanism.touchPress);
    mechanism.cup.position.copy(mechanism.cupTravel).multiplyScalar(mechanism.cupPress);
    mechanism.touchMaterial.color.lerpColors(mechanism.touchRest, ACTIVE, mechanism.touchPress);
    mechanism.touchMaterial.emissive.lerpColors(NO_EMISSIVE, ACTIVE_EMISSIVE, mechanism.touchPress);
    mechanism.padIndicatorMaterial.opacity = mechanism.cupPress * 0.82;
    const guideTarget = showGuides && isTouchActive ? 0.34 : 0;
    mechanism.guideMaterial.opacity += (guideTarget - mechanism.guideMaterial.opacity) * 0.2;
    mechanism.guide.visible = mechanism.guideMaterial.opacity > 0.006;
    const guidePulse = 1 + Math.sin(performance.now() * 0.004 + mechanism.root.id) * 0.025 * mechanism.touchPress;
    mechanism.guide.scale.set(0.88 * guidePulse, 1.28 * guidePulse, 0.62 * guidePulse);
  }
}
