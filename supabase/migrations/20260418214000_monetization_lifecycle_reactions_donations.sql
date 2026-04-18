CREATE TYPE public.subscription_plan_key AS ENUM ('free', 'supporter', 'superfan', 'legend');
CREATE TYPE public.post_reaction_type AS ENUM ('nova', 'flare', 'pulse', 'crown');
CREATE TYPE public.donation_status AS ENUM ('pending', 'succeeded', 'failed');

ALTER TABLE public.streamer_subscriptions
  ADD COLUMN plan_key public.subscription_plan_key NOT NULL DEFAULT 'free',
  ADD COLUMN paid_until TIMESTAMPTZ,
  ADD COLUMN total_paid_amount INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.streamer_posts
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN required_plan public.subscription_plan_key NOT NULL DEFAULT 'free',
  ADD COLUMN blur_preview BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN stream_session_id UUID REFERENCES public.stream_sessions(id) ON DELETE SET NULL,
  ADD COLUMN auto_disable_on_live_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_stream_session_active
  ON public.tasks(stream_session_id, active, auto_disable_on_live_end);

CREATE INDEX IF NOT EXISTS idx_streamer_posts_active_window
  ON public.streamer_posts(streamer_id, is_published, expires_at, published_at DESC);

CREATE TABLE public.streamer_post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.streamer_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type public.post_reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, reaction_type)
);
ALTER TABLE public.streamer_post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer post reactions are viewable by everyone"
  ON public.streamer_post_reactions FOR SELECT USING (true);
CREATE POLICY "Users can create own streamer post reactions"
  ON public.streamer_post_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own streamer post reactions"
  ON public.streamer_post_reactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_streamer_post_reactions_post
  ON public.streamer_post_reactions(post_id, reaction_type, created_at DESC);
CREATE INDEX idx_streamer_post_reactions_user
  ON public.streamer_post_reactions(user_id, created_at DESC);

CREATE TABLE public.streamer_donation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL UNIQUE REFERENCES public.streamers(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  minimum_amount INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.streamer_donation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active donation links are viewable by everyone"
  ON public.streamer_donation_links FOR SELECT USING (is_active = true OR public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can create own donation links"
  ON public.streamer_donation_links FOR INSERT WITH CHECK (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can update own donation links"
  ON public.streamer_donation_links FOR UPDATE USING (public.owns_streamer(streamer_id));
CREATE POLICY "Streamer owners can delete own donation links"
  ON public.streamer_donation_links FOR DELETE USING (public.owns_streamer(streamer_id));

CREATE TRIGGER update_streamer_donation_links_updated_at
  BEFORE UPDATE ON public.streamer_donation_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.donation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  donation_link_id UUID REFERENCES public.streamer_donation_links(id) ON DELETE SET NULL,
  donor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  donor_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'novaboost-live-link',
  status public.donation_status NOT NULL DEFAULT 'succeeded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.donation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Succeeded donation events are viewable by everyone"
  ON public.donation_events FOR SELECT USING (status = 'succeeded');
CREATE POLICY "Users can view own donation events"
  ON public.donation_events FOR SELECT USING (auth.uid() = donor_user_id);
CREATE POLICY "Streamer owners can view own donation events"
  ON public.donation_events FOR SELECT USING (public.owns_streamer(streamer_id));
CREATE POLICY "Users can create own donation events"
  ON public.donation_events FOR INSERT WITH CHECK (auth.uid() = donor_user_id AND status = 'succeeded');

CREATE INDEX idx_donation_events_streamer_time
  ON public.donation_events(streamer_id, created_at DESC);
CREATE INDEX idx_donation_events_donor
  ON public.donation_events(donor_user_id, created_at DESC);