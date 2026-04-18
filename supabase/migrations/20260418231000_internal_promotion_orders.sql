CREATE TYPE public.promotion_order_status AS ENUM ('pending', 'submitted', 'failed', 'cancelled');

CREATE TABLE public.promotion_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  streamer_id UUID REFERENCES public.streamers(id) ON DELETE SET NULL,
  target_link TEXT NOT NULL,
  service_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  service_category TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  quoted_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  external_order_id BIGINT,
  external_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.promotion_order_status NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.promotion_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own promotion orders"
  ON public.promotion_orders FOR SELECT
  USING (auth.uid() = requester_user_id);

CREATE POLICY "Streamer owners can view own promotion orders"
  ON public.promotion_orders FOR SELECT
  USING (streamer_id IS NOT NULL AND public.owns_streamer(streamer_id));

CREATE INDEX idx_promotion_orders_requester_created
  ON public.promotion_orders(requester_user_id, created_at DESC);

CREATE INDEX idx_promotion_orders_streamer_created
  ON public.promotion_orders(streamer_id, created_at DESC);

CREATE INDEX idx_promotion_orders_status_created
  ON public.promotion_orders(status, created_at DESC);

CREATE TRIGGER update_promotion_orders_updated_at
  BEFORE UPDATE ON public.promotion_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();