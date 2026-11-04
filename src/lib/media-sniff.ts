/**
 * Detects the real media type from file bytes. The client-supplied MIME type and filename are
 * never trusted: uploads are accepted only if the magic bytes match an allowed format.
 */
export type Sniffed = { mime: string; ext: string; kind: "image" | "video" };

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

export function sniffMedia(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12) return null;
  if (starts(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", kind: "image" };
  if (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) return { mime: "image/gif", ext: "gif", kind: "image" };
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return { mime: "image/webp", ext: "webp", kind: "image" };
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", ext: "webm", kind: "video" };
  if (ascii(bytes, 4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (brand.startsWith("qt")) return { mime: "video/quicktime", ext: "mov", kind: "video" };
    return { mime: "video/mp4", ext: "mp4", kind: "video" };
  }
  return null;
}
