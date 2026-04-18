ALTER TABLE public.promotion_orders
  ADD COLUMN requester_role public.app_role NOT NULL DEFAULT 'viewer',
  ADD COLUMN supplier_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN customer_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE public.promotion_orders
SET
  supplier_amount = quoted_amount,
  customer_amount = quoted_amount,
  requester_role = 'viewer'
WHERE supplier_amount = 0 AND customer_amount = 0;

CREATE INDEX idx_promotion_orders_requester_role_created
  ON public.promotion_orders(requester_role, created_at DESC);