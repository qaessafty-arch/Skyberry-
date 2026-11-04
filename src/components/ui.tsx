import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, children, action }: {
  icon: LucideIcon; title: string; children?: React.ReactNode; action?: { href: string; label: string };
}) {
  return (
    <div className="card-flat mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-surface2 text-berryt"><Icon aria-hidden size={26} /></span>
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <p className="text-sm text-dim">{children}</p>}
      {action && <Link href={action.href} className="btn btn-primary btn-sm mt-1">{action.label}</Link>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{children}</p>;
}
export function OkNote({ children }: { children: React.ReactNode }) {
  return <p role="status" className="rounded-xl border border-mint/40 bg-mint/10 px-3 py-2 text-sm text-mint">{children}</p>;
}
export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span role="status" aria-label={label} className="inline-block size-5 animate-spin rounded-full border-2 border-line border-t-berryt" />;
}
