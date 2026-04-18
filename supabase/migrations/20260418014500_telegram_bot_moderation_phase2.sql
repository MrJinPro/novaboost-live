-- ============= TELEGRAM BOT ENUMS =============
CREATE TYPE public.telegram_chat_kind AS ENUM (
  'platform_group',
  'platform_channel',
  'streamer_group',
  'streamer_channel'
);

CREATE TYPE public.telegram_route_type AS ENUM (
  'platform_chat',
  'streamer_chat',
  'subscriber_dm'
);

CREATE TYPE public.telegram_member_role AS ENUM (
  'owner',
  'admin',
  'moderator',
  'member',
  'bot'
);

CREATE TYPE public.telegram_moderation_action_type AS ENUM (
  'warn',
  'delete_message',
  'mute',
  'ban',
  'unban',
  'restrict_media',
  'restrict_links',
  'approve_join'
);

CREATE TYPE public.telegram_moderation_status AS ENUM (
  'pending',
  'applied',
  'failed',
  'reverted',
  'cancelled'
);

-- ============= TELEGRAM HELPERS =============
CREATE OR REPLACE FUNCTION public.can_receive_streamer_telegram(
  _streamer_id UUID,
  _user_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.streamer_subscriptions ss
    JOIN public.telegram_links tl
      ON tl.user_id = ss.user_id
    WHERE ss.streamer_id = _streamer_id
      AND ss.user_id = _user_id
      AND ss.notification_enabled = true
      AND ss.telegram_enabled = true
      AND tl.telegram_user_id IS NOT NULL
  )
$$;

-- ============= TELEGRAM CHATS =============
CREATE TABLE public.telegram_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL UNIQUE,
  chat_kind public.telegram_chat_kind NOT NULL,
  title TEXT,
  username TEXT,
  invite_link TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  moderation_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telegram_chats_scope_check CHECK (
    (
      chat_kind IN ('streamer_group', 'streamer_channel')
      AND streamer_id IS NOT NULL
    )
    OR
    (
      chat_kind IN ('platform_group', 'platform_channel')
      AND streamer_id IS NULL
    )
  )
);
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own telegram chats"
  ON public.telegram_chats FOR SELECT USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can create own telegram chats"
  ON public.telegram_chats FOR INSERT WITH CHECK (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can update own telegram chats"
  ON public.telegram_chats FOR UPDATE USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can delete own telegram chats"
  ON public.telegram_chats FOR DELETE USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Admins can manage telegram chats"
  ON public.telegram_chats FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX idx_telegram_chats_primary_streamer
  ON public.telegram_chats(streamer_id)
  WHERE streamer_id IS NOT NULL AND is_primary = true;
CREATE INDEX idx_telegram_chats_streamer
  ON public.telegram_chats(streamer_id, chat_kind);
CREATE INDEX idx_telegram_chats_notifications
  ON public.telegram_chats(notifications_enabled, moderation_enabled);

CREATE TRIGGER update_telegram_chats_updated_at
  BEFORE UPDATE ON public.telegram_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= TELEGRAM NOTIFICATION ROUTES =============
CREATE TABLE public.telegram_notification_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
  telegram_chat_id UUID REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  route_type public.telegram_route_type NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notify_on_live_start BOOLEAN NOT NULL DEFAULT true,
  notify_on_live_end BOOLEAN NOT NULL DEFAULT false,
  notify_on_post BOOLEAN NOT NULL DEFAULT true,
  notify_on_boost BOOLEAN NOT NULL DEFAULT true,
  notify_on_raid BOOLEAN NOT NULL DEFAULT true,
  notify_on_moderation BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telegram_notification_routes_scope_check CHECK (
    (
      route_type = 'platform_chat'
      AND streamer_id IS NULL
      AND telegram_chat_id IS NOT NULL
    )
    OR
    (
      route_type = 'streamer_chat'
      AND streamer_id IS NOT NULL
      AND telegram_chat_id IS NOT NULL
    )
    OR
    (
      route_type = 'subscriber_dm'
      AND streamer_id IS NOT NULL
      AND telegram_chat_id IS NULL
    )
  )
);
ALTER TABLE public.telegram_notification_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own telegram routes"
  ON public.telegram_notification_routes FOR SELECT USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can create own telegram routes"
  ON public.telegram_notification_routes FOR INSERT WITH CHECK (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can update own telegram routes"
  ON public.telegram_notification_routes FOR UPDATE USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can delete own telegram routes"
  ON public.telegram_notification_routes FOR DELETE USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Admins can manage telegram routes"
  ON public.telegram_notification_routes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX idx_telegram_notification_routes_chat
  ON public.telegram_notification_routes(route_type, telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
CREATE UNIQUE INDEX idx_telegram_notification_routes_dm
  ON public.telegram_notification_routes(streamer_id, route_type)
  WHERE route_type = 'subscriber_dm';
CREATE INDEX idx_telegram_notification_routes_streamer
  ON public.telegram_notification_routes(streamer_id, enabled);

CREATE TRIGGER update_telegram_notification_routes_updated_at
  BEFORE UPDATE ON public.telegram_notification_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= TELEGRAM DELIVERY TARGETS =============
CREATE TABLE public.telegram_notification_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  streamer_id UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.telegram_notification_routes(id) ON DELETE SET NULL,
  telegram_chat_id UUID REFERENCES public.telegram_chats(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_link_id UUID REFERENCES public.telegram_links(id) ON DELETE SET NULL,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  scheduled_at TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telegram_notification_targets_destination_check CHECK (
    telegram_chat_id IS NOT NULL OR telegram_link_id IS NOT NULL
  )
);
ALTER TABLE public.telegram_notification_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram notification targets"
  ON public.telegram_notification_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Streamer owners can view own telegram notification targets"
  ON public.telegram_notification_targets FOR SELECT USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Admins can manage telegram notification targets"
  ON public.telegram_notification_targets FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_telegram_notification_targets_route_status
  ON public.telegram_notification_targets(route_id, status, created_at DESC);
CREATE INDEX idx_telegram_notification_targets_user
  ON public.telegram_notification_targets(user_id, created_at DESC);
CREATE INDEX idx_telegram_notification_targets_chat
  ON public.telegram_notification_targets(telegram_chat_id, created_at DESC);

-- ============= TELEGRAM CHAT MEMBERS =============
CREATE TABLE public.telegram_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id UUID NOT NULL REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  display_name TEXT,
  member_role public.telegram_member_role NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE (telegram_chat_id, telegram_user_id)
);
ALTER TABLE public.telegram_chat_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own telegram chat members"
  ON public.telegram_chat_members FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.telegram_chats tc
      WHERE tc.id = telegram_chat_id
        AND tc.streamer_id IS NOT NULL
        AND public.owns_streamer(tc.streamer_id)
    )
  );
CREATE POLICY "Admins can manage telegram chat members"
  ON public.telegram_chat_members FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_telegram_chat_members_chat_role
  ON public.telegram_chat_members(telegram_chat_id, member_role, status);
CREATE INDEX idx_telegram_chat_members_user
  ON public.telegram_chat_members(user_id, telegram_chat_id);

-- ============= TELEGRAM MODERATION RULES =============
CREATE TABLE public.telegram_moderation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id UUID NOT NULL REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  action_type public.telegram_moderation_action_type NOT NULL,
  threshold_count INTEGER NOT NULL DEFAULT 1,
  window_seconds INTEGER,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_chat_id, rule_key)
);
ALTER TABLE public.telegram_moderation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own moderation rules"
  ON public.telegram_moderation_rules FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.telegram_chats tc
      WHERE tc.id = telegram_chat_id
        AND tc.streamer_id IS NOT NULL
        AND public.owns_streamer(tc.streamer_id)
    )
  );
CREATE POLICY "Streamer owners can manage own moderation rules"
  ON public.telegram_moderation_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.telegram_chats tc
      WHERE tc.id = telegram_chat_id
        AND tc.streamer_id IS NOT NULL
        AND public.owns_streamer(tc.streamer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.telegram_chats tc
      WHERE tc.id = telegram_chat_id
        AND tc.streamer_id IS NOT NULL
        AND public.owns_streamer(tc.streamer_id)
    )
  );
CREATE POLICY "Admins can manage moderation rules"
  ON public.telegram_moderation_rules FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_telegram_moderation_rules_chat
  ON public.telegram_moderation_rules(telegram_chat_id, is_enabled);

CREATE TRIGGER update_telegram_moderation_rules_updated_at
  BEFORE UPDATE ON public.telegram_moderation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= TELEGRAM MODERATION INCIDENTS =============
CREATE TABLE public.telegram_moderation_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id UUID NOT NULL REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  streamer_id UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.telegram_chat_members(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_user_id BIGINT NOT NULL,
  rule_id UUID REFERENCES public.telegram_moderation_rules(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_moderation_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own moderation incidents"
  ON public.telegram_moderation_incidents FOR SELECT USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can manage own moderation incidents"
  ON public.telegram_moderation_incidents FOR ALL
  USING (streamer_id IS NOT NULL AND public.owns_streamer(streamer_id))
  WITH CHECK (streamer_id IS NOT NULL AND public.owns_streamer(streamer_id));
CREATE POLICY "Admins can manage moderation incidents"
  ON public.telegram_moderation_incidents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_telegram_moderation_incidents_chat_status
  ON public.telegram_moderation_incidents(telegram_chat_id, status, occurred_at DESC);
CREATE INDEX idx_telegram_moderation_incidents_streamer
  ON public.telegram_moderation_incidents(streamer_id, occurred_at DESC);

-- ============= TELEGRAM MODERATION ACTIONS =============
CREATE TABLE public.telegram_moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id UUID NOT NULL REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  streamer_id UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
  incident_id UUID REFERENCES public.telegram_moderation_incidents(id) ON DELETE SET NULL,
  member_id UUID REFERENCES public.telegram_chat_members(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_user_id BIGINT NOT NULL,
  action_type public.telegram_moderation_action_type NOT NULL,
  status public.telegram_moderation_status NOT NULL DEFAULT 'pending',
  duration_seconds INTEGER,
  reason TEXT,
  provider_action_id TEXT,
  acted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_by_bot BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streamer owners can view own moderation actions"
  ON public.telegram_moderation_actions FOR SELECT USING (
    streamer_id IS NOT NULL AND public.owns_streamer(streamer_id)
  );
CREATE POLICY "Streamer owners can manage own moderation actions"
  ON public.telegram_moderation_actions FOR ALL
  USING (streamer_id IS NOT NULL AND public.owns_streamer(streamer_id))
  WITH CHECK (streamer_id IS NOT NULL AND public.owns_streamer(streamer_id));
CREATE POLICY "Admins can manage moderation actions"
  ON public.telegram_moderation_actions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_telegram_moderation_actions_chat_status
  ON public.telegram_moderation_actions(telegram_chat_id, status, created_at DESC);
CREATE INDEX idx_telegram_moderation_actions_streamer
  ON public.telegram_moderation_actions(streamer_id, created_at DESC);
CREATE INDEX idx_telegram_moderation_actions_incident
  ON public.telegram_moderation_actions(incident_id);

CREATE TRIGGER update_telegram_moderation_actions_updated_at
  BEFORE UPDATE ON public.telegram_moderation_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();