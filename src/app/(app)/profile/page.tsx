import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { AvatarUpload } from "@/components/avatar-upload";
import { PageHeader } from "@/components/ui";
import { logout } from "@/features/auth-actions";
import { requireUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/format";
import { friendsOf } from "@/lib/queries";
import { MILESTONES } from "@/lib/universe";
import { ProfileForm } from "./form";

export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const { supabase, user, profile } = await requireUser();
  const [friends, { data: ms }] = await Promise.all([friendsOf(supabase, user.id), supabase.from("milestones").select("key, achieved_at")]);
  const banner = avatarUrl(profile.banner_path);
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="Your profile" actions={<Link href={`/u/${profile.username}`} className="btn btn-soft btn-sm">View public page</Link>} />
      <section className="card overflow-hidden">
        <div className="h-32 bg-gradient-to-br from-berry/60 via-violet/40 to-sky/40 bg-cover bg-center md:h-44" style={banner ? { backgroundImage: `url(${banner})` } : undefined} />
        <div className="-mt-10 flex flex-wrap items-end gap-4 px-5 pb-5">
          <Avatar name={profile.display_name} path={profile.avatar_path} accent={profile.accent} size={88} className="ring-4 ring-surface" />
          <div className="min-w-0 flex-1 pt-10"><h2 className="text-2xl font-extrabold">{profile.display_name}</h2><p className="text-dim">@{profile.username}{profile.status_text && ` · ${profile.status_text}`}</p></div>
          <div className="flex gap-2"><AvatarUpload label="Photo" /><AvatarUpload slot="banner" label="Banner" /></div>
        </div>
      </section>
      <ProfileForm profile={profile} />
      <section className="card p-5" aria-labelledby="fr">
        <h2 id="fr" className="mb-3 text-lg font-bold">Connections ({friends.length})</h2>
        {friends.length === 0 ? <p className="text-sm text-dim">No connections yet. <Link href="/search" className="font-bold text-berryt">Find people</Link>.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">{friends.map((f) => (
            <li key={f.id}><Link href={`/u/${f.username}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface2"><Avatar name={f.display_name} path={f.avatar_path} accent={f.accent} size={40} /><span className="font-bold">{f.display_name}</span></Link></li>
          ))}</ul>
        )}
      </section>
      <section className="card p-5" aria-labelledby="ms">
        <h2 id="ms" className="mb-3 text-lg font-bold">Milestones</h2>
        <ul className="grid gap-2 sm:grid-cols-2">{Object.entries(MILESTONES).map(([k, v]) => {
          const got = ms?.some((m) => m.key === k);
          return <li key={k} className={`rounded-2xl border border-line p-3 ${got ? "bg-surface2" : "opacity-60"}`}><b>{v.label}</b><p className="text-sm text-dim">{got ? "Earned" : v.hint}</p></li>;
        })}</ul>
      </section>
      <form action={logout}><button className="btn btn-danger">Log out</button></form>
    </div>
  );
}
