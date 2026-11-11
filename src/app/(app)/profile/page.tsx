import Link from "next/link";
import { Award, ChevronRight, LogOut, Orbit, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { AvatarUpload } from "@/components/avatar-upload";
import { Section } from "@/components/ui";
import { logout } from "@/features/auth-actions";
import { requireUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/format";
import { friendsOf } from "@/lib/queries";
import { levelProgress, MILESTONES } from "@/lib/universe";
import { ProfileForm } from "./form";
import { SKY_BANNER } from "@/lib/design";

export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const { supabase, user, profile } = await requireUser();
  await supabase.rpc("ensure_universe");
  const [friends, { data: ms }, { data: pet }] = await Promise.all([
    friendsOf(supabase, user.id), supabase.from("milestones").select("key, achieved_at"),
    supabase.from("pets").select("name, xp").eq("owner_id", user.id).single(),
  ]);
  const banner = avatarUrl(profile.banner_path);
  const lp = levelProgress(pet?.xp ?? 0);
  const earned = new Set((ms ?? []).map((m) => m.key as string));

  return (
    <div className="mx-auto grid max-w-3xl gap-5 rise">
      <section className="card overflow-hidden !p-0">
        <div className={`relative h-28 bg-cover bg-center md:h-40 ${banner ? "" : SKY_BANNER}`} style={banner ? { backgroundImage: `url(${banner})` } : undefined}>
          <div className="absolute right-3 top-3 flex gap-2"><AvatarUpload slot="banner" label="Banner" /></div>
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-11 flex flex-wrap items-end justify-between gap-3">
            <Avatar name={profile.display_name} path={profile.avatar_path} accent={profile.accent} size={92} className="ring-4 ring-white" />
            <div className="flex gap-2"><AvatarUpload label="Photo" /><Link href={`/u/${profile.username}`} className="btn btn-soft btn-sm">Public view</Link></div>
          </div>
          <h1 className="mt-3 text-[24px] font-extrabold leading-tight">{profile.display_name}</h1>
          <p className="text-[15px] text-faint">@{profile.username}</p>
          {profile.status_text && <p className="mt-2 font-semibold">{profile.status_text}</p>}
          {profile.bio && <p className="mt-1 whitespace-pre-wrap text-dim">{profile.bio}</p>}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[["Connections", friends.length], ["Milestones", earned.size], ["Pet level", lp.level]].map(([k, v]) => (
              <div key={k} className="panel py-2.5"><dt className="text-xs font-semibold text-faint">{k}</dt><dd className="text-lg font-extrabold">{v}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <Link href="/universe" className="card group flex items-center gap-4 p-4 transition-colors hover:border-sky">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#bfeaff,#48b9f2_55%,#123b5a)] text-white"><Orbit aria-hidden size={22} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">{pet?.name ?? "Pip"} · level {lp.level}</span>
          <span className="mt-1.5 block h-1.5 max-w-[240px] overflow-hidden rounded-full bg-ice"><span className="block h-full rounded-full bg-sky" style={{ width: `${lp.pct}%` }} /></span>
        </span>
        <ChevronRight aria-hidden className="text-faint transition-transform group-hover:translate-x-0.5" />
      </Link>

      <ProfileForm profile={profile} />

      <Section title={`Connections (${friends.length})`} icon={Users} id="fr">
        {friends.length === 0 ? <p className="text-sm text-dim">No connections yet. <Link href="/search" className="font-bold text-brandt">Find people</Link>.</p> : (
          <ul className="grid gap-1 sm:grid-cols-2">{friends.map((f) => (
            <li key={f.id}><Link href={`/u/${f.username}`} className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface2"><Avatar name={f.display_name} path={f.avatar_path} accent={f.accent} size={40} />
              <span className="min-w-0"><b className="block truncate">{f.display_name}</b><span className="text-sm text-faint">@{f.username}</span></span></Link></li>
          ))}</ul>
        )}
      </Section>

      <Section title="Milestones" icon={Award} id="ms">
        <ul className="grid gap-2 sm:grid-cols-2">{Object.entries(MILESTONES).map(([k, v]) => {
          const got = earned.has(k);
          return (
            <li key={k} className={`flex items-center gap-3 rounded-2xl border p-3 ${got ? "border-sky/40 bg-[#f2faff]" : "border-line"}`}>
              <span className={`grid size-9 place-items-center rounded-full ${got ? "bg-sky text-white" : "bg-surface2 text-faint"}`}><Award aria-hidden size={17} /></span>
              <span><b className={got ? "" : "text-dim"}>{v.label}</b><span className="block text-[13px] text-faint">{got ? "Earned" : v.hint}</span></span>
            </li>
          );
        })}</ul>
      </Section>

      <form action={logout}><button className="btn btn-danger"><LogOut aria-hidden size={16} />Log out</button></form>
    </div>
  );
}
