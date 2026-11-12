"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Activity, Award, Bell, Camera, Flame, Gamepad2, Lock, MessageCircle, MessagesSquare, ShieldOff, Sparkles, Trash2, UserPlus, Users, type LucideIcon } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Submit } from "@/components/form-bits";
import { ErrorNote, OkNote } from "@/components/ui";
import { unblockUser, updateSettings } from "@/features/actions";
import type { UserSettings } from "@/lib/types";

function Row({ icon: Icon, label, hint, children }: { icon: LucideIcon; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-ice text-brandt"><Icon aria-hidden size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{label}</span>{hint && <span className="block text-[13px] text-faint">{hint}</span>}</span>
      {children}
    </div>
  );
}

function Toggle({ name, label, on }: { name: string; label: string; on: boolean }) {
  return (
    <input type="checkbox" role="switch" name={name} defaultChecked={on} aria-label={label}
      className="relative h-[28px] w-[46px] shrink-0 cursor-pointer appearance-none rounded-full bg-[#c7dbe8] transition-colors checked:bg-brand
        after:absolute after:left-[3px] after:top-[3px] after:size-[22px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(20,46,70,.25)] after:transition-transform checked:after:translate-x-[18px]" />
  );
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <div className="px-1"><h2 className="section-title">{title}</h2>{description && <p className="text-[13px] text-faint">{description}</p>}</div>
      <div className="card divide-y divide-[var(--line)] overflow-hidden !p-0">{children}</div>
    </section>
  );
}

export function SettingsForm({ s }: { s: UserSettings }) {
  const [state, action] = useActionState(updateSettings, {});
  return (
    <form action={action} className="grid gap-6">
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <OkNote>{state.message}</OkNote>}

      <Group title="Privacy" description="Control who can reach you.">
        <Row icon={Lock} label="Who can message you" hint="People outside this can't start a new chat with you">
          <label className="sr-only" htmlFor="wcm">Who can message you</label>
          <select id="wcm" name="who_can_message" defaultValue={s.who_can_message} className="field !min-h-10 !w-auto !py-1.5 text-sm">
            <option value="everyone">Everyone</option><option value="friends">Connections only</option>
          </select>
        </Row>
        <Row icon={Activity} label="Show when I'm online" hint="Connections see a green dot while you're active"><Toggle name="show_online" label="Show when I'm online" on={s.show_online ?? true} /></Row>
      </Group>

      <Group title="Notifications" description="Skyberry only notifies you about the things you choose.">
        <Row icon={MessageCircle} label="Messages" hint="One notification per conversation until you read it"><Toggle name="notify_messages" label="Messages" on={s.notify_messages} /></Row>
        <Row icon={UserPlus} label="Connection requests"><Toggle name="notify_connections" label="Connection requests" on={s.notify_connections} /></Row>
        <Row icon={Users} label="Room and group invites"><Toggle name="notify_rooms" label="Room and group invites" on={s.notify_rooms} /></Row>
        <Row icon={Camera} label="Friends' Moments"><Toggle name="notify_moments" label="Friends' Moments" on={s.notify_moments} /></Row>
        <Row icon={Gamepad2} label="Game challenges"><Toggle name="notify_games" label="Game challenges" on={s.notify_games} /></Row>
        <Row icon={Award} label="Milestones and streaks"><Toggle name="notify_milestones" label="Milestones and streaks" on={s.notify_milestones} /></Row>
      </Group>

      <Group title="Streaks & comfort">
        <Row icon={Flame} label="Track streaks" hint="Turning this off stops tracking for both people in a pair"><Toggle name="streaks_enabled" label="Track streaks" on={s.streaks_enabled} /></Row>
        <Row icon={MessagesSquare} label="Show my streaks"><Toggle name="show_streaks" label="Show my streaks" on={s.show_streaks} /></Row>
        <Row icon={Sparkles} label="Reduce motion" hint="Calms animations and pauses the 3D Universe"><Toggle name="reduce_motion" label="Reduce motion" on={s.reduce_motion} /></Row>
      </Group>

      <div className="glass sticky bottom-[calc(var(--nav-h)+18px)] z-10 flex items-center justify-between gap-3 rounded-[18px] p-2 pl-4 md:bottom-4">
        <span className="text-sm text-dim">Changes apply when you save.</span>
        <Submit className="btn btn-primary">Save settings</Submit>
      </div>
    </form>
  );
}

export function DangerZone({ blocked }: { blocked: { id: string; name: string }[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Group title="Blocked people">
        {blocked.length === 0 ? <Row icon={ShieldOff} label="No one is blocked" hint="People you block can't find or message you"><span /></Row> :
          blocked.map((b) => <Row key={b.id} icon={ShieldOff} label={b.name}><ActionButton className="btn btn-soft btn-sm" action={unblockUser.bind(null, b.id)}>Unblock</ActionButton></Row>)}
      </Group>
      <Group title="Account">
        <Row icon={Bell} label="Notifications inbox" hint="See everything Skyberry sent you"><a className="btn btn-soft btn-sm" href="/notifications">Open</a></Row>
        <div className="grid gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-danger/10 text-danger"><Trash2 aria-hidden size={18} /></span>
            <span className="text-sm text-dim"><b className="block text-[15px] text-ink">Delete account</b>Permanently removes your profile, uploaded files and Moments. Messages you sent stay in chats without your name.</span>
          </div>
          {err && <ErrorNote>{err}</ErrorNote>}
          <button className="btn btn-danger justify-self-start" onClick={async () => {
            if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
            const res = await fetch("/api/account", { method: "DELETE" });
            if (res.ok) router.replace("/"); else setErr("We couldn't delete your account. Please try again.");
          }}>Delete my account</button>
        </div>
      </Group>
    </>
  );
}
