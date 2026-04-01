
-- 1. Add is_demo column
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
UPDATE public.companies SET is_demo = true WHERE id = 'a0de0000-0000-4000-8000-000000000001';

-- 2. Hide demo company from non-members
DO $$ BEGIN
  CREATE POLICY "Hide demo company from non-members"
    ON public.companies
    FOR SELECT
    TO authenticated
    USING (
      is_demo = false
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = companies.id
        AND cm.user_id = auth.uid()
      )
      OR has_role(auth.uid(), 'admin'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Hide demo facts from non-members
DO $$ BEGIN
  CREATE POLICY "Hide demo facts from non-members"
    ON public.financial_report_facts
    FOR SELECT
    TO authenticated
    USING (
      company_id != 'a0de0000-0000-4000-8000-000000000001'::uuid
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = financial_report_facts.company_id
        AND cm.user_id = auth.uid()
      )
      OR has_role(auth.uid(), 'admin'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Hide demo milestones from non-members
DO $$ BEGIN
  CREATE POLICY "Hide demo milestones from non-members"
    ON public.milestones
    FOR SELECT
    TO authenticated
    USING (
      company_id != 'a0de0000-0000-4000-8000-000000000001'::uuid
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = milestones.company_id
        AND cm.user_id = auth.uid()
      )
      OR has_role(auth.uid(), 'admin'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Hide demo conversations from non-members
DO $$ BEGIN
  CREATE POLICY "Hide demo conversations from non-members"
    ON public.conversations
    FOR SELECT
    TO authenticated
    USING (
      company_id != 'a0de0000-0000-4000-8000-000000000001'::uuid
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = conversations.company_id
        AND cm.user_id = auth.uid()
      )
      OR has_role(auth.uid(), 'admin'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
