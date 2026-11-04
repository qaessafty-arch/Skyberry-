import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Rooms" };

type Room = { id: string; title: string; description: string; avatar_path: string | null; member_count: number; is_member: boolean };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("search_rooms", { p_query: q.slice(0, 60) });
  const rooms = (data ?? []) as Room[];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Rooms" subtitle="Public spaces anyone can join." actions={<Link href="/rooms/new" className="btn btn-primary btn-sm"><Plus aria-hidden size={16} />Create room</Link>} />
      <form role="search" className="relative mb-5">
        <label htmlFor="q" className="sr-only">Search rooms</label>
        <Search aria-hidden size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input id="q" name="q" defaultValue={q} placeholder="Search rooms" maxLength={60} className="field !pl-11" />
      </form>
      {error ? <p role="alert" className="card-flat p-4 text-danger">Rooms couldn&apos;t load. Try again.</p> : rooms.length === 0 ? (
        <EmptyState icon={Users} title={q ? "No rooms match" : "No public rooms yet"} action={{ href: "/rooms/new", label: "Create the first room" }}>
          {q ? "Try another search or create it yourself." : "Be the first to open one."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rooms.map((r) => (
            <li key={r.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3"><Avatar name={r.title} path={r.avatar_path} size={48} />
                <div className="min-w-0"><h2 className="truncate text-lg font-bold">{r.title}</h2><p className="text-sm text-dim">{r.member_count} member{r.member_count === 1 ? "" : "s"}</p></div></div>
              <p className="line-clamp-2 flex-1 text-sm text-dim">{r.description || "No description yet."}</p>
              <Link href={`/chats/${r.id}`} className={`btn btn-sm ${r.is_member ? "btn-soft" : "btn-primary"}`}>{r.is_member ? "Open" : "View & join"}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
