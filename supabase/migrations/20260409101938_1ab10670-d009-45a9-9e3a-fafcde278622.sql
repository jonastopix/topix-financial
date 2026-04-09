-- ============================================================
-- LEGAT SYSTEM — DATABASE FUNDAMENT
-- ============================================================

-- 1. Tilføj is_legat flag på companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_legat BOOLEAN NOT NULL DEFAULT false;

-- 2. Opret legat_enrollments tabel
CREATE TABLE public.legat_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'upgraded', 'cancelled')),
  momentumkald_booked BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  upgraded_at TIMESTAMPTZ
);

ALTER TABLE public.legat_enrollments ENABLE ROW LEVEL SECURITY;

-- Legatmodtager kan se sin egen enrollment
CREATE POLICY "Legat users can view own enrollment"
  ON public.legat_enrollments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Advisors og admins kan se og redigere alle enrollments
CREATE POLICY "Advisors can manage all enrollments"
  ON public.legat_enrollments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'advisor') OR public.has_role(auth.uid(), 'admin'));

-- 3. Helper funktion: er den aktuelle bruger en aktiv legatmodtager?
CREATE OR REPLACE FUNCTION public.is_legat_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.legat_enrollments
    WHERE user_id = _user_id AND status = 'active'
  );
$$;

-- 4. Helper funktion: hvilken dag er legatmodtager på (1-10)?
CREATE OR REPLACE FUNCTION public.legat_day(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LEAST(
    GREATEST(
      EXTRACT(DAY FROM (now() - (
        SELECT start_date::timestamptz FROM public.legat_enrollments
        WHERE user_id = _user_id AND status = 'active'
      )))::integer + 1,
      1
    ),
    10
  );
$$;

-- 5. Helper funktion: hvilke handout-moduler er låst op for legatmodtager?
CREATE OR REPLACE FUNCTION public.legat_unlocked_modules(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT unnest(modules)
    FROM (
      SELECT CASE
        WHEN public.legat_day(_user_id) >= 9 THEN ARRAY['overordnet','bogholderi','administration','salg','marketing']
        WHEN public.legat_day(_user_id) >= 7 THEN ARRAY['overordnet','bogholderi','administration','salg']
        WHEN public.legat_day(_user_id) >= 5 THEN ARRAY['overordnet','bogholderi','administration']
        WHEN public.legat_day(_user_id) >= 3 THEN ARRAY['overordnet','bogholderi']
        ELSE ARRAY['overordnet']
      END AS modules
    ) t
  );
$$;