import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  // Without configuration there is no backend: pages render the setup screen instead.
  if (!isSupabaseConfigured) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|ico)$).*)"],
};
