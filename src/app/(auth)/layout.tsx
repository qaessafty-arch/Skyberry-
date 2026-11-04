import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <SetupNeeded />;
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-4 py-10">
      <Link href="/" aria-label="Skyberry home"><Wordmark /></Link>
      <div className="card rise p-6 sm:p-8">{children}</div>
    </main>
  );
}
