-- ================================================================
-- Telegram Extended: connect tokens, channel posts, dedup
-- Depends on: phase1 (telegram_links), phase2 (telegram_chats, telegram_notification_routes)
-- ================================================================

-- ============= CONNECT TOKENS =============
-- Streamers generate these in Studio to link their Telegram channel to NovaBoost
CREATE TABLE public.telegram_bot_connect_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID        NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  chat_kind   public.telegram_chat_kind NOT NULL DEFAULT 'streamer_channel',
  used_at     TIMESTAMPTZ,
  used_chat_id BIGINT,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_bot_connect_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own connect tokens"
  ON public.telegram_bot_connect_tokens FOR SELECT
  USING (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can create own connect tokens"
  ON public.telegram_bot_connect_tokens FOR INSERT
  WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can delete own connect tokens"
  ON public.telegram_bot_connect_tokens FOR DELETE
  USING (public.owns_streamer(streamer_id));
CREATE POLICY "Service role can manage all connect tokens"
  ON public.telegram_bot_connect_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_telegram_connect_tokens_streamer ON public.telegram_bot_connect_tokens(streamer_id);
CREATE INDEX idx_telegram_connect_tokens_expires ON public.telegram_bot_connect_tokens(expires_at) WHERE used_at IS NULL;

-- ============= CHANNEL POSTS =============
-- Content synced from streamer's Telegram channel
CREATE TABLE public.telegram_channel_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id     UUID        NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  telegram_chat_id UUID       NOT NULL REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  message_id      BIGINT      NOT NULL,
  message_type    TEXT        NOT NULL DEFAULT 'text',
  text            TEXT,
  caption         TEXT,
  telegram_link   TEXT,       -- e.g. https://t.me/channelusername/123
  is_visible      BOOLEAN     NOT NULL DEFAULT true,
  raw_payload     JSONB       NOT NULL DEFAULT '{}'::JSONB,
  posted_at       TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_chat_id, message_id)
);
ALTER TABLE public.telegram_channel_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visible channel posts"
  ON public.telegram_channel_posts FOR SELECT
  USING (is_visible = true);
CREATE POLICY "Streamer owners can manage own channel posts"
  ON public.telegram_channel_posts FOR ALL
  USING (public.owns_streamer(streamer_id))
  WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Service role can manage all channel posts"
  ON public.telegram_channel_posts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_telegram_channel_posts_streamer ON public.telegram_channel_posts(streamer_id, posted_at DESC);
CREATE INDEX idx_telegram_channel_posts_chat ON public.telegram_channel_posts(telegram_chat_id, posted_at DESC);

-- ============= LIVE NOTIFICATION DEDUP =============
-- Prevents sending duplicate live-start notifications per session
CREATE TABLE public.telegram_live_notification_dedup (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id     UUID        NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  live_session_id UUID,
  notification_type TEXT      NOT NULL DEFAULT 'live_start',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (streamer_id, live_session_id, notification_type)
);
ALTER TABLE public.telegram_live_notification_dedup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages dedup"
  ON public.telegram_live_notification_dedup FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_tg_live_dedup_streamer ON public.telegram_live_notification_dedup(streamer_id, sent_at DESC);

-- ============= NOTIFICATION SETTINGS per STREAMER =============
-- Notification template and feature flags per streamer
CREATE TABLE public.telegram_notification_settings (
  streamer_id               UUID    PRIMARY KEY REFERENCES public.streamers(id) ON DELETE CASCADE,
  live_notification_enabled BOOLEAN NOT NULL DEFAULT true,
  boost_notification_enabled BOOLEAN NOT NULL DEFAULT false,
  post_sync_enabled         BOOLEAN NOT NULL DEFAULT false,
  live_message_template     TEXT,
  boost_message_template    TEXT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can manage own notification settings"
  ON public.telegram_notification_settings FOR ALL
  USING (public.owns_streamer(streamer_id))
  WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Service role can manage all notification settings"
  ON public.telegram_notification_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);
