export type NovaBoostEventType =
  | "streamer.live_started"
  | "streamer.live_ended"
  | "stream.snapshot_updated"
  | "viewer.task_completed"
  | "boost.started"
  | "boost.expired"
  | "streamer.post_published"
  | "telegram.moderation_requested";

export type NovaBoostEvent<TPayload = Record<string, unknown>> = {
  id: string;
  type: NovaBoostEventType;
  streamerId?: string;
  streamSessionId?: string;
  viewerId?: string;
  createdAt: string;
  payload: TPayload;
};

export type StreamRoutingIntent = {
  streamerId: string;
  liveTitle?: string;
  trigger: "live_started" | "boost_needed" | "post_published";
};

export type ModerationIntent = {
  streamerId: string;
  chatId: string;
  telegramUserId: string;
  reason: string;
  action: "warn" | "mute" | "ban";
};