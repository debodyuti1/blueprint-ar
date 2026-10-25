# Blueprint AR

Scan an Empire State Building poster and watch it rise, 1929 to 1931. Marker-based web AR: MindAR (image tracking) + three.js, static site on Vercel.

## Flow
Start → scan poster → outline traces onto the building → details → **View Timeline**: blueprint wash on the poster, drag to build through 6 stages → **3D model**: orbitable line model built with the same slider.

## Files
- `index.html`, `style.css`, `js/app.js`: screens and state
- `js/overlay.js`: 2D blueprint drawn on the poster (`assets/outline.json`, traced in poster pixel coords)
- `js/model3d.js`: 3D edge model (`assets/edges.bin`, baked from the GLB)
- `js/stages.js`: the build story + captions
- `assets/poster.jpg`: print this exact image. `assets/targets.mind`: compiled from it
- `poster.html`: shows the poster full screen on a laptop for testing
- `tools/`: scripts used to bake edges and trace the outline

If you change the poster image, recompile `targets.mind` (MindAR compiler) and retrace `outline.json`.

## Credits
3D model: "Empire State Building" by NanoRay (https://sketchfab.com/3d-models/empire-state-building-2174e71baa1d43e896461ed149dad54a), CC BY 4.0.
Dates: ENR archives (https://www.enr.com/articles/60722-the-race-into-the-sky-that-built-the-empire-state-building).
