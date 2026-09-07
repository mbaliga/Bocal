# Bocal 3D model attributions

## Alto saxophone

“saxophone alto” by ANDRIANIAINAToky  
Source: https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27  
License: Creative Commons Attribution 4.0 International (CC BY 4.0)  
License text: https://creativecommons.org/licenses/by/4.0/

The source GLB was optimized for mobile delivery by Bocal. Geometry was quantized and unused data was pruned; the model was not re-rigged.

Bocal's saxophone lab additionally applies runtime material colour and metalness/roughness changes ("Look" panel: body finish, keywork finish, mouthpiece and ligature colour, highlight colour, lighting environment) to the unmodified geometry -- no mesh, UV, or vertex data is changed. An explicit per-mesh classification table (`saxophone-alto.parts.json`) records which named mesh is the body, mouthpiece, ligature or keywork, replacing an earlier heuristic that misclassified every mesh.

## Oboe

“Oboe - Howarth Conservatoire S20C (Instrument)” by WarderiiK  
Source: https://sketchfab.com/3d-models/oboe-howarth-conservatoire-s20c-instrument-bfa1bb7fd7ef4f7c9d3c843f481a38c8  
License: Creative Commons Attribution 4.0 International (CC BY 4.0)  
License text: https://creativecommons.org/licenses/by/4.0/

The source GLB was optimized for mobile delivery by Bocal. Textures were resized and converted to WebP, geometry was quantized, and unused data was pruned. The downloadable source contained two side-by-side finish trees; Bocal retained the standard silver-key `Oboe` tree as the only active scene child. Its internal part hierarchy remains intact. The second, gold-keyed finish tree's nodes and meshes are still present but inactive in the scene graph; its `Gold_Oboe` material and base-colour texture are deliberately kept (not pruned) and are loaded on demand as the "Gold" keywork finish option in Bocal's "Look" panel.

Bocal's oboe lab additionally applies runtime material colour changes (wood tint, key finish) to the unmodified geometry and textures -- the source `map`/`normalMap`/`roughnessMap` are kept and only the base colour is multiplied. An explicit classification (`oboe-howarth-s20c.parts.json`) assigns every mesh to "body" or "keywork" by walking to its `Oboe_Base`/`Static`/`Moving` parent, replacing an earlier heuristic that misclassified every mesh (the whole model rendered one flat colour).

The 3D viewport also fixes a bug where the isolated `Oboe` node was measured for scale before it was reparented into the render scene, dropping an ancestor's 0.01 scale factor and rendering the model roughly 100x too large. No model data was changed by this fix; it is a rendering-code correction.
