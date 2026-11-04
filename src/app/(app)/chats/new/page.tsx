import { requireUser } from "@/lib/auth";
import { friendsOf } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { NewChatForms } from "./forms";

export const metadata = { title: "New chat" };

export default async function NewChatPage() {
  const { supabase, user } = await requireUser();
  const friends = await friendsOf(supabase, user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New conversation" subtitle="Chat with a friend or start a group." />
      <NewChatForms friends={friends.map((f) => ({ id: f.id, name: f.display_name, username: f.username, avatar: f.avatar_path, accent: f.accent }))} />
    </div>
  );
}
