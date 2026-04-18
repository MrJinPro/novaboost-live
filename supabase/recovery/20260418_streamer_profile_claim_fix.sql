-- Run this file manually in Supabase SQL Editor when a streamer account exists,
-- but the public streamer row was created earlier without user_id and the studio
-- does not persist banner/logo/telegram/public page settings.

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'streamers' AND policyname = 'Streamer can claim unowned streamer profile'
  ) THEN
    CREATE POLICY "Streamer can claim unowned streamer profile"
      ON public.streamers
      FOR UPDATE
      USING (public.can_claim_streamer(id))
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;