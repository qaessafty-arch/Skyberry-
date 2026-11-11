/** Browser upload with progress + typed errors. Uses XHR because fetch has no upload progress. */
export type UploadResult = { id: string; kind: "image" | "video" };

export function uploadMedia(file: File, purpose: "message" | "moment" | "gallery", onProgress?: (pct: number) => void, dims?: { width: number; height: number }) {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.set("file", file);
    body.set("purpose", purpose);
    if (dims) { body.set("width", String(dims.width)); body.set("height", String(dims.height)); }
    xhr.open("POST", "/api/media");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new Error("Network error. Check your connection and retry."));
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json);
        else reject(new Error(json.error ?? "Upload failed."));
      } catch { reject(new Error("Upload failed.")); }
    };
    xhr.send(body);
  });
}

/** Hosting request limit (Vercel functions accept ~4.5 MB). Override with NEXT_PUBLIC_UPLOAD_LIMIT_MB. */
const HOST_LIMIT_MB = Number(process.env.NEXT_PUBLIC_UPLOAD_LIMIT_MB ?? 0) || null;
export const CLIENT_MAX = {
  image: 10 * 1024 * 1024,
  video: (HOST_LIMIT_MB ? Math.min(50, HOST_LIMIT_MB) : 50) * 1024 * 1024,
};
/** Early, friendly validation. The server re-validates with magic bytes. Photos are resized first. */
export function precheck(file: File): string | null {
  const isImg = file.type.startsWith("image/"), isVid = file.type.startsWith("video/");
  if (!isImg && !isVid) return "Choose a photo or video.";
  const max = isImg ? CLIENT_MAX.image : CLIENT_MAX.video;
  if (file.size > max) return `That ${isImg ? "photo" : "video"} is too large (max ${Math.round(max / 1048576)} MB).`;
  return null;
}

/**
 * Downscales large photos in the browser (max 2048 px, JPEG ~0.86) so uploads stay small and
 * fit hosting request limits. GIFs (animation) and already-small images are sent unchanged.
 */
export async function preparePhoto(file: File, maxSide = 2048): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // the server still validates
  }
}
