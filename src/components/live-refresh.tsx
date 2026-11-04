"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/** Re-fetches the server component tree when rows change. Realtime respects RLS: only visible rows notify. */
export function LiveRefresh({ tables, filter }: { tables: string[]; filter?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); };
    let channel = supabase.channel(`live:${tables.join(",")}:${filter ?? "all"}`);
    for (const table of tables) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, bump);
    }
    channel.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [router, tables, filter]);
  return null;
}
