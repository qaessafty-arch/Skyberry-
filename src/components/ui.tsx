import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, children, action }: {
  icon: LucideIcon; title: string; children?: React.ReactNode; action?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-2xl bg-ice text-brandt"><Icon aria-hidden size={22} strokeWidth={2} /></span>
      <h2 className="text-[17px] font-extrabold">{title}</h2>
      {children && <p className="text-sm text-dim">{children}</p>}
      {action && <Link href={action.href} className="btn btn-primary btn-sm mt-2">{action.label}</Link>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[26px] font-extrabold leading-tight md:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled group of content inside a card. */
export function Section({ title, icon: Icon, action, children, className = "", id }: {
  title: string; icon?: LucideIcon; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <section aria-labelledby={id} className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="section-title flex items-center gap-2">
          {Icon && <Icon aria-hidden size={18} className="text-brandt" />}{title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{children}</p>;
}
export function OkNote({ children }: { children: React.ReactNode }) {
  return <p role="status" className="rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">{children}</p>;
}
export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span role="status" aria-label={label} className="inline-block size-[18px] animate-spin rounded-full border-2 border-current/25 border-t-current" />;
}
