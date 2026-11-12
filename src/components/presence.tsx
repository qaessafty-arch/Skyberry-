"use client";
import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/** Marks the signed-in user as active while the app is visible (every 45 s; server throttles writes). */
export function Heartbeat() {
  useEffect(() => {
    const supabase = getBrowserClient();
    const beat = () => { if (document.visibilityState === "visible") void supabase.rpc("heartbeat"); };
    beat();
    const t = setInterval(beat, 45_000);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, []);
  return null;
}
