"use client";
import { CloudFox } from "./cloud-fox";
import { GlbPet } from "./glb-pet";
import type { PetProps } from "./types";

/**
 * Companion registry. Keys are the stored `pets.species` values (user data, unchanged).
 * Add a species by giving it a renderer here; only finished companions are listed, so no
 * placeholder is ever shown. To use an authored model, set its `model` URL (a rigged GLB in
 * /public/models/pets with clips Idle/Attention/Happy/Sleepy/React); it replaces the
 * procedural renderer automatically.
 */
export type SpeciesDef = { label: string; description: string; model: string | null; Procedural: (p: PetProps) => React.ReactNode };

export const SPECIES: Record<string, SpeciesDef> = {
  "berry-fox": {
    label: "Cloud fox",
    description: "A small sky fox with a silver-blue saddle and a cloud-white brush tail.",
    model: process.env.NEXT_PUBLIC_PIP_MODEL_URL || null,
    Procedural: CloudFox,
  },
};
const FALLBACK = "berry-fox";

export function speciesOf(key: string | null | undefined): SpeciesDef { return SPECIES[key ?? FALLBACK] ?? SPECIES[FALLBACK]!; }

export function PetRenderer({ species, ...props }: PetProps & { species: string }) {
  const def = speciesOf(species);
  if (def.model) return <GlbPet url={def.model} {...props} />;
  const P = def.Procedural;
  return <P {...props} />;
}
