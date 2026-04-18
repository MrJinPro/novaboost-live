-- Allow a streamer to claim an existing unowned streamers row that matches
-- their TikTok username from the authenticated profile. This fixes cases where
-- a public streamer row existed before the streamer signed in to the dashboard.

CREATE OR REPLACE FUNCTION public.can_claim_streamer(_streamer_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.streamers s
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE s.id = _streamer_id
      AND s.user_id IS NULL
      AND p.tiktok_username IS NOT NULL
      AND lower(s.tiktok_username) = lower(p.tiktok_username)
  )
$$;

CREATE POLICY "Streamer can claim unowned streamer profile"
  ON public.streamers
  FOR UPDATE
  USING (public.can_claim_streamer(id))
  WITH CHECK (auth.uid() = user_id);