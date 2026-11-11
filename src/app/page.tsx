import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, Gamepad2, MessageCircle, Orbit, ShieldCheck, Users } from "lucide-react";
import { Wordmark } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const FEATURES = [
  { Icon: MessageCircle, title: "Chats that feel close", body: "Direct messages and groups with live typing, read markers and photo sharing." },
  { Icon: Users, title: "Rooms with real roles", body: "Open a public room or keep it private. Owners, admins and moderators each get exactly the powers they need." },
  { Icon: Camera, title: "Moments that expire", body: "Share a photo or clip with friends, a hand-picked few, or just you. It disappears when the timer ends." },
  { Icon: Orbit, title: "Your Universe", body: "A small 3D world where friends orbit your planet, Pip grows with you, and streaks are earned by actually talking." },
  { Icon: Gamepad2, title: "Games with friends", body: "Turn-based games that sync live and keep your place, even if you close the app." },
  { Icon: ShieldCheck, title: "Private by design", body: "Every chat, Moment and file is protected by database-level access rules, not just hidden in the interface." },
];

export default async function Landing() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/home");
  }
  return (
    <div className="mx-auto max-w-6xl px-5">
      <header className="flex h-20 items-center justify-between">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-1">
          <Link href="/login" className="btn btn-ghost">Log in</Link>
          <Link href="/register" className="btn btn-primary">Join Skyberry</Link>
        </nav>
      </header>

      <section className="grid items-center gap-10 py-10 md:grid-cols-[1.05fr_.95fr] md:py-16">
        <div className="rise">
          <p className="chip mb-5 !border-sky/40 !bg-white !text-brandt">A small, private social world</p>
          <h1 className="text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] md:text-[64px]">
            Stay close,<br /><span className="text-brandt">under one sky.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[17px] text-dim">
            Skyberry brings your people, rooms, Moments and games together with Pip, a companion that grows as your friendships do.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">Create your account</Link>
            <Link href="/login" className="btn btn-soft">I already have one</Link>
          </div>
        </div>

        <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[440px]">
          <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(120%_120%_at_30%_10%,var(--space-3),var(--space)_70%)] shadow-[var(--shadow-2)]" />
          <div className="absolute inset-0 overflow-hidden rounded-[40px]">
            {Array.from({ length: 34 }).map((_, i) => (
              <span key={i} className="absolute rounded-full bg-white" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, width: i % 5 ? 2 : 3, height: i % 5 ? 2 : 3, opacity: 0.25 + ((i * 7) % 10) / 20 }} />
            ))}
            <div className="absolute -bottom-[38%] left-1/2 size-[118%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_42%_18%,#e6f8ff_0%,#8fdcff_16%,#48b9f2_36%,#1f7fc0_58%,#0d2945_86%)] shadow-[0_-20px_80px_rgba(112,208,248,.35)]" />
            <div className="absolute -bottom-[38%] left-1/2 size-[124%] -translate-x-1/2 rounded-full border border-[#8fdcff]/25" />
            <span className="absolute right-[14%] top-[16%] size-9 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#a9e4ff_45%,#3d9bd4)]" />
            <span className="absolute left-[12%] top-[30%] size-5 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#c8bdff_50%,#6b5bd6)]" />
          </div>
          <div className="glass absolute bottom-6 left-6 right-6 flex items-center gap-3 rounded-[20px] p-3">
            <span className="grid size-10 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#bfeaff,#48b9f2_55%,#123b5a)] text-white"><Orbit size={18} /></span>
            <span className="min-w-0 text-sm"><b className="block text-ink">Pip reached level 5</b><span className="text-dim">A seven-day streak, kept together</span></span>
          </div>
        </div>
      </section>

      <section aria-labelledby="f" className="pb-20">
        <h2 id="f" className="sr-only">Features</h2>
        <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-white text-brandt shadow-[var(--shadow-1)] ring-1 ring-line"><Icon aria-hidden size={21} /></span>
              <span><h3 className="text-[16px] font-extrabold">{title}</h3><p className="mt-1 text-[14.5px] text-dim">{body}</p></span>
            </li>
          ))}
        </ul>
      </section>
      <footer className="border-t border-line py-8 text-sm text-faint">Skyberry · Built with Next.js and Supabase</footer>
    </div>
  );
}
