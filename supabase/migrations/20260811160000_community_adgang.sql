-- Community-adgang: kun aktive, fuldt betalende medlemmer — fail-closed.
--
-- Community er KUN for aktive, fuldt betalende medlemmer. Udløbne medlemmer,
-- legatmodtagere og selvbetjeningsabonnenter (299 kr./md.) har IKKE adgang —
-- abonnementet dækker tal, budget, handouts og tasks/milestones, ikke
-- community. Den eksisterende is_membership_active kan ikke bruges: den
-- returnerer true for aktive abonnementer, true når contract_end_date er
-- NULL, og true for ukendte virksomheder (COALESCE fail-open). Den er bygget
-- til medlems-directory, hvor fail-open er acceptabelt. En adgangsport skal
-- fejle lukket.
-- user_company_id bruges bevidst IKKE: den har LIMIT 1 uden ORDER BY og
-- vælger vilkårligt, hvis en bruger hører til flere virksomheder. Denne
-- funktion bruger EXISTS over alle brugerens virksomheder.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT pg_get_functiondef('public.har_aktivt_medlemskab(uuid)'::regprocedure);
--   SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname = 'public' AND tablename LIKE 'community_%'
--   ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 1: har_aktivt_medlemskab — fail-closed adgangsdom
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.har_aktivt_medlemskab(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE cm.user_id = _user_id
      AND c.is_legat = false
      AND c.contract_end_date IS NOT NULL
      AND c.contract_end_date > now()
  )
$function$;

COMMENT ON FUNCTION public.har_aktivt_medlemskab(uuid) IS
  'Fail-closed adgangsdom for community: true KUN når brugeren hører til mindst én ikke-legat-virksomhed med en sat OG fremtidig contract_end_date. Abonnementsfelterne (subscription_status/subscription_current_period_end) vurderes bevidst IKKE — selvbetjeningsabonnenter har ikke community-adgang. NULL slutdato giver ikke adgang (modsat is_membership_active, som er fail-open til directory-brug), og legat-virksomheder er udelukket. EXISTS over ALLE brugerens virksomheder — user_company_id bruges bevidst ikke (LIMIT 1 uden ORDER BY vælger vilkårligt ved flere tilhørsforhold).';

-- Samme grant-hygiejne som is_membership_active (20260810150000): kun
-- authenticated må kalde; funktionen bruges i RLS-policies nedenfor.
REVOKE ALL ON FUNCTION public.har_aktivt_medlemskab(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.har_aktivt_medlemskab(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.har_aktivt_medlemskab(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 2: community-policies strammes med adgangsdommen
-- ─────────────────────────────────────────────────────────────────────────
--
-- DROP POLICY-begrundelse (jf. CLAUDE.md-kravet): CREATE POLICY har ikke
-- OR REPLACE, så hver medlems-policy droppes og genskabes med SAMME navn
-- og med public.har_aktivt_medlemskab(auth.uid()) AND'et på. De fire
-- advisor-policies røres IKKE (rådgivere ser og modererer fortsat alt via
-- has_role), og "Members can delete own reactions" samt "Members can view
-- own views" røres IKKE.

-- ── community_traade ──

DROP POLICY IF EXISTS "Members can view active threads" ON public.community_traade;
CREATE POLICY "Members can view active threads"
  ON public.community_traade FOR SELECT
  TO authenticated
  USING (status = 'aktiv' AND public.har_aktivt_medlemskab(auth.uid()));

DROP POLICY IF EXISTS "Members can create own threads" ON public.community_traade;
CREATE POLICY "Members can create own threads"
  ON public.community_traade FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = forfatter_id AND public.har_aktivt_medlemskab(auth.uid()));

DROP POLICY IF EXISTS "Members can update own threads" ON public.community_traade;
CREATE POLICY "Members can update own threads"
  ON public.community_traade FOR UPDATE
  TO authenticated
  USING (auth.uid() = forfatter_id AND status = 'aktiv' AND public.har_aktivt_medlemskab(auth.uid()))
  WITH CHECK (auth.uid() = forfatter_id);

-- ── community_svar ──

DROP POLICY IF EXISTS "Members can view active replies" ON public.community_svar;
CREATE POLICY "Members can view active replies"
  ON public.community_svar FOR SELECT
  TO authenticated
  USING (status = 'aktiv' AND public.har_aktivt_medlemskab(auth.uid()));

DROP POLICY IF EXISTS "Members can create own replies" ON public.community_svar;
CREATE POLICY "Members can create own replies"
  ON public.community_svar FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = forfatter_id AND public.har_aktivt_medlemskab(auth.uid()));

DROP POLICY IF EXISTS "Members can update own replies" ON public.community_svar;
CREATE POLICY "Members can update own replies"
  ON public.community_svar FOR UPDATE
  TO authenticated
  USING (auth.uid() = forfatter_id AND status = 'aktiv' AND public.har_aktivt_medlemskab(auth.uid()))
  WITH CHECK (auth.uid() = forfatter_id);

-- ── community_reaktioner ──

DROP POLICY IF EXISTS "Members can react themselves" ON public.community_reaktioner;
CREATE POLICY "Members can react themselves"
  ON public.community_reaktioner FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = bruger_id AND public.har_aktivt_medlemskab(auth.uid()));

-- ── community_visninger ──

DROP POLICY IF EXISTS "Members can record own views" ON public.community_visninger;
CREATE POLICY "Members can record own views"
  ON public.community_visninger FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = bruger_id AND public.har_aktivt_medlemskab(auth.uid()));
