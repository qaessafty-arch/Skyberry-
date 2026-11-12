import { WifiOff } from "lucide-react";
import { Wordmark } from "@/components/logo";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center justify-items-center gap-4 px-6 text-center">
      <Wordmark />
      <span className="grid size-14 place-items-center rounded-2xl bg-ice text-brandt"><WifiOff aria-hidden size={26} /></span>
      <h1 className="text-[24px] font-extrabold">You&apos;re offline</h1>
      <p className="text-dim">Skyberry needs a connection to load your chats and friends. It will pick up where you left off as soon as you&apos;re back online.</p>
      <a href="/home" className="btn btn-primary">Try again</a>
    </main>
  );
}
