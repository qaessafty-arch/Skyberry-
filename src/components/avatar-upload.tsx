"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera } from "lucide-react";
import { Spinner } from "@/components/ui";

export function AvatarUpload({ slot = "avatar", label }: { slot?: "avatar" | "banner"; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onFile(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2 MB."); return; }
    setBusy(true); setError(null);
    const body = new FormData(); body.set("file", file); body.set("slot", slot);
    const res = await fetch("/api/avatar", { method: "POST", body }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError((await res?.json().catch(() => null))?.error ?? "Upload failed. Try again."); return; }
    router.refresh();
  }
  return (
    <div>
      <label className="btn btn-soft btn-sm cursor-pointer">
        {busy ? <Spinner /> : <Camera aria-hidden size={14} />}{label}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {error && <p role="alert" className="error-text mt-1">{error}</p>}
    </div>
  );
}
