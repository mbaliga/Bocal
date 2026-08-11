#!/usr/bin/env python3
"""Generate Bocal's compact educational woodwind GLB library.

The meshes are intentionally stylized rather than CAD-derived.  Their job is to
teach silhouette, part order, key/tone-hole location, and interaction topology.
Every interactive control is exported as a named glTF node with metadata.
"""

from __future__ import annotations

import json
import math
import os
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "glb"
OUT.mkdir(parents=True, exist_ok=True)


CATALOG: list[dict[str, Any]] = [
    # Saxophones: Yamaha identifies the first six as the types in widespread use.
    {"id": "soprillo-sax", "name": "Soprillo saxophone", "family": "Saxophones", "template": "sax", "shape": "straight", "scale": 0.58, "key": "B-flat", "transpose": 10, "tier": "rare"},
    {"id": "sopranino-sax", "name": "Sopranino saxophone", "family": "Saxophones", "template": "sax", "shape": "straight", "scale": 0.72, "key": "E-flat", "transpose": 3, "tier": "widespread"},
    {"id": "soprano-sax", "name": "Soprano saxophone", "family": "Saxophones", "template": "sax", "shape": "straight", "scale": 0.88, "key": "B-flat", "transpose": -2, "tier": "widespread"},
    {"id": "alto-sax", "name": "Alto saxophone", "family": "Saxophones", "template": "sax", "shape": "curved", "scale": 1.00, "key": "E-flat", "transpose": -9, "tier": "widespread", "fingering": "complete-core-range"},
    {"id": "c-melody-sax", "name": "C melody saxophone", "family": "Saxophones", "template": "sax", "shape": "curved", "scale": 1.14, "key": "C", "transpose": -12, "tier": "historic"},
    {"id": "tenor-sax", "name": "Tenor saxophone", "family": "Saxophones", "template": "sax", "shape": "curved", "scale": 1.24, "key": "B-flat", "transpose": -14, "tier": "widespread"},
    {"id": "baritone-sax", "name": "Baritone saxophone", "family": "Saxophones", "template": "sax", "shape": "curved", "scale": 1.52, "key": "E-flat", "transpose": -21, "tier": "widespread", "lowA": True},
    {"id": "bass-sax", "name": "Bass saxophone", "family": "Saxophones", "template": "sax", "shape": "curved", "scale": 1.78, "key": "B-flat", "transpose": -26, "tier": "widespread"},
    {"id": "contrabass-sax", "name": "Contrabass saxophone", "family": "Saxophones", "template": "sax", "shape": "curved", "scale": 2.04, "key": "E-flat", "transpose": -33, "tier": "rare"},
    {"id": "subcontrabass-sax", "name": "Subcontrabass saxophone", "family": "Saxophones", "template": "sax", "shape": "curved", "scale": 2.26, "key": "B-flat", "transpose": -38, "tier": "rare"},
    # Flutes.
    {"id": "piccolo", "name": "Piccolo", "family": "Flutes", "template": "flute", "scale": 0.58, "key": "C", "transpose": 12, "tier": "core"},
    {"id": "concert-flute", "name": "Concert flute", "family": "Flutes", "template": "flute", "scale": 1.0, "key": "C", "transpose": 0, "tier": "core"},
    {"id": "alto-flute", "name": "Alto flute", "family": "Flutes", "template": "flute", "scale": 1.26, "key": "G", "transpose": -5, "tier": "extended"},
    {"id": "bass-flute", "name": "Bass flute", "family": "Flutes", "template": "flute", "scale": 1.55, "key": "C", "transpose": -12, "tier": "extended"},
    # Clarinets.
    {"id": "eb-clarinet", "name": "E-flat clarinet", "family": "Clarinets", "template": "clarinet", "scale": 0.76, "key": "E-flat", "transpose": 3, "tier": "extended"},
    {"id": "bb-clarinet", "name": "B-flat clarinet", "family": "Clarinets", "template": "clarinet", "scale": 1.0, "key": "B-flat", "transpose": -2, "tier": "core"},
    {"id": "a-clarinet", "name": "A clarinet", "family": "Clarinets", "template": "clarinet", "scale": 1.06, "key": "A", "transpose": -3, "tier": "core"},
    {"id": "basset-horn", "name": "Basset horn", "family": "Clarinets", "template": "clarinet", "scale": 1.25, "key": "F", "transpose": -7, "tier": "extended"},
    {"id": "alto-clarinet", "name": "Alto clarinet", "family": "Clarinets", "template": "clarinet", "scale": 1.35, "key": "E-flat", "transpose": -9, "tier": "extended"},
    {"id": "bass-clarinet", "name": "Bass clarinet", "family": "Clarinets", "template": "clarinet", "scale": 1.62, "key": "B-flat", "transpose": -14, "tier": "core"},
    {"id": "contralto-clarinet", "name": "Contralto clarinet", "family": "Clarinets", "template": "clarinet", "scale": 1.88, "key": "E-flat", "transpose": -21, "tier": "extended"},
    {"id": "contrabass-clarinet", "name": "Contrabass clarinet", "family": "Clarinets", "template": "clarinet", "scale": 2.08, "key": "B-flat", "transpose": -26, "tier": "extended"},
    # Oboe family.
    {"id": "oboe", "name": "Oboe", "family": "Double reeds", "template": "oboe", "scale": 1.0, "key": "C", "transpose": 0, "tier": "core"},
    {"id": "oboe-damore", "name": "Oboe d'amore", "family": "Double reeds", "template": "oboe", "scale": 1.13, "key": "A", "transpose": -3, "tier": "extended"},
    {"id": "english-horn", "name": "English horn (cor anglais)", "family": "Double reeds", "template": "oboe", "scale": 1.28, "key": "F", "transpose": -7, "tier": "core", "pearBell": True},
    {"id": "bass-oboe", "name": "Bass oboe / heckelphone", "family": "Double reeds", "template": "oboe", "scale": 1.55, "key": "C", "transpose": -12, "tier": "extended"},
    {"id": "bassoon", "name": "Bassoon", "family": "Double reeds", "template": "bassoon", "scale": 1.0, "key": "C", "transpose": 0, "tier": "core"},
    {"id": "contrabassoon", "name": "Contrabassoon", "family": "Double reeds", "template": "bassoon", "scale": 1.38, "key": "C", "transpose": -12, "tier": "core", "contra": True},
    # Recorder family, Baroque-system educational body plan.
    {"id": "sopranino-recorder", "name": "Sopranino recorder", "family": "Recorders", "template": "recorder", "scale": 0.62, "key": "F", "transpose": 12, "tier": "extended"},
    {"id": "soprano-recorder", "name": "Soprano recorder", "family": "Recorders", "template": "recorder", "scale": 0.78, "key": "C", "transpose": 12, "tier": "core"},
    {"id": "alto-recorder", "name": "Alto recorder", "family": "Recorders", "template": "recorder", "scale": 1.0, "key": "F", "transpose": 0, "tier": "core"},
    {"id": "tenor-recorder", "name": "Tenor recorder", "family": "Recorders", "template": "recorder", "scale": 1.27, "key": "C", "transpose": 0, "tier": "core"},
    {"id": "bass-recorder", "name": "Bass recorder", "family": "Recorders", "template": "recorder", "scale": 1.57, "key": "F", "transpose": -12, "tier": "core"},
    {"id": "great-bass-recorder", "name": "Great bass recorder", "family": "Recorders", "template": "recorder", "scale": 1.82, "key": "C", "transpose": -12, "tier": "extended"},
    {"id": "contrabass-recorder", "name": "Contrabass recorder", "family": "Recorders", "template": "recorder", "scale": 2.08, "key": "F", "transpose": -24, "tier": "extended"},
]


SAX_KEYS = [
    ("octave", "Octave key", "Left thumb", (-0.27, 2.72, -0.26), "back"),
    ("frontF", "Front F key", "Left index", (-0.34, 2.56, 0.34), "left"),
    ("lh1", "B pearl", "Left index", (-0.22, 2.14, 0.38), "front"),
    ("bis", "Bis B-flat key", "Left index", (0.17, 1.91, 0.39), "front"),
    ("lh2", "A pearl", "Left middle", (-0.22, 1.51, 0.39), "front"),
    ("lh3", "G pearl", "Left ring", (-0.22, 0.86, 0.40), "front"),
    ("palmD", "High D palm key", "Left palm", (-0.54, 2.24, 0.02), "left"),
    ("palmEb", "High E-flat palm key", "Left palm", (-0.62, 1.69, 0.02), "left"),
    ("palmF", "High F palm key", "Left palm", (-0.59, 1.11, 0.02), "left"),
    ("gsharp", "G-sharp key", "Left pinky", (-0.62, 0.32, 0.25), "left"),
    ("lowCsharp", "Low C-sharp key", "Left pinky", (-0.66, -0.12, 0.22), "left"),
    ("lowB", "Low B key", "Left pinky", (-0.68, -0.54, 0.18), "left"),
    ("lowBb", "Low B-flat key", "Left pinky", (-0.65, -0.94, 0.12), "left"),
    ("rh1", "F pearl", "Right index", (0.23, 0.18, 0.42), "front"),
    ("rh2", "E pearl", "Right middle", (0.23, -0.49, 0.43), "front"),
    ("rh3", "D pearl", "Right ring", (0.23, -1.14, 0.42), "front"),
    ("sideC", "Side C key", "Right index side", (0.62, 0.40, 0.20), "right"),
    ("sideBb", "Side B-flat key", "Right index side", (0.65, -0.02, 0.18), "right"),
    ("sideFsharp", "Side F-sharp key", "Right ring side", (0.64, -0.73, 0.13), "right"),
    ("sideE", "High E side key", "Right index side", (0.64, 0.83, 0.11), "right"),
    ("lowC", "Low C key", "Right pinky", (0.59, -1.54, 0.21), "right"),
    ("lowEb", "Low E-flat key", "Right pinky", (0.61, -1.90, 0.14), "right"),
]


def cylinder(sides: int = 18, top: float = 1.0, bottom: float = 1.0):
    v, n, idx = [], [], []
    # wall
    for i in range(sides + 1):
        a = 2 * math.pi * i / sides
        c, s = math.cos(a), math.sin(a)
        v.extend([(bottom * c, -0.5, bottom * s), (top * c, 0.5, top * s)])
        n.extend([(c, 0, s), (c, 0, s)])
    for i in range(sides):
        j = i * 2
        idx.extend([j, j + 1, j + 2, j + 1, j + 3, j + 2])
    # caps
    for y, r, normal_y, flip in [(-0.5, bottom, -1, True), (0.5, top, 1, False)]:
        center = len(v); v.append((0, y, 0)); n.append((0, normal_y, 0))
        ring = len(v)
        for i in range(sides):
            a = 2 * math.pi * i / sides
            v.append((r * math.cos(a), y, r * math.sin(a))); n.append((0, normal_y, 0))
        for i in range(sides):
            a, b = ring + i, ring + ((i + 1) % sides)
            idx.extend([center, b, a] if flip else [center, a, b])
    return v, n, idx


def sphere(rings: int = 10, sides: int = 16):
    v, n, idx = [], [], []
    for r in range(rings + 1):
        phi = math.pi * r / rings
        for i in range(sides + 1):
            a = 2 * math.pi * i / sides
            p = (math.sin(phi) * math.cos(a), math.cos(phi), math.sin(phi) * math.sin(a))
            v.append(p); n.append(p)
    for r in range(rings):
        for i in range(sides):
            a = r * (sides + 1) + i; b = a + sides + 1
            idx.extend([a, b, a + 1, a + 1, b, b + 1])
    return v, n, idx


def box():
    v, n, idx = [], [], []
    faces = [((0, 0, 1), [(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]),
             ((0, 0,-1), [(1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)]),
             ((1,0,0), [(1,-1,1),(1,-1,-1),(1,1,-1),(1,1,1)]),
             ((-1,0,0), [(-1,-1,-1),(-1,-1,1),(-1,1,1),(-1,1,-1)]),
             ((0,1,0), [(-1,1,1),(1,1,1),(1,1,-1),(-1,1,-1)]),
             ((0,-1,0), [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1)])]
    for normal, pts in faces:
        base = len(v); v.extend([(x*.5,y*.5,z*.5) for x,y,z in pts]); n.extend([normal]*4)
        idx.extend([base,base+1,base+2,base,base+2,base+3])
    return v, n, idx


@dataclass
class GLB:
    name: str

    def __post_init__(self):
        self.bin = bytearray()
        self.buffer_views: list[dict[str, Any]] = []
        self.accessors: list[dict[str, Any]] = []
        self.materials: list[dict[str, Any]] = []
        self.meshes: list[dict[str, Any]] = []
        self.nodes: list[dict[str, Any]] = []
        self.mesh_cache: dict[tuple, int] = {}
        self.root_children: list[int] = []

    def material(self, name: str, color: tuple[float,float,float,float], metallic=0.0, roughness=0.5, emissive=None):
        m = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": color, "metallicFactor": metallic, "roughnessFactor": roughness}}
        if emissive: m["emissiveFactor"] = emissive
        self.materials.append(m)
        return len(self.materials)-1

    def _append(self, payload: bytes, target: int):
        while len(self.bin) % 4: self.bin.append(0)
        offset = len(self.bin); self.bin.extend(payload)
        self.buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload), "target": target})
        return len(self.buffer_views)-1

    def mesh(self, shape: str, material: int, top=1.0, bottom=1.0):
        key = (shape, material, round(top,3), round(bottom,3))
        if key in self.mesh_cache: return self.mesh_cache[key]
        if shape == "cylinder": verts, normals, indices = cylinder(top=top, bottom=bottom)
        elif shape == "sphere": verts, normals, indices = sphere()
        elif shape == "box": verts, normals, indices = box()
        else: raise ValueError(shape)
        pos = b"".join(struct.pack("<3f", *p) for p in verts)
        nor = b"".join(struct.pack("<3f", *p) for p in normals)
        use_u32 = max(indices, default=0) > 65535
        ind = b"".join(struct.pack("<I" if use_u32 else "<H", i) for i in indices)
        p_view = self._append(pos, 34962); n_view = self._append(nor, 34962); i_view = self._append(ind, 34963)
        mins = [min(p[k] for p in verts) for k in range(3)]; maxs = [max(p[k] for p in verts) for k in range(3)]
        p_acc = len(self.accessors); self.accessors.append({"bufferView": p_view, "componentType": 5126, "count": len(verts), "type": "VEC3", "min": mins, "max": maxs})
        n_acc = len(self.accessors); self.accessors.append({"bufferView": n_view, "componentType": 5126, "count": len(normals), "type": "VEC3"})
        i_acc = len(self.accessors); self.accessors.append({"bufferView": i_view, "componentType": 5125 if use_u32 else 5123, "count": len(indices), "type": "SCALAR", "min": [min(indices)], "max": [max(indices)]})
        self.meshes.append({"name": f"{shape}_{len(self.meshes)}", "primitives": [{"attributes": {"POSITION": p_acc, "NORMAL": n_acc}, "indices": i_acc, "material": material}]})
        out = len(self.meshes)-1; self.mesh_cache[key] = out; return out

    def node(self, name: str, mesh: int | None = None, translation=(0,0,0), scale=(1,1,1), rotation=None, extras=None, root=True):
        n: dict[str, Any] = {"name": name, "translation": list(translation), "scale": list(scale)}
        if mesh is not None: n["mesh"] = mesh
        if rotation: n["rotation"] = list(rotation)
        if extras: n["extras"] = extras
        self.nodes.append(n); i = len(self.nodes)-1
        if root: self.root_children.append(i)
        return i

    def segment(self, name: str, mesh: int, a, b, radius: float, extras=None):
        dx,dy,dz = b[0]-a[0],b[1]-a[1],b[2]-a[2]
        length = math.sqrt(dx*dx+dy*dy+dz*dz)
        ux,uy,uz = (dx/length,dy/length,dz/length)
        # quaternion rotating +Y to the segment direction
        dot = max(-1.0, min(1.0, uy))
        if dot < -0.999999: q=(0,0,1,0)
        else:
            ax,ay,az = uz,0,-ux
            s = math.sqrt((1+dot)*2); inv = 1/s
            q=(ax*inv,ay*inv,az*inv,s*.5)
        return self.node(name, mesh, ((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2), (radius,length,radius), q, extras)

    def write(self, path: Path, metadata: dict[str, Any]):
        root = len(self.nodes)
        self.nodes.append({"name": self.name, "children": self.root_children, "extras": metadata})
        doc = {"asset": {"version": "2.0", "generator": "Bocal educational model generator 1.0"},
               "scene": 0, "scenes": [{"nodes": [root]}], "nodes": self.nodes, "meshes": self.meshes,
               "materials": self.materials, "accessors": self.accessors, "bufferViews": self.buffer_views,
               "buffers": [{"byteLength": len(self.bin)}],
               "extras": {"license": "CC BY 4.0", "scope": "educational, non-CAD", "instrument": metadata}}
        js = json.dumps(doc, ensure_ascii=False, separators=(",",":")).encode("utf-8")
        while len(js)%4: js += b" "
        while len(self.bin)%4: self.bin.append(0)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        blob = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(self.bin), b"BIN\0") + self.bin
        path.write_bytes(blob)


def palette(g: GLB):
    return {
        "brass": g.material("warm lacquered brass", (0.57,0.36,0.07,1), .88, .22),
        "dark_brass": g.material("inside bell", (0.18,0.09,0.018,1), .65, .34),
        "silver": g.material("silver keywork", (.72,.76,.79,1), .92, .16),
        "pearl": g.material("pearl touch", (.88,.86,.74,1), .08, .22),
        "black": g.material("mouthpiece", (.015,.018,.022,1), .18, .3),
        "wood": g.material("grenadilla", (.055,.035,.022,1), .10, .30),
        "maple": g.material("maple", (.44,.22,.095,1), .08, .34),
        "recorder": g.material("recorder wood", (.62,.40,.19,1), .06, .38),
        "cork": g.material("cork and reed", (.67,.43,.20,1), .02, .78),
        "hole": g.material("tone hole", (.012,.010,.009,1), .0, .58),
    }


def add_curve(g: GLB, mesh: int, points: list[tuple[float,float,float]], radius: float, prefix: str):
    for i in range(len(points)-1): g.segment(f"{prefix}_{i+1}", mesh, points[i], points[i+1], radius, {"partType":"tube"})


def build_sax(spec):
    g=GLB(spec["name"]); m=palette(g); brass=g.mesh("cylinder",m["brass"]); dark=g.mesh("cylinder",m["dark_brass"])
    pearl=g.mesh("cylinder",m["pearl"]); black=g.mesh("cylinder",m["black"]); cork=g.mesh("cylinder",m["cork"])
    s=spec["scale"]**0.32
    if spec["shape"]=="straight":
        g.node("body", g.mesh("cylinder",m["brass"],.73,1.0), (0,0,0),(0.32*s,5.0*s,0.32*s), extras={"partType":"body","label":"Conical body"})
        g.node("bell", g.mesh("cylinder",m["brass"],.48,1.35), (0,-2.82*s,0),(0.60*s,1.15*s,0.60*s), rotation=(0,0,1,0), extras={"partType":"bell"})
        g.node("bell_interior", dark, (0,-3.39*s,0),(0.55*s,.035,.55*s), extras={"partType":"bellInterior"})
        add_curve(g,brass,[(0,2.5*s,0),(-.18*s,2.88*s,0),(-.66*s,3.02*s,0)],.18*s,"neck")
        mouth=(-1.14*s,3.03*s,0)
    else:
        g.node("body", g.mesh("cylinder",m["brass"],.78,1.0), (0,.30*s,0),(0.34*s,5.15*s,0.34*s), extras={"partType":"body","label":"Conical body"})
        add_curve(g,brass,[(0,-2.28*s,0),(0,-2.72*s,0),(.28*s,-3.00*s,0),(.72*s,-3.04*s,0),(1.02*s,-2.72*s,0)],.38*s,"bow")
        g.node("bell_stack", brass, (1.02*s,-1.55*s,0),(.39*s,2.32*s,.39*s), extras={"partType":"bellTube"})
        g.node("bell", g.mesh("cylinder",m["brass"],1.45,.56), (1.02*s,.02*s,0),(.70*s,1.18*s,.70*s), extras={"partType":"bell"})
        g.node("bell_interior", dark, (1.02*s,.62*s,0),(.66*s,.035,.66*s), extras={"partType":"bellInterior"})
        add_curve(g,brass,[(0,2.88*s,0),(-.06*s,3.30*s,0),(-.38*s,3.61*s,0),(-.88*s,3.68*s,0),(-1.26*s,3.46*s,0)],.19*s,"neck")
        mouth=(-1.72*s,3.31*s,0)
    g.node("cork",cork,(mouth[0]+.24*s,mouth[1]+.06*s,0),(.17*s,.44*s,.17*s),rotation=(0,0,.707,.707),extras={"partType":"cork"})
    g.node("mouthpiece",black,mouth,(.22*s,.90*s,.19*s),rotation=(0,0,.707,.707),extras={"partType":"mouthpiece","label":"Mouthpiece and reed"})
    # Main rods reinforce the real saxophone's long linked-key visual language.
    g.node("left_rod",brass,(-.45*s,.55*s,.02*s),(.028*s,4.0*s,.028*s),extras={"partType":"rod"})
    g.node("right_rod",brass,(.47*s,-.30*s,.03*s),(.028*s,3.35*s,.028*s),extras={"partType":"rod"})
    for key_id,label,finger,pos,side in SAX_KEYS:
        x,y,z=(p*s for p in pos)
        extras={"partType":"key","keyId":key_id,"label":label,"finger":finger,"side":side,"interactive":True}
        mesh=pearl if key_id in {"lh1","lh2","lh3","rh1","rh2","rh3"} else brass
        radius=.18*s if mesh==pearl else .15*s
        g.node(f"key__{key_id}",mesh,(x,y,z),(radius,.065*s,radius),rotation=(.707,0,0,.707),extras=extras)
    if spec.get("lowA"):
        g.node("key__lowA",brass,(-.54*s,-1.42*s,-.18*s),(.17*s,.065*s,.17*s),rotation=(.707,0,0,.707),extras={"partType":"key","keyId":"lowA","label":"Baritone low A key","finger":"Left thumb","interactive":True})
    spec["keySystem"]="modern saxophone (shared basic fingering; low A exception on baritone)"
    spec["interactiveControls"]=len(SAX_KEYS)+(1 if spec.get("lowA") else 0)
    g.write(OUT/f"{spec['id']}.glb",spec)


def build_flute(spec):
    g=GLB(spec["name"]); m=palette(g); silver=g.mesh("cylinder",m["silver"]); hole=g.mesh("cylinder",m["hole"])
    s=spec["scale"]**0.30
    g.node("tube",silver,(0,0,0),(3.3*s,.19*s,.19*s),rotation=(0,0,-.707,.707),extras={"partType":"body","label":"Cylindrical bore"})
    g.node("crown",silver,(-3.38*s,0,0),(.25*s,.16*s,.25*s),rotation=(0,0,-.707,.707),extras={"partType":"crown"})
    g.node("lip_plate",g.mesh("sphere",m["silver"]),(-2.55*s,.22*s,0),(.42*s,.10*s,.28*s),extras={"partType":"embouchure","label":"Lip plate and embouchure hole"})
    g.node("embouchure_hole",hole,(-2.55*s,.30*s,0),(.16*s,.018*s,.10*s),extras={"partType":"toneHole"})
    for i,x in enumerate([-1.35,-.95,-.55,-.15,.25,.65,1.05,1.45,1.85,2.25,2.62]):
        z=.20*s if i%2==0 else -.20*s; y=.17*s
        g.node(f"key__k{i+1:02d}",silver,(x*s,y,z),(.18*s,.055*s,.18*s),extras={"partType":"key","keyId":f"k{i+1:02d}","label":f"Flute key {i+1}","interactive":True})
    for z in (-.25,.25): g.node(f"rod_{'front' if z>0 else 'back'}",silver,(.35*s,.04*s,z*s),(.026*s,4.8*s,.026*s),rotation=(0,0,-.707,.707),extras={"partType":"rod"})
    spec.update(keySystem="Boehm-system educational topology",interactiveControls=11,fingering=spec.get("fingering","validation-required"))
    g.write(OUT/f"{spec['id']}.glb",spec)


def build_clarinet(spec):
    g=GLB(spec["name"]); m=palette(g); wood=g.mesh("cylinder",m["wood"]); silver=g.mesh("cylinder",m["silver"]); black=g.mesh("cylinder",m["black"]); hole=g.mesh("cylinder",m["hole"])
    s=spec["scale"]**0.30
    g.node("upper_joint",wood,(0,1.15*s,0),(.30*s,2.25*s,.30*s),extras={"partType":"upperJoint"})
    g.node("lower_joint",wood,(0,-1.05*s,0),(.34*s,2.15*s,.34*s),extras={"partType":"lowerJoint"})
    g.node("barrel",wood,(0,2.48*s,0),(.36*s,.52*s,.36*s),extras={"partType":"barrel"})
    g.node("mouthpiece",black,(0,3.02*s,0),(.31*s,.72*s,.25*s),extras={"partType":"mouthpiece","label":"Single-reed mouthpiece"})
    g.node("bell",g.mesh("cylinder",m["wood"],.52,1.42),(0,-2.72*s,0),(.54*s,1.15*s,.54*s),rotation=(0,0,1,0),extras={"partType":"bell"})
    for i,y in enumerate([1.75,1.38,1.02,.64,.25,-.14,-.55,-.96,-1.36,-1.70]):
        z=.31*s; x=(-.17 if i%2 else .17)*s
        g.node(f"key__k{i+1:02d}",silver,(x,y*s,z),(.15*s,.05*s,.15*s),rotation=(.707,0,0,.707),extras={"partType":"key","keyId":f"k{i+1:02d}","label":f"Clarinet touch {i+1}","interactive":True})
        if i<6: g.node(f"tone_hole_{i+1}",hole,(0,y*s,.32*s),(.10*s,.018*s,.10*s),rotation=(.707,0,0,.707),extras={"partType":"toneHole"})
    g.node("bridge_key",silver,(.38*s,0,0),(.06*s,.45*s,.06*s),extras={"partType":"bridgeKey","label":"Bridge key alignment"})
    spec.update(keySystem="Boehm-system educational topology",interactiveControls=10,fingering="validation-required")
    g.write(OUT/f"{spec['id']}.glb",spec)


def build_oboe(spec):
    g=GLB(spec["name"]); m=palette(g); wood=g.mesh("cylinder",m["wood"]); silver=g.mesh("cylinder",m["silver"]); cork=g.mesh("cylinder",m["cork"])
    s=spec["scale"]**0.30
    g.node("body",g.mesh("cylinder",m["wood"],.72,1.0),(0,0,0),(.28*s,4.9*s,.28*s),extras={"partType":"body","label":"Conical bore"})
    bell_top=1.15 if not spec.get("pearBell") else 1.45
    g.node("bell",g.mesh("cylinder",m["wood"],.56,bell_top),(0,-2.72*s,0),(.48*s,1.02*s,.48*s),rotation=(0,0,1,0),extras={"partType":"bell","label":"Pear bell" if spec.get("pearBell") else "Bell"})
    g.node("staple",silver,(0,2.70*s,0),(.07*s,.45*s,.07*s),extras={"partType":"staple"})
    g.node("double_reed",cork,(0,3.12*s,0),(.13*s,.48*s,.07*s),extras={"partType":"reed","label":"Double reed"})
    for i,y in enumerate([1.95,1.58,1.22,.85,.48,.10,-.28,-.66,-1.04,-1.42,-1.76]):
        x=(.23 if i%2 else -.23)*s; z=.26*s
        g.node(f"key__k{i+1:02d}",silver,(x,y*s,z),(.13*s,.047*s,.13*s),rotation=(.707,0,0,.707),extras={"partType":"key","keyId":f"k{i+1:02d}","label":f"Oboe key {i+1}","interactive":True})
    g.node("left_rod",silver,(-.34*s,.2*s,0),(.022*s,3.7*s,.022*s),extras={"partType":"rod"})
    g.node("right_rod",silver,(.34*s,-.2*s,0),(.022*s,3.45*s,.022*s),extras={"partType":"rod"})
    spec.update(keySystem="Conservatory-system educational topology",interactiveControls=11,fingering="validation-required")
    g.write(OUT/f"{spec['id']}.glb",spec)


def build_bassoon(spec):
    g=GLB(spec["name"]); m=palette(g); maple=g.mesh("cylinder",m["maple"]); silver=g.mesh("cylinder",m["silver"]); cork=g.mesh("cylinder",m["cork"])
    s=spec["scale"]**0.28
    # Folded bore: long joint and wing joint meet in the boot.
    g.node("long_joint",g.mesh("cylinder",m["maple"],.88,1.0),(-.28*s,.42*s,0),(.29*s,5.25*s,.29*s),extras={"partType":"longJoint","label":"Long joint"})
    g.node("wing_joint",g.mesh("cylinder",m["maple"],.84,1.0),(.35*s,-.25*s,0),(.25*s,4.15*s,.25*s),extras={"partType":"wingJoint","label":"Wing joint"})
    add_curve(g,maple,[(-.28*s,-2.2*s,0),(-.30*s,-2.65*s,0),(0,-2.92*s,0),(.35*s,-2.65*s,0),(.35*s,-2.32*s,0)],.33*s,"boot")
    g.node("bell",g.mesh("cylinder",m["maple"],1.08,.88),(-.28*s,3.26*s,0),(.38*s,.85*s,.38*s),extras={"partType":"bell"})
    add_curve(g,silver,[(.35*s,1.82*s,0),(.72*s,2.05*s,0),(.83*s,2.48*s,0),(1.08*s,2.72*s,0)],.055*s,"bocal")
    g.node("double_reed",cork,(1.24*s,2.87*s,0),(.12*s,.43*s,.065*s),rotation=(0,0,-.38,.92),extras={"partType":"reed","label":"Double reed"})
    for i,y in enumerate([1.72,1.32,.92,.52,.10,-.34,-.78,-1.20,-1.60,-1.92]):
        tube_x=(-.28 if i<6 else .35)*s; x=tube_x+((-.27 if i%2 else .27)*s); z=.27*s
        g.node(f"key__k{i+1:02d}",silver,(x,y*s,z),(.13*s,.05*s,.13*s),rotation=(.707,0,0,.707),extras={"partType":"key","keyId":f"k{i+1:02d}","label":f"Bassoon key {i+1}","interactive":True})
    spec.update(keySystem="Heckel-system educational topology",interactiveControls=10,fingering="validation-required")
    g.write(OUT/f"{spec['id']}.glb",spec)


def build_recorder(spec):
    g=GLB(spec["name"]); m=palette(g); wood=g.mesh("cylinder",m["recorder"]); hole=g.mesh("cylinder",m["hole"])
    s=spec["scale"]**0.30
    g.node("body",g.mesh("cylinder",m["recorder"],.82,1.0),(0,-.10*s,0),(.32*s,4.65*s,.32*s),extras={"partType":"body","label":"Tapered recorder body"})
    g.node("foot",g.mesh("cylinder",m["recorder"],.82,1.18),(0,-2.62*s,0),(.39*s,.70*s,.39*s),rotation=(0,0,1,0),extras={"partType":"footJoint"})
    g.node("head",wood,(0,2.55*s,0),(.43*s,.95*s,.43*s),extras={"partType":"headJoint"})
    g.node("beak",g.mesh("box",m["recorder"]),(0,3.14*s,0),(.38*s,.44*s,.28*s),extras={"partType":"mouthpiece","label":"Beak and windway"})
    g.node("window",g.mesh("box",m["hole"]),(0,2.58*s,.39*s),(.22*s,.20*s,.025*s),extras={"partType":"window","label":"Window and labium"})
    ys=[1.72,1.30,.86,.42,-.04,-.50,-.96,-1.42]
    labels=["Thumb hole","Hole 1","Hole 2","Hole 3","Hole 4","Hole 5","Hole 6","Hole 7"]
    for i,(y,label) in enumerate(zip(ys,labels)):
        z=(-.31 if i==0 else .31)*s
        x=(.08 if i in (5,7) else 0)*s
        g.node(f"key__hole{i}",hole,(x,y*s,z),(.11*s,.022*s,.11*s),rotation=(.707,0,0,.707),extras={"partType":"toneHole","keyId":f"hole{i}","label":label,"interactive":True})
    spec.update(keySystem="Baroque recorder educational topology",interactiveControls=8,fingering="validation-required")
    g.write(OUT/f"{spec['id']}.glb",spec)


BUILDERS={"sax":build_sax,"flute":build_flute,"clarinet":build_clarinet,"oboe":build_oboe,"bassoon":build_bassoon,"recorder":build_recorder}


def main():
    generated=[]
    for raw in CATALOG:
        spec=dict(raw)
        BUILDERS[spec["template"]](spec)
        generated.append({**spec,"file":f"glb/{spec['id']}.glb","modelStatus":"educational-geometry-v1","reviewStatus":"specialist-review-required" if spec.get("fingering")!="complete-core-range" else "core-fingering-mapped"})
    manifest={"schemaVersion":1,"generatedBy":"Bocal educational model generator 1.0","license":"CC BY 4.0","scopeNote":"Stylized learning assets, not CAD, repair, or manufacturing references.","instrumentCount":len(generated),"instruments":generated}
    (ROOT/"catalog.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"generated {len(generated)} GLB files in {OUT}")


if __name__=="__main__": main()
