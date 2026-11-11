import { Wordmark } from "@/components/logo";

/** Shown when Supabase env vars are missing: we never fake a backend. */
export function SetupNeeded() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-4 px-6 py-16">
      <Wordmark />
      <h1 className="text-[26px] font-extrabold leading-tight">Connect a Supabase project to begin</h1>
      <p className="text-dim">
        Skyberry stores accounts, chats and media in Supabase. No project is configured for this environment yet.
      </p>
      <ol className="card-flat list-decimal space-y-2 p-5 pl-9 text-sm text-dim">
        <li>Create a Supabase project named <b className="text-ink">skyberry</b>.</li>
        <li>Apply the SQL files in <code>supabase/migrations</code> (see <code>docs/SUPABASE_SETUP.md</code>).</li>
        <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in the project URL and anon key.</li>
        <li>Restart the dev server.</li>
      </ol>
    </main>
  );
}
