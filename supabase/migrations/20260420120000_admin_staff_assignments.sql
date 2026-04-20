CREATE TABLE public.admin_staff_assignments (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('support', 'moderator', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own admin staff assignment"
  ON public.admin_staff_assignments FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all admin staff assignments"
  ON public.admin_staff_assignments FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage admin staff assignments"
  ON public.admin_staff_assignments FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_admin_staff_assignments_access_level
  ON public.admin_staff_assignments(access_level, is_active);

CREATE TRIGGER update_admin_staff_assignments_updated_at
  BEFORE UPDATE ON public.admin_staff_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();