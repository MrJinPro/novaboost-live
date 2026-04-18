-- IMPORTANT:
-- This migration is intended for a clean database state.
-- If your Supabase project is already partially migrated and you get errors like
-- "type ... already exists" or missing dependent relations/functions on later migrations,
-- do NOT rerun this file manually.
-- Use supabase/recovery/20260418_backend_foundation_phase1_repair.sql first,
-- then continue with the next migrations.

-- ============= EXTRA ENUMS =============
CREATE TYPE public.streamer_verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE public.stream_session_status AS ENUM ('live', 'ended', 'failed');
CREATE TYPE public.stream_event_type AS ENUM (
  'live_started',
  'live_ended',
  'viewer_joined',
  'viewer_left',
  'like_received',
  'gift_received',
  'chat_message',
  'snapshot_updated',
  'code_word_submitted',
  'boost_started',
  'boost_expired',
  'raid_requested'
);
CREATE TYPE public.viewer_action_type AS ENUM (
  'stream_visit',
  'watch_time',
  'code_submission',
  'boost_participation',
  'like',
  'gift',
  'chat_message',
  'referral_join'
);
CREATE TYPE public.content_post_type AS ENUM ('news', 'announcement', 'video', 'update');
CREATE TYPE public.media_type AS ENUM ('image', 'video', 'tiktok_clip', 'external_link');
CREATE TYPE public.notification_channel AS ENUM ('in_app', 'telegram', 'web_push');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- ============= HELPERS =============
CREATE OR REPLACE FUNCTION public.owns_streamer(_streamer_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.streamers
    WHERE id = _streamer_id
      AND user_id = auth.uid()
  )
$$;

-- ============= PROFILE EXTENSIONS =============
ALTER TABLE public.profiles
  ADD COLUMN tiktok_username TEXT,
  ADD COLUMN telegram_username TEXT,
  ADD COLUMN telegram_user_id BIGINT,
  ADD COLUMN telegram_linked_at TIMESTAMPTZ,
  ADD COLUMN activity_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN streak_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_activity_at TIMESTAMPTZ,
  ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'ru',
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_profiles_tiktok_username
  ON public.profiles(tiktok_username)
  WHERE tiktok_username IS NOT NULL;

CREATE UNIQUE INDEX idx_profiles_telegram_user_id
  ON public.profiles(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- ============= STREAMER EXTENSIONS =============
ALTER TABLE public.streamers
  ADD COLUMN banner_url TEXT,
  ADD COLUMN logo_url TEXT,
  ADD COLUMN tagline TEXT,
  ADD COLUMN telegram_channel TEXT,
  ADD COLUMN telegram_chat_id BIGINT,
  ADD COLUMN verification_status public.streamer_verification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN verification_method TEXT,
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN tracking_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tracking_source TEXT,
  ADD COLUMN last_checked_live_at TIMESTAMPTZ,
  ADD COLUMN priority_score INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_streamers_priority_score ON public.streamers(priority_score DESC);
CREATE INDEX idx_streamers_tracking_enabled ON public.streamers(tracking_enabled);

-- ============= STREAMER SUBSCRIPTIONS =============
CREATE TABLE public.streamer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  telegram_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (streamer_id, user_id)
);
ALTER TABLE public.streamer_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streamer subscriptions"
  ON public.streamer_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Streamer owners can view subscriptions to own streamer"
  ON public.streamer_subscriptions FOR SELECT USING (public.owns_streamer(streamer_id));
CREATE POLICY "Users can create own streamer subscriptions"
  ON public.streamer_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streamer subscriptions"
  ON public.streamer_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own streamer subscriptions"
  ON public.streamer_subscriptions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_streamer_subscriptions_streamer ON public.streamer_subscriptions(streamer_id);
CREATE INDEX idx_streamer_subscriptions_user ON public.streamer_subscriptions(user_id);

CREATE TRIGGER update_streamer_subscriptions_updated_at
  BEFORE UPDATE ON public.streamer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= STREAMER VERIFICATIONS =============
CREATE TABLE public.streamer_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.streamer_verification_status NOT NULL DEFAULT 'pending',
  evidence_type TEXT,
  evidence_value TEXT,
  notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.streamer_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own verification requests"
  ON public.streamer_verifications FOR SELECT USING (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can create own verification requests"
  ON public.streamer_verifications FOR INSERT WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Admins can manage verification requests"
  ON public.streamer_verifications FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_streamer_verifications_streamer ON public.streamer_verifications(streamer_id);
CREATE INDEX idx_streamer_verifications_status ON public.streamer_verifications(status);

CREATE TRIGGER update_streamer_verifications_updated_at
  BEFORE UPDATE ON public.streamer_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= TELEGRAM LINKS =============
CREATE TABLE public.telegram_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  telegram_user_id BIGINT UNIQUE,
  telegram_username TEXT,
  telegram_chat_id BIGINT,
  bot_enabled BOOLEAN NOT NULL DEFAULT true,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram link"
  ON public.telegram_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own telegram link"
  ON public.telegram_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own telegram link"
  ON public.telegram_links FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_telegram_links_updated_at
  BEFORE UPDATE ON public.telegram_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= STREAMER PAGE SETTINGS =============
CREATE TABLE public.streamer_page_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL UNIQUE REFERENCES public.streamers(id) ON DELETE CASCADE,
  accent_color TEXT,
  banner_url TEXT,
  logo_url TEXT,
  headline TEXT,
  description TEXT,
  featured_video_url TEXT,
  layout JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.streamer_page_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer page settings are viewable by everyone"
  ON public.streamer_page_settings FOR SELECT USING (true);
CREATE POLICY "Streamer owners can create own page settings"
  ON public.streamer_page_settings FOR INSERT WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can update own page settings"
  ON public.streamer_page_settings FOR UPDATE USING (public.owns_streamer(streamer_id));

CREATE TRIGGER update_streamer_page_settings_updated_at
  BEFORE UPDATE ON public.streamer_page_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= STREAMER POSTS =============
CREATE TABLE public.streamer_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  post_type public.content_post_type NOT NULL DEFAULT 'news',
  title TEXT NOT NULL,
  body TEXT,
  cover_url TEXT,
  external_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.streamer_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published streamer posts are viewable by everyone"
  ON public.streamer_posts FOR SELECT USING (is_published = true OR public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can create own posts"
  ON public.streamer_posts FOR INSERT WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can update own posts"
  ON public.streamer_posts FOR UPDATE USING (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can delete own posts"
  ON public.streamer_posts FOR DELETE USING (public.owns_streamer(streamer_id));

CREATE INDEX idx_streamer_posts_streamer_published ON public.streamer_posts(streamer_id, is_published, published_at DESC);

CREATE TRIGGER update_streamer_posts_updated_at
  BEFORE UPDATE ON public.streamer_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= STREAMER MEDIA =============
CREATE TABLE public.streamer_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.streamer_posts(id) ON DELETE SET NULL,
  media_type public.media_type NOT NULL,
  title TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.streamer_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer media is viewable by everyone"
  ON public.streamer_media FOR SELECT USING (true);
CREATE POLICY "Streamer owners can create own media"
  ON public.streamer_media FOR INSERT WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can update own media"
  ON public.streamer_media FOR UPDATE USING (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can delete own media"
  ON public.streamer_media FOR DELETE USING (public.owns_streamer(streamer_id));

CREATE INDEX idx_streamer_media_streamer_sort ON public.streamer_media(streamer_id, sort_order, created_at DESC);

CREATE TRIGGER update_streamer_media_updated_at
  BEFORE UPDATE ON public.streamer_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= STREAM SESSIONS =============
CREATE TABLE public.stream_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'tiktok',
  external_stream_id TEXT,
  status public.stream_session_status NOT NULL DEFAULT 'live',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  peak_viewer_count INTEGER NOT NULL DEFAULT 0,
  current_viewer_count INTEGER NOT NULL DEFAULT 0,
  like_count BIGINT NOT NULL DEFAULT 0,
  gift_count BIGINT NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  raw_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stream_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stream sessions are viewable by everyone"
  ON public.stream_sessions FOR SELECT USING (true);
CREATE POLICY "Streamer owners can view own sessions"
  ON public.stream_sessions FOR SELECT USING (public.owns_streamer(streamer_id));

CREATE INDEX idx_stream_sessions_streamer_status ON public.stream_sessions(streamer_id, status, started_at DESC);
CREATE INDEX idx_stream_sessions_external_id ON public.stream_sessions(external_stream_id);

CREATE TRIGGER update_stream_sessions_updated_at
  BEFORE UPDATE ON public.stream_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= STREAM EVENTS =============
CREATE TABLE public.stream_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_session_id UUID NOT NULL REFERENCES public.stream_sessions(id) ON DELETE CASCADE,
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  event_type public.stream_event_type NOT NULL,
  source TEXT NOT NULL DEFAULT 'tiktok',
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  external_viewer_id TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stream_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own stream events"
  ON public.stream_events FOR SELECT USING (public.owns_streamer(streamer_id));
CREATE POLICY "Admins can view all stream events"
  ON public.stream_events FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_stream_events_session_time ON public.stream_events(stream_session_id, event_timestamp DESC);
CREATE INDEX idx_stream_events_streamer_time ON public.stream_events(streamer_id, event_timestamp DESC);
CREATE INDEX idx_stream_events_type ON public.stream_events(event_type);

-- ============= VIEWER STREAM ACTIONS =============
CREATE TABLE public.viewer_stream_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  stream_session_id UUID REFERENCES public.stream_sessions(id) ON DELETE SET NULL,
  action_type public.viewer_action_type NOT NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  watch_seconds INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.viewer_stream_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stream actions"
  ON public.viewer_stream_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Streamer owners can view actions on own streamer"
  ON public.viewer_stream_actions FOR SELECT USING (public.owns_streamer(streamer_id));
CREATE POLICY "Users can create own stream actions"
  ON public.viewer_stream_actions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_viewer_stream_actions_user ON public.viewer_stream_actions(user_id, occurred_at DESC);
CREATE INDEX idx_viewer_stream_actions_streamer ON public.viewer_stream_actions(streamer_id, occurred_at DESC);
CREATE INDEX idx_viewer_stream_actions_session ON public.viewer_stream_actions(stream_session_id);

-- ============= VIEWER POINTS LEDGER =============
CREATE TABLE public.viewer_points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  delta INTEGER NOT NULL,
  balance_after INTEGER,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.viewer_points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own points ledger"
  ON public.viewer_points_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all points ledger rows"
  ON public.viewer_points_ledger FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_viewer_points_ledger_user ON public.viewer_points_ledger(user_id, created_at DESC);

-- ============= NOTIFICATION DELIVERIES =============
CREATE TABLE public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.notification_channel NOT NULL,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  attempted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification deliveries"
  ON public.notification_deliveries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage notification deliveries"
  ON public.notification_deliveries FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_notification_deliveries_user ON public.notification_deliveries(user_id, created_at DESC);
CREATE INDEX idx_notification_deliveries_status ON public.notification_deliveries(status, channel);

-- ============= RAID REQUESTS =============
CREATE TABLE public.raid_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_streamer_id UUID REFERENCES public.streamers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  message TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.raid_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Raid requests are viewable by everyone"
  ON public.raid_requests FOR SELECT USING (true);
CREATE POLICY "Streamer owners can create own raid requests"
  ON public.raid_requests FOR INSERT WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can update own raid requests"
  ON public.raid_requests FOR UPDATE USING (public.owns_streamer(streamer_id));

CREATE INDEX idx_raid_requests_streamer ON public.raid_requests(streamer_id, status, starts_at DESC);

CREATE TRIGGER update_raid_requests_updated_at
  BEFORE UPDATE ON public.raid_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= UPDATED SIGNUP TRIGGER =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username TEXT;
BEGIN
  _username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, username, display_name, tiktok_username, preferred_language)
  VALUES (
    NEW.id,
    _username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', _username),
    NULLIF(NEW.raw_user_meta_data->>'tiktok_username', ''),
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'ru')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============= ENABLE REALTIME FOR NEW SURFACES =============
ALTER TABLE public.stream_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.streamer_posts REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.streamer_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;