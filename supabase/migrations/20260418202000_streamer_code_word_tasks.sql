-- Let streamers manage their own tasks, including code-word tasks used before or during live streams.

CREATE POLICY "Streamer owners can create own tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (
    streamer_id IS NOT NULL
    AND public.owns_streamer(streamer_id)
  );

CREATE POLICY "Streamer owners can update own tasks"
  ON public.tasks FOR UPDATE
  USING (
    streamer_id IS NOT NULL
    AND public.owns_streamer(streamer_id)
  )
  WITH CHECK (
    streamer_id IS NOT NULL
    AND public.owns_streamer(streamer_id)
  );

CREATE POLICY "Streamer owners can delete own tasks"
  ON public.tasks FOR DELETE
  USING (
    streamer_id IS NOT NULL
    AND public.owns_streamer(streamer_id)
  );

CREATE INDEX IF NOT EXISTS idx_tasks_streamer_active_type
  ON public.tasks(streamer_id, active, type, created_at DESC);