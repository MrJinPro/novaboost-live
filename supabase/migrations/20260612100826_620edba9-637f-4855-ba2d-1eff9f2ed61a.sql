CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'paypal',
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  scenario text NOT NULL CHECK (scenario IN ('donation','promotion','membership','other')),
  scenario_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_order_id text,
  provider_capture_id text,
  amount_value numeric(12,2) NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD',
  payer_email text,
  payer_name text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','approved','captured','failed','refunded','voided')),
  raw_create jsonb,
  raw_capture jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_order_unique
  ON public.payment_orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON public.payment_orders(user_id);
CREATE INDEX IF NOT EXISTS payment_orders_scenario_idx ON public.payment_orders(scenario);

CREATE TRIGGER payment_orders_updated_at
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own orders" ON public.payment_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.payment_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streamer_id uuid REFERENCES public.streamers(id) ON DELETE SET NULL,
  plan_key text NOT NULL,
  paypal_plan_id text NOT NULL,
  provider text NOT NULL DEFAULT 'paypal',
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  provider_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approval_pending','active','suspended','cancelled','expired','failed')),
  current_period_end timestamptz,
  last_payment_amount numeric(12,2),
  last_payment_currency text,
  payer_email text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_subscriptions_user_idx ON public.payment_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS payment_subscriptions_streamer_idx ON public.payment_subscriptions(streamer_id);

CREATE TRIGGER payment_subscriptions_updated_at
  BEFORE UPDATE ON public.payment_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.payment_subscriptions TO authenticated;
GRANT ALL ON public.payment_subscriptions TO service_role;

ALTER TABLE public.payment_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own subscriptions" ON public.payment_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paypal',
  environment text NOT NULL,
  event_id text UNIQUE,
  event_type text NOT NULL,
  resource_id text,
  payload jsonb NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  process_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_type_idx ON public.payment_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS payment_webhook_events_resource_idx ON public.payment_webhook_events(resource_id);

GRANT ALL ON public.payment_webhook_events TO service_role;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;