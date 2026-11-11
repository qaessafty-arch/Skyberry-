"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Flame, Heart, Sparkles } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import type { OrbitFriend } from "@/components/universe/scene";
import { carePet, renamePet, updateUniverse } from "@/features/actions";
import { levelProgress, MILESTONES, petMood } from "@/lib/universe";
import type { Pet, Streak } from "@/lib/types";

const Scene = dynamic(() => import("@/components/universe/scene"), { ssr: false, loading: () => <div className="skeleton size-full" aria-label="Loading Universe" /> });

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

export function UniverseClient({ space, pet, friends, earned, reduceMotion }: {
  space: { theme: string; planet: string }; pet: Pet | null; friends: OrbitFriend[]; streaks?: Streak[]; earned: string[]; reduceMotion: boolean;
}) {
  const router = useRouter();
  const gl = useSyncExternalStore(() => () => undefined, webglOk, () => null);
  const osReduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const [picked, setPicked] = useState<OrbitFriend | null>(null);
  const [, start] = useTransition();
  const [name, setName] = useState(pet?.name ?? "Pip");
  const lp = levelProgress(pet?.xp ?? 0);
  const mood = petMood(pet?.last_cared_at ?? null);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header><h1 className="text-4xl font-extrabold md:text-5xl">Your Universe</h1><p className="text-dim">Friends orbit your planet. Brighter, bigger orbs mean longer streaks.</p></header>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card relative h-[min(62vh,520px)] min-h-[300px] w-full min-w-0 overflow-hidden p-0" aria-label="3D Universe">
          {gl === null ? <div className="skeleton size-full" /> : gl ? (
            <Scene planet={space.planet} theme={space.theme} species={pet?.species ?? "berry-fox"} level={lp.level} friends={friends} reduceMotion={reduceMotion || osReduce} onPick={setPicked} />
          ) : <div className="grid size-full place-content-center p-6 text-center text-dim">3D isn&apos;t available on this device. Your Universe is listed below.</div>}
          {picked && (
            <div role="status" className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl border border-line bg-bg/90 p-3 backdrop-blur">
              <div className="min-w-0 flex-1"><b>{picked.name}</b><p className="text-sm text-dim">Pet level {picked.level} · {picked.streak}-day streak</p></div>
              <Link className="btn btn-primary btn-sm" href={`/u/${picked.username}`}>Visit</Link>
              <button className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>Close</button>
            </div>
          )}
        </section>

        <div className="grid content-start gap-4">
          <section className="card p-5" aria-labelledby="pet">
            <h2 id="pet" className="flex items-center gap-2 text-lg font-bold"><Heart aria-hidden size={18} className="text-berryt" />{pet?.name ?? "Pip"} · level {lp.level}</h2>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Level progress" aria-valuenow={lp.pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-gradient-to-r from-berry to-sky" style={{ width: `${lp.pct}%` }} /></div>
            <p className="mt-1 text-sm text-dim">{pet?.xp ?? 0} XP · {lp.next - (pet?.xp ?? 0)} to level {lp.level + 1} · feeling <b>{mood}</b></p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <ActionButton className="btn btn-primary btn-sm" action={async () => { const r = await carePet(); router.refresh(); return r; }}><Sparkles aria-hidden size={14} />Care for {pet?.name ?? "pet"}</ActionButton>
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await renamePet(name); router.refresh(); }); }}>
                <label className="sr-only" htmlFor="pn">Pet name</label><input id="pn" className="field !min-h-9 !w-32 !py-1" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
                <button className="btn btn-soft btn-sm">Rename</button></form>
            </div>
            <p className="hint mt-2">XP comes from chatting (capped daily), caring (every 4 hours), streak days and games.</p>
          </section>
          <section className="card p-5" aria-labelledby="look">
            <h2 id="look" className="mb-3 text-lg font-bold">Make it yours</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="pl">Planet</label><select id="pl" className="field" defaultValue={space.planet} onChange={(e) => start(async () => { await updateUniverse(space.theme, e.target.value); router.refresh(); })}>
                {["berry", "lagoon", "ember", "meadow"].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
              <div><label className="label" htmlFor="th">Sky</label><select id="th" className="field" defaultValue={space.theme} onChange={(e) => start(async () => { await updateUniverse(e.target.value, space.planet); router.refresh(); })}>
                {["dusk", "dawn", "aurora", "midnight"].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-5" aria-labelledby="orb"><h2 id="orb" className="mb-3 flex items-center gap-2 text-lg font-bold"><Flame aria-hidden size={18} className="text-sun" />In your orbit</h2>
          {friends.length === 0 ? <p className="text-sm text-dim">Connect with friends and they&apos;ll appear in your sky.</p> : (
            <ul className="grid gap-2">{friends.map((f) => (
              <li key={f.id}><Link href={`/u/${f.username}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface2"><Avatar name={f.name} accent={f.accent} size={36} />
                <span className="flex-1 font-bold">{f.name}</span><span className="chip">Lv {f.level}</span><span className="chip">{f.streak} day streak</span></Link></li>))}</ul>)}
          <p className="hint mt-3">A streak day counts when you both message each other on the same UTC day. Miss a full day and it starts over, with no penalties.</p>
        </section>
        <section className="card p-5" aria-labelledby="ms"><h2 id="ms" className="mb-3 text-lg font-bold">Milestones</h2>
          <ul className="grid gap-2">{Object.entries(MILESTONES).map(([k, v]) => { const got = earned.includes(k); return (
            <li key={k} className={`flex items-center justify-between rounded-xl border border-line px-3 py-2 ${got ? "bg-surface2" : "opacity-60"}`}><span><b>{v.label}</b><span className="block text-sm text-dim">{v.hint}</span></span>{got && <span className="chip !text-mint">Earned</span>}</li>); })}</ul>
        </section>
      </div>
    </div>
  );
}
