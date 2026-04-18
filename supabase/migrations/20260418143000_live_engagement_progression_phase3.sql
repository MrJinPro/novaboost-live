-- IMPORTANT:
-- This migration is intended for a clean post-phase2 state.
-- If you get errors like "relation ... already exists", the database is partially migrated.
-- In that case, do NOT rerun this file manually.
-- Use supabase/recovery/20260418_live_engagement_phase3_repair.sql instead.

CREATE TABLE public.streamer_team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_points INTEGER NOT NULL DEFAULT 0,
  team_level INTEGER NOT NULL DEFAULT 1,
  available_features JSONB NOT NULL DEFAULT '[]'::JSONB,
  comment_count INTEGER NOT NULL DEFAULT 0,
  like_count BIGINT NOT NULL DEFAULT 0,
  gift_count INTEGER NOT NULL DEFAULT 0,
  total_gift_diamonds BIGINT NOT NULL DEFAULT 0,
  watch_seconds INTEGER NOT NULL DEFAULT 0,
  achievement_count INTEGER NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (streamer_id, user_id)
);
ALTER TABLE public.streamer_team_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own team memberships"
  ON public.streamer_team_memberships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Streamer owners can view memberships for own streamer"
  ON public.streamer_team_memberships FOR SELECT USING (public.owns_streamer(streamer_id));
CREATE POLICY "Admins can view all team memberships"
  ON public.streamer_team_memberships FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_streamer_team_memberships_streamer ON public.streamer_team_memberships(streamer_id, team_points DESC);
CREATE INDEX idx_streamer_team_memberships_user ON public.streamer_team_memberships(user_id, updated_at DESC);

CREATE TRIGGER update_streamer_team_memberships_updated_at
  BEFORE UPDATE ON public.streamer_team_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.viewer_achievement_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  stream_session_id UUID REFERENCES public.stream_sessions(id) ON DELETE SET NULL,
  achievement_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reward_points INTEGER NOT NULL DEFAULT 0,
  reward_team_points INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, streamer_id, achievement_key)
);
ALTER TABLE public.viewer_achievement_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own achievement unlocks"
  ON public.viewer_achievement_unlocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Streamer owners can view unlocks for own streamer"
  ON public.viewer_achievement_unlocks FOR SELECT USING (public.owns_streamer(streamer_id));
CREATE POLICY "Admins can view all achievement unlocks"
  ON public.viewer_achievement_unlocks FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_viewer_achievement_unlocks_user ON public.viewer_achievement_unlocks(user_id, unlocked_at DESC);
CREATE INDEX idx_viewer_achievement_unlocks_streamer ON public.viewer_achievement_unlocks(streamer_id, unlocked_at DESC);
