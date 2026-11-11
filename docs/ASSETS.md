# Assets & licensing

* **3D**: everything in the Universe is generated in code for this project: Pip (sculpted procedural surfaces + shell fur), planets (seamless 3D-noise textures, cloud layer, fresnel atmosphere), sky dome and lighting (local Lightformers, no HDR downloads). No external models or textures, so nothing to license. Performance: shell count and texture resolution drop on phones/low-core devices, DPR capped (1.3 low / 1.75 high), frame loop on demand under reduced motion, WebGL-less fallback. See `docs/PET_PIPELINE.md` for replacing Pip with an authored GLB.
* **Font**: Manrope via `@fontsource-variable/manrope` (SIL Open Font License 1.1), self-hosted by the bundler.
* **Icons**: `lucide-react` (ISC).
* **Logo**: original SVG sky berry in `src/components/logo.tsx` and `src/app/icon.svg`.

If external GLB models are added later, store optimized copies in `public/models`, record source + license here, and never hotlink.
