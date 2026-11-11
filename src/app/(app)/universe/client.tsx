"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Award, ChevronRight, Flame, Hand, Heart, Info, Lock, Orbit, Palette, Sparkles, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Spinner } from "@/components/ui";
import { speciesOf } from "@/components/universe/pets/registry";
import type { Accessory } from "@/components/universe/pets/types";
import type { OrbitFriend } from "@/components/universe/scene";
import { carePet, renamePet, setAccessory, updateUniverse } from "@/features/actions";
import { ACCESSORIES, MILESTONES, PLANET_LABELS, SKY_LABELS, levelProgress, petMood } from "@/lib/universe";
import type { Pet, Streak } from "@/lib/types";

const Scene = dynamic(() => import("@/components/universe/scene"), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center bg-[radial-gradient(120%_90%_at_50%_100%,var(--space-3),var(--space)_70%)] text-[#cfe6f5]">
      <span className="flex items-center gap-2 text-sm font-semibold"><Spinner label="Loading Universe" />Waking Pip…</span>
    </div>
  ),
});

type Friend = OrbitFriend & { petName: string };

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
let glCache: boolean | undefined;
function webglOk() {
  if (glCache !== undefined) return glCache;
  try { const c = document.createElement("canvas"); glCache = Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { glCache = false; }
  return glCache;
}
const qualityNow = () => (window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high");
let softCache: boolean | undefined;
/** True when WebGL runs on a CPU rasteriser (no GPU acceleration). */
function softwareGl() {
  if (softCache !== undefined) return softCache;
  try {
    const g = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    const ext = g?.getExtension("WEBGL_debug_renderer_info");
    const name = ext && g ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    softCache = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch { softCache = false; }
  return softCache;
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !ref.current?.open) ref.current?.showModal(); if (!open) ref.current?.close(); }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}
      className="glass m-auto mb-0 w-full max-w-lg rounded-b-none rounded-t-[26px] p-0 text-ink backdrop:bg-[rgba(7,24,44,.45)] backdrop:backdrop-blur-[2px] sm:mb-auto sm:rounded-[26px]">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="section-title">{title}</h2>
        <button className="icon-btn !size-9" onClick={onClose} aria-label="Close"><X aria-hidden size={18} /></button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-5 py-4 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}

export function UniverseClient({ space, pet, friends, earned, reduceMotion }: {
  space: { theme: string; planet: string }; pet: (Pet & { accessory?: string | null }) | null; friends: Friend[];
  streaks?: Streak[]; earned: string[]; reduceMotion: boolean;
}) {
  const router = useRouter();
  const gl = useSyncExternalStore(() => () => undefined, webglOk, () => null);
  const osReduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const quality = useSyncExternalStore(() => () => undefined, qualityNow, () => "low" as const);
  const software = useSyncExternalStore(() => () => undefined, softwareGl, () => false);
  const [paused, setPaused] = useState(false);
  // Mount the 3D canvas only after the page has painted, so text and controls never wait on shader compilation.
  const [stageReady, setStageReady] = useState(false);
  useEffect(() => {
    const go = () => setStageReady(true);
    if (typeof window.requestIdleCallback === "function") { const id = window.requestIdleCallback(go, { timeout: 600 }); return () => window.cancelIdleCallback(id); }
    const t = setTimeout(go, 120);
    return () => clearTimeout(t);
  }, []);
  const stage = useRef<HTMLElement>(null);
  useEffect(() => {
    // Stop the 3D loop the moment the user navigates away, hides the tab or scrolls the scene off-screen.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && a.origin === location.origin && !a.pathname.startsWith("/universe")) setPaused(true);
    };
    let visible = true, onScreen = true;
    const sync = () => setPaused(!(visible && onScreen));
    const onVis = () => { visible = document.visibilityState === "visible"; sync(); };
    const io = new IntersectionObserver(([e]) => { onScreen = Boolean(e?.isIntersecting); sync(); });
    if (stage.current) io.observe(stage.current);
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVis);
    return () => { io.disconnect(); document.removeEventListener("click", onClick, true); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  const [reactKey, setReactKey] = useState(0);
  const [happyKey, setHappyKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "customize" | "details">(null);
  const [note, setNote] = useState<string | null>(null);
  const [caring, startCare] = useTransition();
  const [, start] = useTransition();
  const [name, setName] = useState(pet?.name ?? "Pip");

  const xp = pet?.xp ?? 0;
  const lp = levelProgress(xp);
  const mood = petMood(pet?.last_cared_at ?? null);
  const species = speciesOf(pet?.species);
  const accessory = (pet?.accessory ?? null) as Accessory;
  const still = reduceMotion || osReduce;
  const picked = friends.find((f) => f.id === selected) ?? null;
  const longest = friends.reduce((m, f) => Math.max(m, f.streak), 0);
  const moodLabel = { glowing: "Glowing", content: "Content", sleepy: "Sleepy" }[mood];

  const care = () => startCare(async () => {
    const r = await carePet();
    if (r.ok) { setHappyKey((k) => k + 1); setNote(`${pet?.name ?? "Pip"} loved that. +5 XP`); router.refresh(); }
    else setNote(r.error ?? "Try again later.");
  });

  return (
    <div className="mx-auto grid max-w-6xl gap-5 rise">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow mb-1">Universe</p>
          <h1 className="text-[26px] font-extrabold leading-tight md:text-[30px]">{pet?.name ?? "Pip"}&apos;s sky</h1>
          <p className="mt-1 text-[15px] text-dim">Your companion lives here. Friends&apos; worlds drift nearby and grow as your streaks do.</p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.65fr_1fr]">
        <section ref={stage} aria-label="3D Universe" className="relative h-[min(64dvh,620px)] min-h-[360px] w-full min-w-0 overflow-hidden rounded-[28px] bg-space shadow-[var(--shadow-2)]">
          {gl === null || (gl && !stageReady) ? <div className="grid size-full place-items-center bg-[radial-gradient(120%_90%_at_50%_100%,var(--space-3),var(--space)_70%)] text-[#cfe6f5]"><span className="flex items-center gap-2 text-sm font-semibold"><Spinner label="Loading Universe" />Waking Pip…</span></div> : gl ? (
            <Scene planet={space.planet} theme={space.theme} species={pet?.species ?? "berry-fox"} level={lp.level} mood={mood} accessory={accessory}
              friends={friends} selectedFriend={selected} reduceMotion={still} quality={quality} software={software} paused={paused} reactKey={reactKey} happyKey={happyKey}
              onPickFriend={(f) => setSelected(f?.id ?? null)} onPetTap={() => setReactKey((k) => k + 1)} />
          ) : (
            <div className="grid size-full place-items-center bg-[radial-gradient(120%_90%_at_50%_100%,var(--space-3),var(--space)_70%)] p-8 text-center text-[#cfe6f5]">
              <span><Orbit aria-hidden className="mx-auto mb-3" size={34} />3D isn&apos;t available on this device. Everything about {pet?.name ?? "Pip"} is listed below.</span>
            </div>
          )}
          <p className="glass-dark pointer-events-none absolute left-3 top-3 rounded-full px-3 py-1.5 text-xs font-semibold">Drag to look around · Tap {pet?.name ?? "Pip"}</p>
          {picked && (
            <div role="status" className="glass-dark absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-[18px] p-3">
              <Avatar name={picked.name} accent={picked.accent} size={40} />
              <div className="min-w-0 flex-1">
                <b className="block truncate">{picked.name}&apos;s world</b>
                <p className="text-[13px] text-[#cfe6f5]">{picked.petName} · level {picked.level} · {picked.streak}-day streak</p>
              </div>
              <Link className="btn btn-sm bg-white text-ink hover:bg-ice" href={`/u/${picked.username}`}>Visit</Link>
              <button className="grid size-9 place-items-center rounded-full text-[#cfe6f5] hover:bg-white/10" onClick={() => setSelected(null)} aria-label="Close"><X aria-hidden size={18} /></button>
            </div>
          )}
        </section>

        <div className="grid content-start gap-5">
          <section aria-labelledby="pet" className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">{species.label}</p>
                <h2 id="pet" className="text-[22px] font-extrabold leading-tight">{pet?.name ?? "Pip"}</h2>
              </div>
              <span className={`chip ${mood === "glowing" ? "!border-sky/40 !bg-ice !text-brandt" : ""}`}><Heart aria-hidden size={13} />{moodLabel}</span>
            </div>
            <div className="mt-4 flex items-baseline justify-between text-sm">
              <span className="font-extrabold">Level {lp.level}</span>
              <span className="text-faint">{xp} XP · {lp.next - xp} to level {lp.level + 1}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ice" role="progressbar" aria-label="Level progress" aria-valuenow={lp.pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--sky),var(--cyan))]" style={{ width: `${lp.pct}%` }} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="panel py-2"><dt className="text-[11px] font-bold text-faint">Friends</dt><dd className="font-extrabold">{friends.length}</dd></div>
              <div className="panel py-2"><dt className="text-[11px] font-bold text-faint">Best streak</dt><dd className="inline-flex items-center gap-1 font-extrabold text-warm"><Flame aria-hidden size={14} />{longest}</dd></div>
              <div className="panel py-2"><dt className="text-[11px] font-bold text-faint">Milestones</dt><dd className="font-extrabold">{earned.length}</dd></div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn btn-tint" onClick={() => setReactKey((k) => k + 1)}><Hand aria-hidden size={16} />Interact</button>
              <button className="btn btn-primary" onClick={care} disabled={caring}>{caring ? <Spinner label="Caring" /> : <Sparkles aria-hidden size={16} />}Care</button>
              <button className="btn btn-soft" onClick={() => setSheet("customize")}><Palette aria-hidden size={16} />Customize</button>
              <button className="btn btn-soft" onClick={() => setSheet("details")}><Info aria-hidden size={16} />Details</button>
            </div>
            {note && <p role="status" className="mt-3 text-sm text-dim">{note}</p>}
          </section>

          <section aria-labelledby="orb" className="card p-5">
            <h2 id="orb" className="section-title mb-3 flex items-center gap-2"><Orbit aria-hidden size={18} className="text-brandt" />In your orbit</h2>
            {friends.length === 0 ? <p className="text-sm text-dim">Connect with friends and their worlds appear in your sky. <Link href="/search" className="font-bold text-brandt">Find people</Link></p> : (
              <ul className="-mx-2 grid">
                {friends.map((f) => (
                  <li key={f.id}>
                    <button onClick={() => setSelected(f.id === selected ? null : f.id)} aria-pressed={f.id === selected}
                      className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${f.id === selected ? "bg-ice" : "hover:bg-surface2"}`}>
                      <Avatar name={f.name} accent={f.accent} size={36} />
                      <span className="min-w-0 flex-1"><b className="block truncate text-[15px]">{f.name}</b><span className="text-[13px] text-faint">{PLANET_LABELS[f.planet] ?? "World"} · {f.petName} lv {f.level}</span></span>
                      {f.streak > 0 && <span className="inline-flex items-center gap-1 text-sm font-extrabold text-warm"><Flame aria-hidden size={14} />{f.streak}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Sheet open={sheet === "customize"} onClose={() => setSheet(null)} title={`Customize ${pet?.name ?? "Pip"}`}>
        <form className="mb-5 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await renamePet(name); setNote(r.ok ? "Name saved." : r.error ?? "Couldn't rename."); router.refresh(); }); }}>
          <div className="flex-1"><label className="label" htmlFor="pn">Name</label><input id="pn" className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} /></div>
          <button className="btn btn-soft">Save</button>
        </form>
        <p className="label">Accessory</p>
        <div className="mb-5 grid gap-2">
          {[{ key: null, label: "None", unlock: 1, description: "Just Pip." }, ...ACCESSORIES].map((a) => {
            const locked = lp.level < a.unlock, on = accessory === a.key;
            return (
              <button key={a.label} disabled={locked} aria-pressed={on}
                onClick={() => start(async () => { const r = await setAccessory(a.key); setNote(r.ok ? `${a.label} on.` : r.error ?? "Couldn't change it."); router.refresh(); })}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed ${on ? "border-sky bg-ice" : "border-line hover:border-sky"} ${locked ? "opacity-60" : ""}`}>
                <span className="min-w-0 flex-1"><b className="block">{a.label}</b><span className="text-[13px] text-faint">{a.description}</span></span>
                {locked ? <span className="chip"><Lock aria-hidden size={12} />Level {a.unlock}</span> : on ? <span className="chip !border-sky !text-brandt">Wearing</span> : null}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="pl">Planet</label>
            <select id="pl" className="field" defaultValue={space.planet} onChange={(e) => start(async () => { await updateUniverse(space.theme, e.target.value); router.refresh(); })}>
              {Object.entries(PLANET_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor="th">Sky</label>
            <select id="th" className="field" defaultValue={space.theme} onChange={(e) => start(async () => { await updateUniverse(e.target.value, space.planet); router.refresh(); })}>
              {Object.entries(SKY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
      </Sheet>

      <Sheet open={sheet === "details"} onClose={() => setSheet(null)} title={`About ${pet?.name ?? "Pip"}`}>
        <p className="mb-4 text-[15px] text-dim">{species.description}</p>
        <h3 className="label">How {pet?.name ?? "Pip"} grows</h3>
        <ul className="mb-5 grid gap-1.5 text-[14.5px]">
          <li className="flex justify-between"><span>Chatting with friends</span><b>+1 XP · up to 20 a day</b></li>
          <li className="flex justify-between"><span>Caring (every 4 hours)</span><b>+5 XP</b></li>
          <li className="flex justify-between"><span>Completing a streak day</span><b>+10 XP</b></li>
          <li className="flex justify-between"><span>Games: win · draw · play</span><b>+25 · +10 · +5</b></li>
        </ul>
        <h3 className="label">Milestones</h3>
        <ul className="grid gap-2">
          {Object.entries(MILESTONES).map(([k, v]) => { const got = earned.includes(k); return (
            <li key={k} className={`flex items-center gap-3 rounded-2xl border p-3 ${got ? "border-sky/40 bg-[#f2faff]" : "border-line"}`}>
              <span className={`grid size-8 place-items-center rounded-full ${got ? "bg-sky text-white" : "bg-surface2 text-faint"}`}><Award aria-hidden size={15} /></span>
              <span className="min-w-0 flex-1"><b className={got ? "" : "text-dim"}>{v.label}</b><span className="block text-[13px] text-faint">{got ? "Earned" : v.hint}</span></span>
            </li>); })}
        </ul>
        <Link href="/profile" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brandt">See your profile<ChevronRight aria-hidden size={15} /></Link>
      </Sheet>
    </div>
  );
}
