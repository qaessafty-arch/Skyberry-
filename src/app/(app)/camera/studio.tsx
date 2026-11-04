"use client";
import { Camera, CameraOff, Circle, FlipHorizontal2, RotateCcw, Send, Square, Star, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Spinner } from "@/components/ui";
import { saveItem } from "@/features/actions";
import { timeLeft } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/client";
import { precheck, uploadMedia } from "@/lib/upload-client";

export type MomentItem = {
  id: string; authorId: string; authorName: string; authorUsername: string; authorAvatar: string | null; accent: string; url: string;
  kind: "image" | "video"; caption: string; overlay: string; expiresAt: string; createdAt: string; viewed: boolean; mine: boolean; seenBy: number;
};
type Captured = { blob: Blob; url: string; kind: "image" | "video"; name: string };
type CamState = "idle" | "starting" | "live" | "denied" | "unsupported" | "error";

export function CameraStudio({ meId, moments, friends, initialTab, focusAuthor, focusMoment }: {
  meId: string; moments: MomentItem[]; friends: { id: string; name: string }[]; initialTab: "capture" | "moments"; focusAuthor?: string; focusMoment?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="mx-auto max-w-3xl">
      <div role="tablist" aria-label="Camera sections" className="mb-4 flex gap-2">
        {(["capture", "moments"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-soft"}`}>
            {t === "capture" ? "Capture" : `Moments${moments.length ? ` (${moments.length})` : ""}`}
          </button>
        ))}
      </div>
      {tab === "capture" ? <Capture friends={friends} onShared={() => setTab("moments")} /> : <MomentsView moments={moments} meId={meId} focusAuthor={focusAuthor} focusMoment={focusMoment} />}
    </div>
  );
}

function Capture({ friends, onShared }: { friends: { id: string; name: string }[]; onShared: () => void }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [cam, setCam] = useState<CamState>("idle");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [recording, setRecording] = useState(false);
  const [shot, setShot] = useState<Captured | null>(null);
  const [caption, setCaption] = useState("");
  const [overlay, setOverlay] = useState("");
  const [audience, setAudience] = useState<"friends" | "selected" | "private">("friends");
  const [selected, setSelected] = useState<string[]>([]);
  const [ttl, setTtl] = useState(24);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRecord = typeof window !== "undefined" && typeof MediaRecorder !== "undefined";

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);
  const start = useCallback(async (face: "user" | "environment") => {
    if (!navigator.mediaDevices?.getUserMedia) { setCam("unsupported"); return; }
    setCam("starting"); stop();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
      setCam("live");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setCam(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "unsupported" : "error");
    }
  }, [stop]);

  useEffect(() => () => { stop(); }, [stop]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  function snap() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d"); if (!ctx) return;
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { setShot({ blob: b, url: URL.createObjectURL(b), kind: "image", name: "photo.jpg" }); stop(); } }, "image/jpeg", 0.88);
  }
  function toggleRecord() {
    if (recording) { recorder.current?.stop(); return; }
    if (!stream.current) return;
    const mime = ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    try {
      const r = new MediaRecorder(stream.current, mime ? { mimeType: mime, videoBitsPerSecond: 2_000_000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        setRecording(false);
        const type = r.mimeType || "video/webm";
        const b = new Blob(chunks.current, { type });
        setShot({ blob: b, url: URL.createObjectURL(b), kind: "video", name: type.includes("mp4") ? "clip.mp4" : "clip.webm" }); stop();
      };
      r.start(); recorder.current = r; setRecording(true);
      setTimeout(() => r.state === "recording" && r.stop(), 30_000); // 30s clips
    } catch { setError("Video recording isn't supported on this device."); }
  }
  function pickFile(f?: File) {
    if (!f) return;
    const bad = precheck(f); if (bad) { setError(bad); return; }
    setError(null); stop();
    setShot({ blob: f, url: URL.createObjectURL(f), kind: f.type.startsWith("video/") ? "video" : "image", name: f.name });
  }
  function retake() { setShot(null); setPct(null); setError(null); void start(facing); }

  async function share() {
    if (!shot) return;
    if (audience === "selected" && selected.length === 0) { setError("Choose at least one person."); return; }
    setError(null); setPct(0);
    try {
      const file = new File([shot.blob], shot.name, { type: shot.blob.type });
      const up = await uploadMedia(file, "moment", setPct);
      const { error: err } = await getBrowserClient().rpc("create_moment", { p_media: up.id, p_caption: caption, p_overlay: overlay, p_audience: audience, p_selected: selected, p_ttl_hours: ttl });
      if (err) throw new Error("Couldn't share your Moment. Please retry.");
      setShot(null); setCaption(""); setOverlay(""); setPct(null);
      router.refresh(); onShared();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); setPct(null); }
  }

  const fallback = (cam === "denied" || cam === "unsupported" || cam === "error");
  return (
    <section aria-label="Capture a Moment" className="grid gap-4">
      {!shot ? (
        <div className="card relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-black">
          <video ref={video} playsInline muted aria-label="Camera preview" className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""} ${cam === "live" ? "" : "invisible"}`} />
          {cam !== "live" && (
            <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-6 text-center text-white">
              {cam === "starting" ? <Spinner label="Starting camera" /> : fallback ? <CameraOff aria-hidden size={40} /> : <Camera aria-hidden size={40} />}
              <p className="max-w-xs text-sm">
                {cam === "denied" ? "Camera access is blocked. Allow it in your browser settings, or upload a photo or video instead."
                  : cam === "unsupported" ? "No camera was found on this device. You can upload a photo or video instead."
                  : cam === "error" ? "The camera couldn't start. Close other apps using it and try again, or upload instead."
                  : "Take a photo or short video to share a Moment with your friends."}
              </p>
              {cam !== "starting" && cam !== "unsupported" && <button className="btn btn-primary" onClick={() => void start(facing)}>{fallback ? "Try again" : "Turn on camera"}</button>}
            </div>
          )}
          {cam === "live" && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-around bg-gradient-to-t from-black/70 to-transparent p-5">
              <button className="btn size-12 bg-white/20 !p-0 text-white" aria-label="Switch camera" onClick={() => { const f = facing === "user" ? "environment" : "user"; setFacing(f); void start(f); }}><FlipHorizontal2 aria-hidden /></button>
              <button className="grid size-[72px] place-items-center rounded-full border-4 border-white" aria-label={recording ? "Stop recording" : "Take photo"} onClick={recording ? toggleRecord : snap}>
                <span className={`block ${recording ? "size-7 rounded-md" : "size-14 rounded-full"} bg-white`} />
              </button>
              <button className={`btn size-12 !p-0 text-white ${recording ? "bg-danger" : "bg-white/20"}`} disabled={!canRecord} aria-label={recording ? "Stop recording" : "Record video"} aria-pressed={recording} onClick={toggleRecord}>
                {recording ? <Square aria-hidden size={18} /> : <Circle aria-hidden size={18} />}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="card mx-auto grid w-full max-w-md gap-4 p-4">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            {shot.kind === "image"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={shot.url} alt="Preview of your photo" className="size-full object-cover" />
              : <video src={shot.url} controls playsInline className="size-full object-cover" />}
            {overlay && <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center font-display text-3xl font-extrabold text-white [text-shadow:0_2px_12px_rgba(0,0,0,.7)]">{overlay}</p>}
          </div>
          <div><label htmlFor="ov" className="label">Text on your Moment</label><input id="ov" className="field" maxLength={80} value={overlay} onChange={(e) => setOverlay(e.target.value)} /></div>
          <div><label htmlFor="cap" className="label">Caption</label><input id="cap" className="field" maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="aud" className="label">Who can see it</label>
              <select id="aud" className="field" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
                <option value="friends">All connections</option><option value="selected">Selected people</option><option value="private">Only me</option></select></div>
            <div><label htmlFor="ttl" className="label">Disappears after</label>
              <select id="ttl" className="field" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
                <option value={1}>1 hour</option><option value={6}>6 hours</option><option value={24}>24 hours</option><option value={72}>3 days</option></select></div>
          </div>
          {audience === "selected" && (
            <fieldset className="grid gap-1"><legend className="label">Choose people</legend>
              {friends.length === 0 ? <p className="text-sm text-dim">Connect with friends first.</p> : friends.map((f) => (
                <label key={f.id} className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5 accent-[var(--berry)]" checked={selected.includes(f.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id)))} />{f.name}</label>))}
            </fieldset>
          )}
          {pct !== null && <div role="progressbar" aria-label="Upload progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-berry transition-all" style={{ width: `${pct}%` }} /></div>}
          <div className="flex gap-2">
            <button className="btn btn-soft" onClick={retake} disabled={pct !== null}><RotateCcw aria-hidden size={16} />Retake</button>
            <button className="btn btn-primary flex-1" onClick={() => void share()} disabled={pct !== null}>{pct !== null ? <Spinner label="Uploading" /> : <Send aria-hidden size={16} />}{error && pct === null ? "Retry share" : "Share Moment"}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mx-auto max-w-md text-sm text-danger">{error}</p>}
      {!shot && (
        <div className="mx-auto"><label className="btn btn-soft cursor-pointer"><Upload aria-hidden size={16} />Upload instead
          <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={(e) => pickFile(e.target.files?.[0])} /></label></div>
      )}
    </section>
  );
}

function MomentsView({ moments, meId, focusAuthor, focusMoment }: { moments: MomentItem[]; meId: string; focusAuthor?: string; focusMoment?: string }) {
  const router = useRouter();
  const groups = useMemo(() => {
    const m = new Map<string, MomentItem[]>();
    for (const x of [...moments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) m.set(x.authorId, [...(m.get(x.authorId) ?? []), x]);
    return [...m.values()].sort((a, b) => Number(a[0]?.mine ?? 0) - Number(b[0]?.mine ?? 0) || Number(a.every((i) => i.viewed)) - Number(b.every((i) => i.viewed)));
  }, [moments]);
  const [open, setOpen] = useState<{ group: MomentItem[]; index: number } | null>(() => {
    const g = groups.find((g) => g[0]?.authorId === focusAuthor || g.some((i) => i.id === focusMoment));
    return g ? { group: g, index: Math.max(0, g.findIndex((i) => i.id === focusMoment)) } : null;
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const cur = open ? open.group[open.index] : undefined;
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (open) { if (!dialog.current?.open) dialog.current?.showModal(); } else dialog.current?.close(); }, [open]);
  useEffect(() => { if (cur && !cur.mine) void getBrowserClient().rpc("record_moment_view", { p_moment: cur.id }); }, [cur]);

  if (!moments.length) return <p className="card-flat p-8 text-center text-dim">No active Moments. Friends&apos; Moments appear here until they expire. Share one from the Capture tab.</p>;
  return (
    <>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {groups.map((g) => { const f = g[0]!; return (
          <li key={f.authorId}>
            <button className="flex w-full flex-col items-center gap-2 rounded-2xl p-2 hover:bg-surface2" onClick={() => setOpen({ group: g, index: 0 })}>
              <span className={`rounded-full p-[3px] ${g.every((i) => i.viewed) || f.mine ? "bg-line" : "bg-gradient-to-br from-[#ff7fb0] to-[#6cc8ff]"}`}><Avatar name={f.authorName} path={f.authorAvatar} accent={f.accent} size={64} className="ring-2 ring-bg" /></span>
              <span className="max-w-full truncate text-xs font-bold">{f.mine ? "Your Moments" : f.authorName}</span><span className="text-[11px] text-faint">{g.length} · {timeLeft(g[g.length - 1]!.expiresAt)}</span>
            </button>
          </li>); })}
      </ul>
      <dialog ref={dialog} onClose={() => setOpen(null)} aria-label="Moment viewer" className="m-auto h-[min(92dvh,820px)] w-[min(96vw,460px)] overflow-hidden rounded-3xl border border-line bg-black p-0 text-white backdrop:bg-black/80">
        {cur && open && (
          <div className="relative size-full">
            {cur.kind === "image"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={cur.url} alt={cur.caption || `Moment from ${cur.authorName}`} className="size-full object-cover" />
              : <video key={cur.id} src={cur.url} autoPlay controls playsInline className="size-full object-cover" />}
            {cur.overlay && <p className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center font-display text-3xl font-extrabold [text-shadow:0_2px_12px_rgba(0,0,0,.7)]">{cur.overlay}</p>}
            <div className="absolute inset-x-0 top-0 flex gap-1 p-3" aria-hidden="true">{open.group.map((m, i) => <span key={m.id} className={`h-1 flex-1 rounded-full ${i <= open.index ? "bg-white" : "bg-white/30"}`} />)}</div>
            <div className="absolute inset-x-0 top-5 flex items-center gap-2 p-3 pt-4"><Avatar name={cur.authorName} path={cur.authorAvatar} accent={cur.accent} size={32} />
              <div className="min-w-0 flex-1 text-sm font-bold [text-shadow:0_1px_6px_rgba(0,0,0,.8)]">{cur.authorName}<span className="ml-2 text-xs font-normal">{timeLeft(cur.expiresAt)}</span></div>
              <button className="btn size-10 bg-black/40 !p-0 text-white" aria-label="Close" onClick={() => setOpen(null)}><X aria-hidden size={18} /></button></div>
            <div className="absolute inset-x-0 bottom-0 grid gap-2 bg-gradient-to-t from-black/80 to-transparent p-4">
              {cur.caption && <p>{cur.caption}</p>}{note && <p role="status" className="text-sm">{note}</p>}
              <div className="flex items-center gap-2">
                <button className="btn btn-sm bg-white/20 text-white" disabled={open.index === 0} onClick={() => setOpen({ ...open, index: open.index - 1 })}>Previous</button>
                <button className="btn btn-sm bg-white/20 text-white" disabled={open.index === open.group.length - 1} onClick={() => setOpen({ ...open, index: open.index + 1 })}>Next</button>
                <span className="flex-1 text-right text-xs">{cur.mine ? `Seen by ${cur.seenBy}` : ""}</span>
                {!cur.mine && <button className="btn btn-sm bg-white/20 text-white" onClick={async () => { const r = await saveItem("moment", cur.id); setNote(r.ok ? "Saved" : r.error ?? "Couldn't save"); }}><Star aria-hidden size={14} />Save</button>}
                {cur.mine && cur.authorId === meId && <button className="btn btn-sm bg-danger/80 text-white" aria-label="Delete Moment" onClick={async () => { if (!confirm("Delete this Moment?")) return; await getBrowserClient().from("moments").delete().eq("id", cur.id); setOpen(null); router.refresh(); }}><Trash2 aria-hidden size={14} /></button>}
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
