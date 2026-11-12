"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Orbit, Search, Sparkles, UserRound } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { AvatarUpload } from "@/components/avatar-upload";
import { Wordmark } from "@/components/logo";
import { ErrorNote, Spinner } from "@/components/ui";
import { finishWelcome, skipWelcome } from "@/features/actions";

const STEPS = [
  { title: "Make it yours", Icon: UserRound },
  { title: "Meet your companion", Icon: Orbit },
  { title: "Find your people", Icon: Search },
];

export function Welcome({ displayName, avatarPath, accent }: { displayName: string; avatarPath: string | null; accent: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(displayName);
  const [pet, setPet] = useState("Pip");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const finish = (to: string) => start(async () => {
    const r = await finishWelcome(name, pet);
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    router.replace(to);
  });

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Wordmark />
        <form action={skipWelcome}><button className="btn btn-ghost btn-sm">Skip</button></form>
      </div>
      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((s, i) => <li key={s.title} aria-current={i === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-sky" : "bg-line"}`}><span className="sr-only">{s.title}</span></li>)}
      </ol>
      <section className="card rise p-6" aria-labelledby="wt" key={step}>
        <p className="eyebrow">Step {step + 1} of 3</p>
        <h1 id="wt" className="mb-4 mt-1 text-[24px] font-extrabold leading-tight">{STEPS[step]!.title}</h1>
        {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

        {step === 0 && (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={name || "You"} path={avatarPath} accent={accent} size={72} ring />
              <AvatarUpload label="Add a photo" />
            </div>
            <div><label htmlFor="dn" className="label">What should friends call you?</label>
              <input id="dn" className="field" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4">
            <div className="relative grid h-40 place-items-center overflow-hidden rounded-[20px] bg-[radial-gradient(120%_100%_at_50%_110%,#48b9f2,#123b5a_55%,#07182c)] text-white">
              <span className="absolute -bottom-24 size-56 rounded-full bg-[radial-gradient(circle_at_40%_25%,#e8f7ff,#8fdcff_35%,#218bcb_70%)]" />
              <Sparkles aria-hidden className="relative" size={28} />
            </div>
            <p className="text-[15px] text-dim">Every Skyberry account comes with a cloud fox who lives on your planet. Chatting with friends, keeping streaks and playing games help it grow.</p>
            <div><label htmlFor="pn" className="label">Name your companion</label>
              <input id="pn" className="field" value={pet} maxLength={24} onChange={(e) => setPet(e.target.value)} /></div>
          </div>
        )}
        {step === 2 && (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); finish(query.trim().length >= 2 ? `/search?q=${encodeURIComponent(query.trim())}` : "/home"); }}>
            <p className="text-[15px] text-dim">Skyberry is better with friends. Search by name or username. Private profiles never appear in search.</p>
            <div><label htmlFor="fq" className="label">Search people</label>
              <input id="fq" className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. maya" autoCapitalize="none" /></div>
            <button className="btn btn-primary" disabled={pending}>{pending && <Spinner />}{query.trim().length >= 2 ? "Search and finish" : "Finish"}</button>
          </form>
        )}

        {step < 2 && (
          <div className="mt-6 flex justify-between gap-2">
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ArrowLeft aria-hidden size={16} />Back</button>
            <button className="btn btn-primary" onClick={() => { setError(null); if (step === 0 && !name.trim()) { setError("Tell us what to call you"); return; } if (step === 1 && !pet.trim()) { setError("Give your companion a name"); return; } setStep((s) => s + 1); }}>
              Continue<ArrowRight aria-hidden size={16} /></button>
          </div>
        )}
      </section>
    </main>
  );
}
