-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('admin', 'streamer', 'viewer');
CREATE TYPE public.boost_status AS ENUM ('active', 'expired', 'cancelled');
CREATE TYPE public.task_type AS ENUM ('visit', 'code', 'boost', 'referral');

-- ============= UTILITIES =============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  referred_streamer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============= STREAMERS =============
CREATE TABLE public.streamers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  is_live BOOLEAN NOT NULL DEFAULT false,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  total_traffic_sent INTEGER NOT NULL DEFAULT 0,
  total_boost_amount INTEGER NOT NULL DEFAULT 0,
  followers_count INTEGER NOT NULL DEFAULT 0,
  needs_boost BOOLEAN NOT NULL DEFAULT false,
  last_live_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.streamers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamers are viewable by everyone"
  ON public.streamers FOR SELECT USING (true);
CREATE POLICY "Streamer can update own stream"
  ON public.streamers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can create streamer profile"
  ON public.streamers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_streamers_is_live ON public.streamers(is_live);
CREATE INDEX idx_streamers_needs_boost ON public.streamers(needs_boost);

CREATE TRIGGER update_streamers_updated_at
  BEFORE UPDATE ON public.streamers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= BOOSTS =============
CREATE TABLE public.boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  priority_score INTEGER NOT NULL DEFAULT 0,
  status boost_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Boosts are viewable by everyone"
  ON public.boosts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create boosts"
  ON public.boosts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_boosts_streamer ON public.boosts(streamer_id);
CREATE INDEX idx_boosts_status_expires ON public.boosts(status, expires_at);

-- ============= TASKS =============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reward_points INTEGER NOT NULL DEFAULT 10,
  type task_type NOT NULL DEFAULT 'visit',
  code TEXT,
  streamer_id UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active tasks are viewable by everyone"
  ON public.tasks FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage tasks"
  ON public.tasks FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============= TASK COMPLETIONS =============
CREATE TABLE public.task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id)
);
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completions"
  ON public.task_completions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own completions"
  ON public.task_completions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============= REFERRALS =============
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrals are viewable by everyone"
  ON public.referrals FOR SELECT USING (true);
CREATE POLICY "Users can create own referral"
  ON public.referrals FOR INSERT WITH CHECK (auth.uid() = viewer_id);

CREATE INDEX idx_referrals_streamer ON public.referrals(streamer_id);

-- ============= NOTIFICATIONS =============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============= AUTO-CREATE PROFILE ON SIGNUP =============
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

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    _username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', _username)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= ENABLE REALTIME =============
ALTER TABLE public.streamers REPLICA IDENTITY FULL;
ALTER TABLE public.boosts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.streamers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.boosts;