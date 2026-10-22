# Bocal adoption directive: Hyle parallel arc navigation

Bocal must consume the shared Hyle two-level arc component rather than maintaining a product-local visual approximation.

View the control as one `400 × 150` stage: lower destination rail, upper contextual rail, left context control and right context control. The side buttons are not floating actions. Their centers are `(18, 50.79)` and `(382, 50.79)`, on the mathematical continuation of the upper curve so their top and bottom edges follow its extrapolated outer arc guides.

Canonical geometry:

- Lower rail: `M22 112 Q200 77 378 112`, stroke 61, round caps.
- Upper rail: `M82.52 40.12 Q200 24.88 317.48 40.12`, stroke 44, round caps.
- Side controls: 44 diameter at the centers above.

Scale and inset the entire stage as one unit. Do not separately scale the upper rail, anchor buttons to screen edges, approximate either curve with an oval, or let the side controls drift down onto the lower arc. Lower icons follow the lower path tangent. The upper rail is a contextual action/readout and temporarily reads the hovered/held destination during scrub navigation.

Typography and controls inherit the geometry. Render upper-rail text with a centered text path on the upper Bézier, never as a flat horizontal label. Rotate the contextual side controls `-11.37°` on the left and `+11.37°` on the right. Each lower destination also uses its tokenized local tangent rotation. Circles remain circular; the rotation is visible in their icon/content and pressed treatment.

If the upper action includes an icon, do not append it to the label. Place a 14-unit icon at the right cap center `(317.48, 40.12)` and rotate it `+7.39°`. The 22-unit cap radius then creates the same 15-unit optical inset from the icon to the top, bottom and right edges.

The canonical reusable assets are maintained in `outputs/hyle/arc-navigation` in the Alloy design task and should be promoted into the Hyle package before Bocal duplicates implementation code.
