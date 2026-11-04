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

export const CLIENT_MAX = { image: 10 * 1024 * 1024, video: 50 * 1024 * 1024 };
/** Early, friendly validation. The server re-validates with magic bytes. */
export function precheck(file: File): string | null {
  const isImg = file.type.startsWith("image/"), isVid = file.type.startsWith("video/");
  if (!isImg && !isVid) return "Choose a photo or video.";
  if (file.size > (isImg ? CLIENT_MAX.image : CLIENT_MAX.video)) return `That file is too large (max ${isImg ? 10 : 50} MB).`;
  return null;
}
