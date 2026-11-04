# Assets & licensing

* **3D**: the Universe scene (planet, orbiting friend orbs, pet creatures) is built from procedural Three.js primitives written for this project — no external models or textures, so there is nothing to license or attribute. Low polygon counts, `powerPreference: low-power`, DPR capped at 1.75, frame loop paused (`demand`) under reduced motion, WebGL-less fallback list.
* **Fonts**: Bricolage Grotesque and Figtree via `@fontsource-variable/*` (SIL Open Font License 1.1), self-hosted by the bundler.
* **Icons**: `lucide-react` (ISC).
* **Logo**: original SVG in `src/components/logo.tsx`.

If external GLB models are added later, store optimized copies in `public/models`, record source + license here, and never hotlink.
