# Bocal Alto Saxophone 3D Model — Specialist Prompt

Copy everything below the divider into a fresh session. Attach the current Bocal screenshot as context. If possible, also attach photographs of the exact alto saxophone you want Bocal to resemble; otherwise the reference instrument below is authoritative.

---

You are a senior Blender hard-surface artist, musical-instrument modeller, Three.js technical artist, and saxophone-mechanism researcher. Work only on the 3D alto saxophone asset for an educational music-learning app called **Bocal**. Do not redesign the Bocal interface and do not build unrelated app features.

## Outcome

Create a convincing, educationally accurate modern E♭ alto saxophone suitable for close inspection and interactive fingering instruction on mobile and desktop. It does not need repair-manual or manufacturing-CAD precision, but its silhouette, proportions, control placement, handedness, tone-hole pads, rods, guards, and visible mechanical relationships must be credible to an experienced saxophonist.

The existing procedural model is visually attractive but mechanically flattened. Replace it with an authored Blender model exported as GLB. Do not merely rearrange primitive cylinders and discs.

## Authoritative physical orientation

Use one coordinate system everywhere:

- Blender units are metres and the model is approximately real-world alto-sax scale.
- `+Y` is upward, from bow toward neck.
- `+Z` points toward the player. A player-view camera sits on the `+Z` side looking toward the instrument.
- `+X` is the player's right.
- `-X` is the player's left.
- `-Z` is the back of the instrument.
- Place the model origin on the bore centreline near the middle of the body.

Do not confuse the player's hands with geometric sides:

- The left-hand main pearls belong on the upper player-facing/front stack.
- The right-hand main pearls belong on the lower player-facing/front stack.
- Those two main stacks are both on the player-facing side; they are vertically separated and subtly wrap around the conical body. They are not supposed to be on opposite sides.
- The left palm keys and left-pinky table must clearly wrap around the player's left side (`-X`).
- The right side keys and right-pinky low-C/low-E♭ controls must clearly wrap around the player's right side (`+X`).
- The octave lever and thumb contact are on the back (`-Z`).
- The front-F touch is high on the player-facing/front side.

The four required validation views are **Player/front**, **Player-left**, **Player-right**, and **Back/thumb**. Use these exact labels; never call an arbitrary camera-left view the instrument's left side.

## Reference instrument and research

Use a gold-lacquer Yamaha YAS-62III E♭ alto saxophone as the primary layout and proportion reference. Create a generic modern alto without Yamaha logos, engraving, or protected brand marks. Use official Yamaha sources first:

- Instrument structure and named components: https://www.yamaha.com/en/musical_instrument_guide/saxophone/mechanism/
- Official saxophone fingering chart: https://www.yamaha.com/en/musical_instrument_guide/saxophone/play/play002.html
- YAS-62III product and mechanism views: https://usa.yamaha.com/products/musical_instruments/winds/saxophones/yas-62iii/index.html

You may consult additional manufacturer diagrams and reputable repair references when an official view is insufficient. Record every source in the handoff. Do not guess a mechanism that can be verified.

## Required instrument anatomy

Model the recognisable four-section alto structure:

1. Curved neck with octave pip/key, receiver tenon, cork, mouthpiece, reed, and ligature.
2. Tapered conical body, not a straight cylinder.
3. U-shaped bow with bow guard.
4. Offset rising bell branch, flared bell, reinforced rim, bell ring, and dark inner throat.

Also include:

- neck receiver collar and neck screw;
- body-to-bell brace with believable attachment points;
- neck-strap ring;
- adjustable right-thumb hook;
- main rod axes, posts, pivots, arms, rollers, and separate key guards;
- pearl touches distinct from brass pad cups;
- visible tone holes and leather-pad faces where appropriate;
- correctly scaled large low-register bell pads;
- left-hand seesaw/pinky table;
- right-hand lower-stack and pinky mechanisms;
- restrained generic bell decoration, if used, with no brand mark.

The model may simplify hidden springs, screws, felts, and manufacturing details, but no simplification may move a player control to the wrong side or make a linkage visibly impossible.

## Touch-pieces that must be separate selectable nodes

Use these exact stable node names:

- `control_octave`
- `control_front_f`
- `control_lh_b`
- `control_lh_bis_bb`
- `control_lh_a`
- `control_lh_g`
- `control_lh_palm_d`
- `control_lh_palm_eb`
- `control_lh_palm_f`
- `control_lh_gsharp`
- `control_lh_low_csharp`
- `control_lh_low_b`
- `control_lh_low_bb`
- `control_rh_f`
- `control_rh_e`
- `control_rh_d`
- `control_rh_side_e`
- `control_rh_side_c`
- `control_rh_side_bb`
- `control_rh_side_fsharp`
- `control_rh_low_c`
- `control_rh_low_eb`

If the chosen reference horn contains another visibly important auxiliary touch, model it and document it without renaming the required nodes.

## Touch-pieces versus linked pads

A touch-piece is where a finger lands. A pad cup is the remote mechanism that closes a tone hole. Do not conflate them.

For every required `control_*` node:

- give it a mechanically plausible pivot or sliding direction;
- identify every linked `pad_*` node it operates;
- animate the finger touch moving inward and the linked pad or pads closing;
- route connecting arms through believable rods and hinge points;
- avoid long unsupported bars crossing the front of the instrument;
- keep unrelated rods and pads stationary;
- make the pressed state readable without exaggerating travel into a toy-like motion.

Create passive `pad_*` nodes for non-player-facing tone holes as needed so the visible mechanism remains complete. Tone-hole count and pad placement should follow the chosen reference closely, but the interactive teaching layer may expose only the required controls.

## Interaction and metadata contract

Create `bocal-alto-sax-keymap.json` with this structure for every control:

```json
{
  "coordinateSystem": {
    "up": "+Y",
    "playerFront": "+Z",
    "playerRight": "+X",
    "units": "metres"
  },
  "controls": {
    "control_lh_b": {
      "hand": "left",
      "finger": "index",
      "region": "upper_front_stack",
      "linkedPads": ["pad_b"],
      "pressClip": "press_control_lh_b",
      "fingerAnchor": "anchor_lh_index_b"
    }
  }
}
```

Include one short glTF animation clip named `press_<control-node-name>` for each control, starting in the fully released pose and ending in the fully pressed/closed pose. Keep every pivot local and export-safe.

Add non-rendering Empty/Null anchor nodes at the actual contact surfaces for future phantom-hand guidance. Use clear names such as:

- `anchor_lh_thumb_octave`
- `anchor_lh_index_b`
- `anchor_lh_middle_a`
- `anchor_lh_ring_g`
- `anchor_rh_index_f`
- `anchor_rh_middle_e`
- `anchor_rh_ring_d`

Add corresponding anchors for palm, side, and pinky controls. Do not model hands in this task.

## Visual direction

- Premium but restrained gold lacquer; realistic enough to read as metal, not mirror chrome.
- Warm brass keywork, subtly differentiated pearl touches, dark pad leather, cork, black mouthpiece, and natural reed.
- No cyan material baked into the model. Bocal will apply interaction highlights at runtime.
- No goofy proportions, oversized keys, floating rods, intersecting pad cups, or impossible arms.
- No logos or brand-specific engraving.
- The model should remain legible against Bocal's near-black interface.

## Mobile performance requirements

- Primary GLB target: no more than roughly 120,000 triangles; lower is better without damaging the silhouette.
- Provide an additional LOD at or below roughly 55,000 triangles.
- Maximum 2K textures; prefer compact PBR materials and shared texture atlases.
- Use no more than eight materials unless you document a strong reason.
- Apply transforms, remove hidden duplicate geometry, merge noninteractive static hardware where safe, and retain separate interactive nodes.
- Embed textures in the GLB.
- Make the primary asset compatible with Three.js `0.180.x` and ordinary `GLTFLoader`.
- Avoid requiring proprietary plug-ins or a maintained backend.

## Required deliverable package

Return one downloadable archive named `bocal-alto-sax-model-package.zip` containing:

1. `bocal-alto-sax.blend` — clean editable Blender source.
2. `bocal-alto-sax.glb` — primary mobile-ready model.
3. `bocal-alto-sax-lod1.glb` — lighter model.
4. `bocal-alto-sax-keymap.json` — controls, hands, fingers, regions, linked pads, animations, and finger anchors.
5. `viewer/index.html` — a self-contained Three.js inspection viewer with orbit controls, four named view buttons, node picking, and a press/release test for every control.
6. `renders/player-front.png`.
7. `renders/player-left.png`.
8. `renders/player-right.png`.
9. `renders/back-thumb.png`.
10. `HANDOFF.md` — sources, coordinate system, dimensions, node list, animation list, material list, triangle counts, texture sizes, remaining uncertainties, and integration instructions.
11. `VALIDATION.md` — a completed checklist with evidence, not an empty template.

If your environment genuinely cannot generate Blender or GLB binaries, say that immediately and stop. Do not substitute an illustration, screenshot, fake download link, or another procedural mock-up.

## Acceptance tests

Do not call the model complete until all of these pass:

- From player/front view, upper left-hand pearls and lower right-hand pearls are vertically distinct and slightly wrap around the conical body.
- From player-left view, the palm keys and left-pinky table are obvious and reachable.
- From player-right view, the side keys and low-C/low-E♭ controls are obvious and reachable.
- From back view, the octave lever and thumb fittings are correctly placed.
- Touch-pieces are visually distinguishable from remote pad cups.
- Every required control node is present exactly once.
- Every control has a finger anchor, linked-pad entry, and working press animation.
- Pressing one control does not move unrelated controls.
- Low-B and low-B♭ linkages route through supported rods/pivots rather than across empty space.
- The bell, bow, body taper, neck, mouthpiece, reed, ligature, guards, and brace read correctly from all four views.
- Both GLBs load without errors in the supplied Three.js viewer.
- The viewer reports the expected triangle count and lists all required nodes.
- The model contains no logos and no external texture dependencies.

Before delivering, compare all four renders side by side with the cited reference views and correct obvious discrepancies. In your final response, provide the ZIP first, then a brief factual summary of what was validated and what remains uncertain.

