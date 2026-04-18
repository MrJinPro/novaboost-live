-- Run this file manually in Supabase SQL Editor only if
-- 20260418143000_live_engagement_progression_phase3.sql was applied partially.

CREATE TABLE IF NOT EXISTS public.streamer_team_memberships (
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'streamer_team_memberships' AND policyname = 'Users can view own team memberships'
  ) THEN
    CREATE POLICY "Users can view own team memberships"
      ON public.streamer_team_memberships FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'streamer_team_memberships' AND policyname = 'Streamer owners can view memberships for own streamer'
  ) THEN
    CREATE POLICY "Streamer owners can view memberships for own streamer"
      ON public.streamer_team_memberships FOR SELECT USING (public.owns_streamer(streamer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'streamer_team_memberships' AND policyname = 'Admins can view all team memberships'
  ) THEN
    CREATE POLICY "Admins can view all team memberships"
      ON public.streamer_team_memberships FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_streamer_team_memberships_streamer
  ON public.streamer_team_memberships(streamer_id, team_points DESC);
CREATE INDEX IF NOT EXISTS idx_streamer_team_memberships_user
  ON public.streamer_team_memberships(user_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_streamer_team_memberships_updated_at'
      AND tgrelid = 'public.streamer_team_memberships'::regclass
  ) THEN
    CREATE TRIGGER update_streamer_team_memberships_updated_at
      BEFORE UPDATE ON public.streamer_team_memberships
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.viewer_achievement_unlocks (
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'viewer_achievement_unlocks' AND policyname = 'Users can view own achievement unlocks'
  ) THEN
    CREATE POLICY "Users can view own achievement unlocks"
      ON public.viewer_achievement_unlocks FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'viewer_achievement_unlocks' AND policyname = 'Streamer owners can view unlocks for own streamer'
  ) THEN
    CREATE POLICY "Streamer owners can view unlocks for own streamer"
      ON public.viewer_achievement_unlocks FOR SELECT USING (public.owns_streamer(streamer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'viewer_achievement_unlocks' AND policyname = 'Admins can view all achievement unlocks'
  ) THEN
    CREATE POLICY "Admins can view all achievement unlocks"
      ON public.viewer_achievement_unlocks FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_viewer_achievement_unlocks_user
  ON public.viewer_achievement_unlocks(user_id, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_viewer_achievement_unlocks_streamer
  ON public.viewer_achievement_unlocks(streamer_id, unlocked_at DESC);