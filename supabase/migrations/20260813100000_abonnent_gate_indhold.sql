-- Abonnent-gate paa indholdslaget: hvidliste pr. area — fail-closed.
--
-- Maalt i produktion 13-08-2026: medlems-policyerne var alene
-- (status = 'published'). Enhver authenticated bruger kunne laese hele
-- kataloget, uanset medlemskab.
-- Produktbeslutning: en abonnent (exit-produktet) beholder Dine tal og
-- Podcast & Talks og mister alt andet. Indholdet skal vaere USYNLIGT.
-- Hvidliste, ikke sortliste: alt er lukket for abonnenten undtagen
-- area = 'talks'. Nye areas er dermed automatisk skjult, indtil nogen
-- bevidst aabner dem. Samme fail-closed-polaritet som Community.
-- area-vaerdier i prod 13-08-2026: academy 27, classroom 47, evergreen 4,
-- push 2, start_her 3, ugens_video 1. talks har 0 raekker; hvidlisten
-- giver derfor adgang til ingenting i dag, hvilket er tilsigtet.
-- Podcast-halvdelen rammes ikke: den kommer fra et eksternt RSS-feed via
-- podcast-rss-proxyen og roerer aldrig content_items.
-- tier_visibility bruges bevidst IKKE: kolonnen er doed (ingen query,
-- ingen komponent, ingen admin-flade; alle 84 raekker paa default 'all').
-- Graensen gaar ved area, som er den graense produktet faktisk har.
-- Raadgivere rammes ikke: de har egne policies
-- ("Advisors can view all content items" m.fl.) og Postgres OR'er policies.
-- Medlemskoden filtrerer aldrig paa area i databasen (ét ufiltreret fetch,
-- opdeling klient-side, delt cache mellem forsiden og Akademiet), saa
-- gaten slaar igennem begge flader uden frontend-aendringer.
--
-- Deploy: koeres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter koersel med:
--   SELECT pg_get_functiondef('public.har_aktivt_abonnement(uuid)'::regprocedure);
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN
--     ('content_items', 'content_collections', 'content_item_attachments')
--   ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 1: har_aktivt_abonnement — fail-closed dom for exit-abonnementet
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.har_aktivt_abonnement(_user_id uuid)
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
      AND c.subscription_status = 'active'
      AND c.subscription_current_period_end IS NOT NULL
      AND c.subscription_current_period_end > now()
  )
$function$;

COMMENT ON FUNCTION public.har_aktivt_abonnement(uuid) IS
  'Fail-closed dom for exit-abonnementet: true KUN naar brugeren hoerer til mindst een ikke-legat-virksomhed med subscription_status = active OG en fremtidig subscription_current_period_end. Vurderer bevidst IKKE contract_end_date. Modstykket til har_aktivt_medlemskab, som vurderer datoen og bevidst IKKE abonnementsfelterne. De to svarer paa HVER SIT spoergsmaal og maa aldrig slaas sammen: datoen afgoer fuldt medlemskab, abonnementet afgoer exit-adgang. En abonnent har netop en UDLOEBET contract_end_date.';

-- Samme grant-hygiejne som har_aktivt_medlemskab (20260811160000): kun
-- authenticated maa kalde; funktionen bruges i RLS-policies nedenfor.
REVOKE ALL ON FUNCTION public.har_aktivt_abonnement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.har_aktivt_abonnement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.har_aktivt_abonnement(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- DEL 2: medlems-policies genskabes med hvidliste-gaten
-- ─────────────────────────────────────────────────────────────────────────
--
-- DROP POLICY-begrundelse (jf. CLAUDE.md-kravet): CREATE POLICY har ikke
-- OR REPLACE, saa hver medlems-policy droppes og genskabes med NOEJAGTIG
-- samme navn og med medlemskabs-/hvidliste-dommen AND'et paa.
-- Advisor-policies ("Advisors can view all content items" m.fl.) og
-- service-role-policies roeres IKKE — Postgres OR'er policies, saa
-- raadgiverne kommer fortsat ind ad deres egen doer.

DROP POLICY "Members can view published content items" ON public.content_items;
CREATE POLICY "Members can view published content items"
  ON public.content_items FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND (
      public.har_aktivt_medlemskab(auth.uid())
      OR (public.har_aktivt_abonnement(auth.uid()) AND area = 'talks')
    )
  );

DROP POLICY "Members can view published collections" ON public.content_collections;
CREATE POLICY "Members can view published collections"
  ON public.content_collections FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND (
      public.har_aktivt_medlemskab(auth.uid())
      OR (public.har_aktivt_abonnement(auth.uid()) AND area = 'talks')
    )
  );

DROP POLICY "Members can view attachments of published items" ON public.content_item_attachments;
CREATE POLICY "Members can view attachments of published items"
  ON public.content_item_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_items i
      WHERE i.id = content_item_attachments.item_id
        AND i.status = 'published'
        AND (
          public.har_aktivt_medlemskab(auth.uid())
          OR (public.har_aktivt_abonnement(auth.uid()) AND i.area = 'talks')
        )
    )
  );
