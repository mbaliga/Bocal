# Bocal 3D model attributions

## Alto saxophone

“saxophone alto” by ANDRIANIAINAToky  
Source: https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27  
License: Creative Commons Attribution 4.0 International (CC BY 4.0)  
License text: https://creativecommons.org/licenses/by/4.0/

The source GLB was optimized for mobile delivery by Bocal. Geometry was quantized and unused data was pruned; the model was not re-rigged.

Bocal's saxophone lab additionally applies runtime material colour and metalness/roughness changes ("Look" panel: body finish, keywork finish, mouthpiece and ligature colour, highlight colour, lighting environment) to the unmodified geometry -- no mesh, UV, or vertex data is changed. An explicit per-mesh classification table (`saxophone-alto.parts.json`) records which named mesh is the body, mouthpiece, ligature or keywork, replacing an earlier heuristic that misclassified every mesh.

**Wave 2 modification (CC BY 4.0 section 3(a)(1)(B) notice):** the `Object_2` primitive, which fused the neck tube, main body, bow (the U-turn) and bell into a single mesh, was re-segmented into four primitives -- `Object_2_neck`, `Object_2_body`, `Object_2_bow`, `Object_2_bell` -- so the "Look" panel's neck-variant and bell-finish options and the exploded view can address each part independently. This was done with `scripts/segment-model.mjs sax-body` (glTF-Transform v4 Document API): every new primitive still references the *same, unmodified* POSITION and NORMAL accessors and the same material as the original `Object_2`; only a new index accessor was created per part (subsetting the original 5768 triangles by a geometric classification -- see the script's header comment for the method), and the old, now-unused index accessor was removed. No vertex was added, removed, moved, or re-quantized, and no UV or normal data changed. The file grew from 1,718,588 to 1,719,816 bytes (+0.07%), all of it new JSON/accessor/bufferView headers from having four primitives instead of one.

## Oboe

“Oboe - Howarth Conservatoire S20C (Instrument)” by WarderiiK  
Source: https://sketchfab.com/3d-models/oboe-howarth-conservatoire-s20c-instrument-bfa1bb7fd7ef4f7c9d3c843f481a38c8  
License: Creative Commons Attribution 4.0 International (CC BY 4.0)  
License text: https://creativecommons.org/licenses/by/4.0/

The source GLB was optimized for mobile delivery by Bocal. Textures were resized and converted to WebP, geometry was quantized, and unused data was pruned. The downloadable source contained two side-by-side finish trees; Bocal retained the standard silver-key `Oboe` tree as the only active scene child. Its internal part hierarchy remains intact. The second, gold-keyed finish tree's nodes and meshes are still present but inactive in the scene graph; its `Gold_Oboe` material and base-colour texture are deliberately kept (not pruned) and are loaded on demand as the "Gold" keywork finish option in Bocal's "Look" panel.

Bocal's oboe lab additionally applies runtime material colour changes (wood tint, key finish) to the unmodified geometry and textures -- the source `map`/`normalMap`/`roughnessMap` are kept and only the base colour is multiplied. An explicit classification (`oboe-howarth-s20c.parts.json`) assigns every mesh to "body" or "keywork" by walking to its `Oboe_Base`/`Static`/`Moving` parent, replacing an earlier heuristic that misclassified every mesh (the whole model rendered one flat colour).

The 3D viewport also fixes a bug where the isolated `Oboe` node was measured for scale before it was reparented into the render scene, dropping an ancestor's 0.01 scale factor and rendering the model roughly 100x too large. No model data was changed by this fix; it is a rendering-code correction.

**Wave 2 modification (CC BY 4.0 section 3(a)(1)(B) notice):** the wooden-body mesh `Oboe_Base_My_Oboe_0` (top joint, lower joint and bell fused into one primitive) was split by local Y into three primitives -- `Oboe_Base_My_Oboe_0_top_joint`, `Oboe_Base_My_Oboe_0_lower_joint`, `Oboe_Base_My_Oboe_0_bell` -- so the exploded view can separate the two joints, with a small procedural cork/tenon ring drawn at each seam. This was done with `scripts/segment-model.mjs axis-split` (glTF-Transform v4 Document API), splitting at Y = -0.85 and Y = 0.65: two narrow bands where a per-vertex radius scan found the mesh has a genuine gap (no vertices at all, not merely low density), i.e. an actual modelled seam in the wood body -- see the script's `recipe-oboe` subcommand for the numbers. Every new primitive still references the same, unmodified POSITION and NORMAL accessors and the same material as the original mesh; only a new index accessor was created per part, and the old one was removed. No vertex, UV or normal data was added, removed, moved, or re-quantized. The cork/tenon rings drawn at the seams are new, simple procedural geometry added by the renderer at runtime (a torus, not part of the licensed GLB); they are not a claim about the real instrument's exact tenon dimensions. The file grew from 2,080,128 to 2,080,980 bytes (+0.04%).
