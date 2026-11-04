import Image from "next/image";
import { avatarUrl, initials } from "@/lib/format";

const ACCENTS: Record<string, string> = {
  berry: "from-[#ff7fb0] to-[#d92b6b]", sky: "from-[#8fdcff] to-[#3b82f6]", mint: "from-[#8ff5e5] to-[#14b8a6]",
  sun: "from-[#ffe08a] to-[#f59e0b]", violet: "from-[#c4b5fd] to-[#7c3aed]",
};

export function Avatar({ name, path, accent = "berry", size = 44, className = "" }: {
  name: string; path?: string | null; accent?: string; size?: number; className?: string;
}) {
  const url = avatarUrl(path);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (url) {
    return <Image src={url} alt="" width={size} height={size} unoptimized style={style}
      className={`shrink-0 rounded-full object-cover ring-1 ring-line ${className}`} />;
  }
  return (
    <span aria-hidden="true" style={style}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-display font-bold text-white ${ACCENTS[accent] ?? ACCENTS.berry} ${className}`}>
      {initials(name) || "?"}
    </span>
  );
}
