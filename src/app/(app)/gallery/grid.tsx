"use client";
import { Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteMedia, saveItem } from "@/features/actions";

type Item = { id: string; url: string; kind: "image" | "video"; mine: boolean };

export function GalleryGrid({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<Item | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {items.map((it) => (
          <li key={it.id}>
            <button className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-surface" onClick={() => setOpen(it)} aria-label={`Open ${it.kind}`}>
              {it.kind === "image"
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={it.url} alt="" loading="lazy" className="size-full object-cover" />
                : <video src={it.url} preload="metadata" muted className="size-full object-cover" />}
              {it.kind === "video" && <span className="absolute bottom-2 left-2 chip">Video</span>}
            </button>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} onClose={() => setOpen(null)} aria-label="Media viewer" className="m-auto w-[min(96vw,900px)] rounded-3xl border border-line bg-bg p-3 text-ink backdrop:bg-black/70">
        {open && (
          <div className="grid gap-3">
            <div className="flex justify-end gap-2">
              <button className="btn btn-soft btn-sm" onClick={async () => { const r = await saveItem("media", open.id); setNote(r.ok ? "Saved" : r.error ?? "Failed"); }}><Star aria-hidden size={14} />Save</button>
              {open.mine && <button className="btn btn-danger btn-sm" onClick={async () => { if (!confirm("Delete this file everywhere it was shared?")) return; const r = await deleteMedia(open.id); if (r.ok) { setOpen(null); location.reload(); } else setNote(r.error ?? "Failed"); }}><Trash2 aria-hidden size={14} />Delete</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(null)} aria-label="Close viewer"><X aria-hidden size={16} /></button>
            </div>
            {open.kind === "image"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={open.url} alt="Selected media" className="max-h-[75vh] w-full rounded-2xl object-contain" />
              : <video src={open.url} controls autoPlay className="max-h-[75vh] w-full rounded-2xl" />}
            {note && <p role="status" className="text-sm text-dim">{note}</p>}
          </div>
        )}
      </dialog>
    </>
  );
}
