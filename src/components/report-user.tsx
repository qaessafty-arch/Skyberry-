"use client";
import { Flag, X } from "lucide-react";
import { useState, useTransition } from "react";
import { reportUser } from "@/features/actions";

const REASONS = [["spam", "Spam"], ["harassment", "Harassment or bullying"], ["inappropriate", "Inappropriate content"], ["impersonation", "Pretending to be someone else"], ["other", "Something else"]] as const;

export function ReportUser({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (note) return <p role="status" className="text-sm text-success">{note}</p>;
  return open ? (
    <div className="glass w-full rounded-[18px] p-3" role="dialog" aria-label={`Report ${name}`}>
      <div className="mb-2 flex items-center justify-between"><b>Report {name}</b><button className="icon-btn !size-8" aria-label="Cancel" onClick={() => setOpen(false)}><X aria-hidden size={16} /></button></div>
      <div className="grid gap-1.5">{REASONS.map(([k, l]) => (
        <button key={k} disabled={pending} className="btn btn-soft btn-sm justify-start" onClick={() => start(async () => { const r = await reportUser(userId, k); setNote(r.ok ? "Thanks. The report was sent to the Skyberry team." : r.error ?? "Couldn't send the report."); })}>{l}</button>
      ))}</div>
    </div>
  ) : <button className="btn btn-ghost" onClick={() => setOpen(true)}><Flag aria-hidden size={16} />Report</button>;
}
