import { notFound } from "next/navigation";
import { PetLab } from "./lab";

/**
 * Pet preview lab for designers/artists (renders the Universe scene with fixed parameters).
 * Disabled unless NEXT_PUBLIC_ENABLE_PET_LAB=1. Query: mood, level, acc, planet, theme, q, react.
 */
export default async function PetLabPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NEXT_PUBLIC_ENABLE_PET_LAB !== "1") notFound();
  const q = await searchParams;
  return <PetLab mood={(q.mood as "glowing" | "content" | "sleepy") ?? "content"} level={Number(q.level ?? 1)} accessory={(q.acc as "cloud_scarf" | "star_charm") ?? null}
    planet={q.planet ?? "berry"} theme={q.theme ?? "dusk"} quality={(q.q as "high" | "low") ?? "high"} react={q.react === "1"} framing={q.cam === "face" ? "face" : "default"} />;
}
