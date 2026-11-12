export type PetMood = "glowing" | "content" | "sleepy";
export type Accessory = "cloud_scarf" | "star_charm" | null;

/** Props every companion renderer (procedural or GLB) receives. */
export type PetProps = {
  mood: PetMood;
  level: number;
  accessory: Accessory;
  /** Increments when the user interacts (tap / Interact button) → reaction. */
  reactKey: number;
  /** Increments when the user cares for the pet successfully → happy behaviour. */
  happyKey: number;
  reduceMotion: boolean;
  quality: "high" | "low";
  onTap?: () => void;
  /** Preview only: hold an idle variation (pet lab). */
  forceIdle?: "none" | "sit" | "stretch" | "yawn";
};
