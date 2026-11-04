import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Orbit, Camera, Gamepad2, ShieldCheck, Users } from "lucide-react";
import { Wordmark } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const FEATURES = [
  { Icon: MessageCircle, title: "Chats that feel close", body: "Direct messages and groups with live typing, read markers and photo sharing." },
  { Icon: Users, title: "Rooms with real roles", body: "Open a public room or keep it private. Owners, admins and moderators each have exactly the powers they need." },
  { Icon: Camera, title: "Moments that expire", body: "Snap a photo or clip for friends, a hand-picked few, or just you. It disappears when the timer ends." },
  { Icon: Orbit, title: "Your Universe", body: "A living 3D sky where your friends orbit, your pet grows, and streaks are earned by actually talking." },
  { Icon: Gamepad2, title: "Games with friends", body: "Challenge a friend to turn-based games that sync live and never lose your place." },
  { Icon: ShieldCheck, title: "Private by design", body: "Every chat, Moment and file is protected by database-level access rules, not just hidden in the UI." },
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
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">Log in</Link>
          <Link href="/register" className="btn btn-primary">Join free</Link>
        </nav>
      </header>
      <section className="grid items-center gap-10 py-12 md:grid-cols-[1.1fr_.9fr] md:py-20">
        <div className="rise">
          <p className="chip mb-5">A small, private social world</p>
          <h1 className="text-5xl font-extrabold leading-[1.02] md:text-7xl">
            Stay close.<br /><span className="bg-gradient-to-r from-[var(--berry-text)] to-[var(--sky)] bg-clip-text text-transparent">Under one sky.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-dim">
            Skyberry brings your people, rooms, Moments, pets and games into one place that feels like somewhere you want to be, and keeps it yours.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">Create your account</Link>
            <Link href="/login" className="btn btn-soft">I already have one</Link>
          </div>
        </div>
        <div aria-hidden="true" className="relative mx-auto grid aspect-square w-full max-w-md place-items-center">
          <div className="absolute inset-0 rounded-full border border-line" />
          <div className="absolute inset-[12%] rounded-full border border-line" />
          <div className="absolute inset-[26%] rounded-full bg-gradient-to-br from-[#ff7fb0] via-berry to-[#6a1b9a] shadow-[0_0_80px_var(--berry-glow)]" />
          {[["8%", "46%", "#6cc8ff"], ["70%", "10%", "#5eead4"], ["84%", "62%", "#ffc857"], ["28%", "86%", "#a78bfa"]].map(([l, t, c]) => (
            <span key={l} className="absolute size-5 rounded-full shadow-[0_0_20px_currentColor]" style={{ left: l, top: t, background: c, color: c }} />
          ))}
        </div>
      </section>
      <section aria-labelledby="f" className="pb-20">
        <h2 id="f" className="sr-only">Features</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <li key={title} className="card p-6">
              <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-surface2 text-berryt"><Icon aria-hidden size={22} /></span>
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="mt-1 text-sm text-dim">{body}</p>
            </li>
          ))}
        </ul>
      </section>
      <footer className="border-t border-line py-8 text-sm text-faint">Skyberry · Built with Next.js and Supabase</footer>
    </div>
  );
}
