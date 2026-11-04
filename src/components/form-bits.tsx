"use client";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui";

export function Submit({ children, className = "btn btn-primary w-full" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? <Spinner label="Working" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, name, error, hint, ...rest }: {
  label: string; name: string; error?: string; hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={name} className="field" aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...rest} />
      {error ? <p id={`${id}-e`} className="error-text mt-1">{error}</p> : hint ? <p id={`${id}-h`} className="hint mt-1">{hint}</p> : null}
    </div>
  );
}
