import Image from "next/image";
import { avatarUrl, initials } from "@/lib/format";

// Stored accent keys are unchanged (user data); they map onto the sky palette.
const ACCENTS: Record<string, string> = {
  berry: "from-[#9fb3ff] to-[#5c76e0]",   // periwinkle
  sky: "from-[#8fdcff] to-[#218bcb]",
  mint: "from-[#9cefe3] to-[#1f9c8b]",
  sun: "from-[#ffd88f] to-[#d98a22]",
  violet: "from-[#c8bdff] to-[#7a68e3]",
};
export const ACCENT_LABELS: Record<string, string> = { berry: "Periwinkle", sky: "Sky", mint: "Glacier", sun: "Sunrise", violet: "Lavender" };

export function Avatar({ name, path, accent = "sky", size = 44, className = "", ring = false }: {
  name: string; path?: string | null; accent?: string; size?: number; className?: string; ring?: boolean;
}) {
  const url = avatarUrl(path);
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) };
  const ringCls = ring ? "ring-2 ring-white shadow-[0_2px_8px_rgba(35,108,150,.18)]" : "";
  if (url) {
    return <Image src={url} alt="" width={size} height={size} unoptimized style={style}
      className={`shrink-0 rounded-full object-cover ${ringCls} ${className}`} />;
  }
  return (
    <span aria-hidden="true" style={style}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-bold tracking-tight text-white ${ACCENTS[accent] ?? ACCENTS.sky} ${ringCls} ${className}`}>
      {initials(name) || "?"}
    </span>
  );
}
