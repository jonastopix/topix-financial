-- Security Patch 7: Tighten handout ownership RLS

-- 1) Drop 4 broad company-scoped member policies
DROP POLICY IF EXISTS "Company members can view company handouts" ON public.handouts;
DROP POLICY IF EXISTS "Company members can insert company handouts" ON public.handouts;
DROP POLICY IF EXISTS "Company members can update company handouts" ON public.handouts;
DROP POLICY IF EXISTS "Company members can delete company handouts" ON public.handouts;

-- 2) Tighten user-scoped INSERT with company integrity
DROP POLICY IF EXISTS "Users can insert own handouts" ON public.handouts;
CREATE POLICY "Users can insert own handouts"
ON public.handouts FOR INSERT TO public
WITH CHECK (
  user_id = auth.uid()
  AND company_id = user_company_id(auth.uid())
);

-- 3) Tighten user-scoped UPDATE with company integrity
DROP POLICY IF EXISTS "Users can update own handouts" ON public.handouts;
CREATE POLICY "Users can update own handouts"
ON public.handouts FOR UPDATE TO public
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND company_id = user_company_id(auth.uid())
);

-- 4) Tighten user-scoped DELETE with company integrity
DROP POLICY IF EXISTS "Users can delete own handouts" ON public.handouts;
CREATE POLICY "Users can delete own handouts"
ON public.handouts FOR DELETE TO public
USING (
  user_id = auth.uid()
  AND company_id = user_company_id(auth.uid())
);

-- 5) Add advisor DELETE for admin cleanup flows
CREATE POLICY "Advisors can delete handouts"
ON public.handouts FOR DELETE TO public
USING (has_role(auth.uid(), 'advisor'::app_role));

-- 6) UNIQUE constraint on (user_id, module)
ALTER TABLE public.handouts
ADD CONSTRAINT handouts_user_module_unique UNIQUE (user_id, module);

-- 7) Protect immutable ownership fields via trigger
CREATE OR REPLACE FUNCTION public.protect_handout_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id cannot be changed';
  END IF;
  IF NEW.module IS DISTINCT FROM OLD.module THEN
    RAISE EXCEPTION 'module cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_handout_immutable_fields
BEFORE UPDATE ON public.handouts
FOR EACH ROW
EXECUTE FUNCTION public.protect_handout_immutable_fields();