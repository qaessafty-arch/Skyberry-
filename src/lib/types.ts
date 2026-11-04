/** Hand-written row types matching supabase/migrations. Regenerate with `supabase gen types` once a project exists. */
export type Accent = "berry" | "sky" | "mint" | "sun" | "violet";
export type Profile = {
  id: string; username: string; display_name: string; bio: string; status_text: string;
  avatar_path: string | null; banner_path: string | null; accent: Accent;
  visibility: "public" | "friends" | "private"; created_at: string;
};
export type UserSettings = {
  who_can_message: "everyone" | "friends"; notify_messages: boolean; notify_connections: boolean; notify_rooms: boolean;
  notify_games: boolean; notify_moments: boolean; notify_milestones: boolean; streaks_enabled: boolean;
  show_streaks: boolean; reduce_motion: boolean;
};
export type ConversationRow = {
  id: string; kind: "direct" | "group" | "room"; title: string | null; avatar_path: string | null; visibility: string;
  member_count: number; last_message_at: string; last_preview: string | null; last_sender_id: string | null;
  unread_count: number; muted: boolean; my_role: string; other_user_id: string | null; other_username: string | null;
  other_display_name: string | null; other_avatar_path: string | null;
};
export type Message = {
  id: string; conversation_id: string; sender_id: string | null; kind: "text" | "image" | "video" | "system";
  body: string | null; media_id: string | null; reply_to: string | null; created_at: string; edited_at: string | null; deleted_at: string | null;
};
export type Role = "owner" | "admin" | "moderator" | "member";
export type NotificationRow = {
  id: string; kind: string; actor_id: string | null; entity_id: string | null; link: string | null; body: string | null;
  created_at: string; read_at: string | null;
};
export type Streak = {
  partner_id: string; username: string; display_name: string; avatar_path: string | null;
  effective_count: number; longest_count: number; status: "complete" | "at_risk" | "broken";
  me_done_today: boolean; partner_done_today: boolean;
};
export type Pet = { id: string; owner_id: string; name: string; species: "berry-fox" | "cloud-whale" | "star-moth"; xp: number; last_cared_at: string | null };
export type GameSession = {
  id: string; kind: "tictactoe"; status: "waiting" | "active" | "finished" | "cancelled"; created_by: string;
  state: { board: string[]; marks: Record<string, "X" | "O"> }; turn_user: string | null; winner_id: string | null;
  result: "win" | "draw" | "forfeit" | null; version: number; updated_at: string;
};
