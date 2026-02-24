
-- =============================================
-- FASE 1: Opret companies + company_members
-- =============================================

-- 1. Opret companies tabel
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  cvr_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Opret company_members tabel
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function: hent brugerens company_id
CREATE OR REPLACE FUNCTION public.user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_members
  WHERE user_id = _user_id LIMIT 1
$$;

-- =============================================
-- RLS for companies
-- =============================================
CREATE POLICY "Members can view own company"
  ON public.companies FOR SELECT
  USING (id = public.user_company_id(auth.uid()));

CREATE POLICY "Advisors can view all companies"
  ON public.companies FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Members can update own company"
  ON public.companies FOR UPDATE
  USING (id = public.user_company_id(auth.uid()));

CREATE POLICY "Advisors can update all companies"
  ON public.companies FOR UPDATE
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "System can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (true);

-- =============================================
-- RLS for company_members
-- =============================================
CREATE POLICY "Members can view own company members"
  ON public.company_members FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Advisors can view all company members"
  ON public.company_members FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "System can insert company members"
  ON public.company_members FOR INSERT
  WITH CHECK (true);

-- =============================================
-- FASE 2: Migrer eksisterende data
-- =============================================

-- For hver profil: opret en virksomhed og en company_member
DO $$
DECLARE
  r RECORD;
  new_company_id uuid;
BEGIN
  FOR r IN SELECT user_id, full_name, company_name FROM public.profiles LOOP
    INSERT INTO public.companies (name)
    VALUES (COALESCE(NULLIF(r.company_name, ''), r.full_name || 's virksomhed'))
    RETURNING id INTO new_company_id;

    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (new_company_id, r.user_id, 'owner');
  END LOOP;
END $$;

-- =============================================
-- FASE 3: Tilfoej company_id til alle data-tabeller
-- =============================================

ALTER TABLE public.financial_reports ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.budget_targets ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.milestones ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.handouts ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.kpi_targets ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.kpi_benchmarks ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.conversations ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- =============================================
-- FASE 4: Populer company_id fra eksisterende user_id
-- =============================================

UPDATE public.financial_reports fr
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = fr.user_id;

UPDATE public.budget_targets bt
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = bt.user_id;

UPDATE public.milestones m
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = m.user_id;

UPDATE public.handouts h
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = h.user_id;

UPDATE public.kpi_targets kt
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = kt.user_id;

UPDATE public.kpi_benchmarks kb
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = kb.user_id;

UPDATE public.conversations c
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = c.member_id;

-- =============================================
-- FASE 5: Opdater RLS policies til company_id
-- =============================================

-- financial_reports: Tilfoej company-baserede policies
CREATE POLICY "Company members can view company reports"
  ON public.financial_reports FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can insert company reports"
  ON public.financial_reports FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can update company reports"
  ON public.financial_reports FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can delete company reports"
  ON public.financial_reports FOR DELETE
  USING (company_id = public.user_company_id(auth.uid()));

-- budget_targets: company-baserede policies
CREATE POLICY "Company members can view company budgets"
  ON public.budget_targets FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can insert company budgets"
  ON public.budget_targets FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can update company budgets"
  ON public.budget_targets FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can delete company budgets"
  ON public.budget_targets FOR DELETE
  USING (company_id = public.user_company_id(auth.uid()));

-- milestones: company-baserede policies
CREATE POLICY "Company members can view company milestones"
  ON public.milestones FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can insert company milestones"
  ON public.milestones FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can update company milestones"
  ON public.milestones FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can delete company milestones"
  ON public.milestones FOR DELETE
  USING (company_id = public.user_company_id(auth.uid()));

-- handouts: company-baserede policies
CREATE POLICY "Company members can view company handouts"
  ON public.handouts FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can insert company handouts"
  ON public.handouts FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can update company handouts"
  ON public.handouts FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can delete company handouts"
  ON public.handouts FOR DELETE
  USING (company_id = public.user_company_id(auth.uid()));

-- kpi_targets: company-baserede policies
CREATE POLICY "Company members can view company kpi targets"
  ON public.kpi_targets FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can insert company kpi targets"
  ON public.kpi_targets FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can update company kpi targets"
  ON public.kpi_targets FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can delete company kpi targets"
  ON public.kpi_targets FOR DELETE
  USING (company_id = public.user_company_id(auth.uid()));

-- kpi_benchmarks: company-baserede policies
CREATE POLICY "Company members can view company benchmarks"
  ON public.kpi_benchmarks FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can insert company benchmarks"
  ON public.kpi_benchmarks FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can update company benchmarks"
  ON public.kpi_benchmarks FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can delete company benchmarks"
  ON public.kpi_benchmarks FOR DELETE
  USING (company_id = public.user_company_id(auth.uid()));

-- conversations: company-baserede policies
CREATE POLICY "Company members can view company conversations"
  ON public.conversations FOR SELECT
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can create company conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Company members can update company conversations"
  ON public.conversations FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));

-- =============================================
-- FASE 6: Opdater handle_new_user trigger
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
BEGIN
  -- Opret profil
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Opret virksomhed
  INSERT INTO public.companies (name)
  VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), COALESCE(NEW.raw_user_meta_data->>'full_name', '') || 's virksomhed'))
  RETURNING id INTO new_company_id;

  -- Tilknyt bruger til virksomhed
  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (new_company_id, NEW.id, 'owner');

  -- Opret conversation for virksomheden
  INSERT INTO public.conversations (member_id, company_id)
  VALUES (NEW.id, new_company_id);

  RETURN NEW;
END;
$$;
