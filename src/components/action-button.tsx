"use client";
import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui";

type R = { ok: boolean; error?: string } | void;

/** Runs a (bound) server action with pending + error feedback. */
export function ActionButton({ action, children, className = "btn btn-soft btn-sm", confirm: confirmText, onDone }: {
  action: () => Promise<R>; children: React.ReactNode; className?: string; confirm?: string; onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} disabled={pending} aria-busy={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(null);
          start(async () => {
            const r = await action();
            if (r && !r.ok) setError(r.error ?? "Something went wrong");
            else onDone?.();
          });
        }}>
        {pending && <Spinner label="Working" />}{children}
      </button>
      {error && <span role="alert" className="error-text">{error}</span>}
    </span>
  );
}
