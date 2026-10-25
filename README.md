# Blueprint AR

Scan an Empire State Building poster and watch it rise, 1929 to 1931. Marker-based web AR: MindAR (image tracking) + three.js, static site on Vercel.

## Flow
Start → scan poster → scan beam + glowing outline → the 3D line model fades in over the photo and lifts off the paper → details → **View Timeline**: turn the knob (or tap stage dots / play) to build through 6 stages, with a rolling floor/date/day counter, weld sparks, a Chrysler Building ghost to pass, and story pins → at 100%, **Press to light the building** (night, warm floors, searchlight, swing music) → **3D model** for a full-screen orbitable view. All sound is synthesized in `js/audio.js`.

## Files
- `index.html`, `style.css`, `js/app.js`: screens and state
- `js/overlay.js`: 2D blueprint drawn on the poster (`assets/outline.json`, traced in poster pixel coords)
- `js/building.js`: shared 3D building (edge lines from `assets/edges.bin`, weld sparks, Chrysler ghost, night lights)
- `js/model3d.js`: full-screen 3D view
- `js/audio.js`: synthesized ambience, UI sounds, finale music
- `js/stages.js`: the build story + captions
- `assets/poster.jpg`: print this exact image. `assets/targets.mind`: compiled from it
- `poster.html`: shows the poster full screen on a laptop for testing
- `tools/`: scripts used to bake edges and trace the outline

If you change the poster image, recompile `targets.mind` (MindAR compiler) and retrace `outline.json`.

## Credits
3D model: "Empire State Building" by NanoRay (https://sketchfab.com/3d-models/empire-state-building-2174e71baa1d43e896461ed149dad54a), CC BY 4.0.
Dates: ENR archives (https://www.enr.com/articles/60722-the-race-into-the-sky-that-built-the-empire-state-building).
