# Companion (pet) pipeline

## What ships today
Pip the cloud fox is rendered in real time by `src/components/universe/pets/cloud-fox.tsx`:
- **Model:** sculpted procedural surfaces (deep-chested torso, triangular head with muzzle and cheek ruff, cupped ears, shaped legs with paws, a bushy tube tail re-posed every frame) with baked coat colours: cloud white, silver-blue saddle, cream muzzle, sky-tinted ear tips.
- **Fur:** shell texturing on physically based materials with sheen (`fur.tsx`). A per-vertex `furMask` keeps the eyes and nose bare, the muzzle short and the cheeks long.
- **Eyes:** clear-coated spheres with a painted iris (`irisTexture`), animated eyelids.
- **Behaviour:** idle (breathing, blinking, ear twitches, slow look-around), attention (follows the pointer, ears up), happy (after Care: tail wag, small hop), sleepy (24 h without care: lies down, eyes closed, tail curled), react (tap / Interact). Damped springs; still under reduced motion.
- **Progress:** Pip grows slightly with level; accessories unlock at level 3 (Cloud scarf) and 5 (Star charm), enforced in the database (migration 0009).

This is a high-effort procedural character, but it is **not** the same as an artist-authored, semi-realistic model. The pipeline below lets one replace it without code changes.

## Dropping in an authored model
1. Deliver a rigged **GLB** (glTF 2.0), Y-up, facing +Z, standing on the origin, ~1 unit tall to the ear tips.
2. Include animation clips named `Idle`, `Attention`, `Happy`, `Sleepy`, `React` (missing ones fall back to `Idle`).
3. Budget for mobile: ≤ 30k triangles, ≤ 2 materials, textures ≤ 2048² (base colour, normal, ORM), Draco/Meshopt compression welcome.
4. Put it at `public/models/pets/pip.glb` and set `NEXT_PUBLIC_PIP_MODEL_URL=/models/pets/pip.glb`. `GlbPet` loads it and cross-fades clips from mood and events.
5. Preview at `/pet-lab` (build with `NEXT_PUBLIC_ENABLE_PET_LAB=1`), e.g. `/pet-lab?mood=sleepy&level=5&acc=star_charm&planet=lagoon&theme=aurora&cam=face`.
6. Record the source, author and licence in `docs/ASSETS.md`. Never hotlink.

## Adding a species
Add an entry to `SPECIES` in `pets/registry.tsx` with a label, description and either a procedural renderer or a `model` URL. Only finished companions are listed; nothing is shown as a placeholder. Stored species keys are user data and must stay stable.
