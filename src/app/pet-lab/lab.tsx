"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Accessory, PetMood } from "@/components/universe/pets/types";

const Scene = dynamic(() => import("@/components/universe/scene"), { ssr: false });
const FRIENDS = [
  { id: "a", name: "Maya", username: "maya", accent: "sky", level: 3, streak: 6, planet: "lagoon" },
  { id: "b", name: "Leo", username: "leo", accent: "violet", level: 2, streak: 2, planet: "meadow" },
];

export function PetLab(p: { mood: PetMood; level: number; accessory: Accessory; planet: string; theme: string; quality: "high" | "low"; react: boolean; framing: "default" | "face"; pose?: "sit" | "stretch" | "yawn" }) {
  const [reactKey, setReactKey] = useState(0);
  useEffect(() => { if (!p.react) return; const t = setTimeout(() => setReactKey(1), 800); return () => clearTimeout(t); }, [p.react]);
  return (
    <main className="grid h-dvh place-items-stretch bg-space p-0">
      <div className="h-full w-full">
        <Scene planet={p.planet} theme={p.theme} species="berry-fox" level={p.level} mood={p.mood} accessory={p.accessory} friends={FRIENDS}
          selectedFriend={null} reduceMotion={false} quality={p.quality} reactKey={reactKey} happyKey={0} framing={p.framing} forceIdle={p.pose} onPickFriend={() => undefined} onPetTap={() => setReactKey((k) => k + 1)} />
      </div>
    </main>
  );
}
