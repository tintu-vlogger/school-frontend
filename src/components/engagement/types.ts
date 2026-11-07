/*
 * Shapes returned by the engagement API (/api/v1/engagement/...). Kept in one place so
 * the Buzz, Kudos, Announcements, Surveys and Kiosk pages agree.
 */
export type Person = {
  uuid: string | null; id: number | null; name: string; title: string | null; department: string | null;
  image: string | null; system?: boolean;
};
export type Reaction = { emoji: string; count: number };
export type FileCard = {
  uuid: string; kind: "image" | "file"; name: string; mime: string; size: number;
  width?: number | null; height?: number | null; url: string; thumb_url: string;
};
export type LinkPreview = { url: string; title: string | null; description: string | null; site: string | null; image: FileCard | null };
export type Audience = { all?: boolean; match?: "any" | "all"; rules?: Record<string, string[]> };

export type Comment = {
  uuid: string; body: string; created_at: string; edited: boolean; author: Person | null;
  reactions: Reaction[]; my_reaction: string | null; can_edit: boolean; can_delete: boolean; replies: Comment[];
};
export type PollOption = { uuid: string; label: string; votes: number; mine: boolean };
export type Poll = {
  multiple: boolean; closes_at: string | null; closed: boolean; show_voters: boolean; voters: number;
  options: PollOption[]; voted: boolean;
};
export type KudosValue = {
  uuid: string; name: string; description: string | null; emoji: string; color: string; accent: string; soft: string;
  points: number; active: boolean; position: number; uses?: number; count?: number;
};
export type KudosCard = {
  uuid: string; message: string; points: number; created_at: string; value: KudosValue | null; giver: Person | null; recipients: Person[];
};
export type Cover = { preset?: string; file?: string; url?: string; thumb_url?: string } | null;
export type AnnouncementCard = {
  uuid: string; kind: string; kind_label: string; title: string; summary: string; cover: Cover; requires_ack: boolean;
  ack_due_on: string | null; published_at: string | null; expires_at: string | null; status: string; author_name: string | null;
  read: boolean; acknowledged: boolean; acknowledged_at: string | null;
};
export type SurveyFeedCard = {
  uuid: string; title: string; kind: string; identity: string; description: string | null; questions: number; mandatory: boolean;
  closes_at: string | null; open: boolean; invited: boolean; answered: boolean;
};

export type Post = {
  uuid: string; kind: string; status: string; author: Person; body: string | null; hashtags: string[];
  attachments: FileCard[]; link_preview: LinkPreview | null; audience: Audience; audience_label: string | null;
  subject: Person | null; celebration_date: string | null; years: number | null; theme: string | null;
  kudos: KudosCard | null; announcement: AnnouncementCard | null; survey: SurveyFeedCard | null;
  allow_comments: boolean; pinned: boolean; pinned_by: string | null; hidden_reason: string | null;
  created_at: string; edited: boolean; comments: Comment[]; comment_count: number;
  reactions: Reaction[]; reaction_total: number; my_reaction: string | null; recent_reactors: Person[];
  poll: Poll | null; can_edit: boolean; can_delete: boolean; can_pin: boolean; can_moderate: boolean; is_mine: boolean;
  reports?: { uuid: string; reason: string; note: string | null; at: string; by: string; on_comment: boolean }[];
};
export type PostStats = Pick<Post, "uuid" | "reactions" | "reaction_total" | "my_reaction" | "comment_count" | "poll" | "recent_reactors">;

export type FeedPage = { pinned: Post[]; items: Post[]; next: string | null; latest: string | null };

export type Meta = {
  me: { name: string; employee_uuid: string | null; is_owner: boolean; image: string | null };
  reactions: string[]; all_reactions: string[]; can_post: boolean; allow_polls: boolean; allow_attachments: boolean;
  allow_audience: boolean; allow_comments: boolean; kudos_enabled: boolean; show_leaderboard: boolean; is_moderator: boolean;
  can_manage_announcements: boolean; can_manage_surveys: boolean; can_manage_settings: boolean;
  report_reasons: Record<string, string>;
};

export type CelebrationItem = {
  kind: "birthday" | "work_anniversary" | "wedding_anniversary" | "welcome"; label: string; date: string; years: number | null;
  person: Person; is_me: boolean; post_uuid: string | null; wished: boolean; days_away: number;
};
export type Celebrations = { today: CelebrationItem[]; this_week: CelebrationItem[]; upcoming: CelebrationItem[]; new_joiners: Person[]; date: string };

export type Leaderboard = {
  period: string; label: string; start: string; end: string; total_kudos: number;
  leaders: { rank: number; person: Person; kudos: number; points: number }[];
  top_givers: { person: Person; given: number }[]; top_values: KudosValue[];
};

export type AudienceGroup = {
  key: string; label: string; available: boolean; hint: string | null; searchable: boolean; options: { value: string; label: string }[];
};

export type Paged<T> = { items: T[]; total: number; page: number; size: number };
