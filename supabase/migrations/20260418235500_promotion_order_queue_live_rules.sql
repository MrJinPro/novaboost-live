ALTER TYPE public.promotion_order_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.promotion_order_status ADD VALUE IF NOT EXISTS 'completed';

ALTER TABLE public.promotion_orders
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS queue_reason TEXT,
  ADD COLUMN IF NOT EXISTS submitted_stream_session_id UUID REFERENCES public.stream_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_promotion_orders_streamer_status_created
  ON public.promotion_orders(streamer_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_promotion_orders_status_submitted_at
  ON public.promotion_orders(status, submitted_at DESC NULLS LAST, created_at DESC);
