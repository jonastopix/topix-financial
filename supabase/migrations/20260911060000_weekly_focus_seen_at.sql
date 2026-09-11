-- KØRT i prod — målt 11/9 kl. 09:20 (fire policies på weekly_focus, heraf UPDATE «Members set seen_at on own weekly focus» for authenticated; trigger protect_weekly_focus_seen_only; rækker / med seen_at: 171 / 2).
-- Migration: weekly_focus.seen_at får en skrivevej — medlemmet må stemple
-- SIN EGEN virksomheds række, og KUN den kolonne. Rettet 11/9 2026
-- (recon-ugefokus-vaerdien.md §4, det andet vindue).
--
-- FEJLEN: weekly_focus har tre policies (20260329190316:121-132) — SELECT
-- medlem, SELECT rådgiver, ALL service role — og INGEN UPDATE for nogen
-- bruger. Forsidens markSeen (BoardroomView) UPDATE'r seen_at når punktet
-- «Ugens fokus er klar» vises; under RLS bliver det til «0 rows» uden fejl,
-- og koden læste ikke svaret. Målt: 0 af 133 rækker over seks uger. Samme
-- klasse som `const { data }` i rolletjekket (#797): en fejl der sluges.
--
-- TO LAG, husets mønster:
--   1. POLICY: UPDATE for authenticated på egen virksomheds række — samme
--      USING som SELECT-policyen (company_id = user_company_id(auth.uid())),
--      og WITH CHECK det samme, så rækken ikke kan flyttes til en anden
--      virksomhed. Ingen advisor-policy: rådgiveren stempler ikke på
--      medlemmets vegne.
--   2. TRIGGER: BEFORE UPDATE, som protect_message_immutable_fields
--      (20260310193358): alle andre kolonner er låst for alle andre end
--      service role. RLS kan ikke låse kolonner; det kan en trigger.
--      generate-weekly-focus skriver hele rækken med service role (upsert →
--      BEFORE UPDATE fyrer) og skal derfor forbi — auth.role() =
--      'service_role' returnerer NEW uændret.
--
-- Så: medlemmet kan sætte seen_at på egen række; en anden virksomheds
-- medlem rammer 0 rækker (RLS); et forsøg på at ændre headline/summary/
-- status fra klienten fejler højt (trigger). Motoren læser seen_at som
-- før (nextStep.ts slot (d)) — nu rykker et set punkt bagerst i stedet for
-- at stå forrest hele ugen.
--
-- Låst af src/lib/__tests__/ugefokusSeen.guard.test.ts, som læser DENNE
-- fil. Kræver prod efter kørsel:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'weekly_focus';
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.weekly_focus'::regclass;
-- og efter næste forsidebesøg:
--   SELECT week_key, count(*), count(seen_at) FROM public.weekly_focus GROUP BY 1 ORDER BY 1 DESC LIMIT 3;
-- Revert: DROP POLICY "Members set seen_at on own weekly focus" ON public.weekly_focus;
--         DROP TRIGGER protect_weekly_focus_seen_only ON public.weekly_focus;
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable -> SQL editor efter merge.

-- ── 1. Policyen ──
DROP POLICY IF EXISTS "Members set seen_at on own weekly focus" ON public.weekly_focus;
CREATE POLICY "Members set seen_at on own weekly focus"
  ON public.weekly_focus FOR UPDATE TO authenticated
  USING (company_id = public.user_company_id(auth.uid()))
  WITH CHECK (company_id = public.user_company_id(auth.uid()));

-- ── 2. Kolonnelåsen ──
CREATE OR REPLACE FUNCTION public.protect_weekly_focus_seen_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Service role (generate-weekly-focus, agentens godkendelse) skriver hele rækken.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Alle andre må KUN røre seen_at.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.week_key IS DISTINCT FROM OLD.week_key
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.triggers_fired IS DISTINCT FROM OLD.triggers_fired
     OR NEW.trigger_data IS DISTINCT FROM OLD.trigger_data
     OR NEW.headline IS DISTINCT FROM OLD.headline
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.actions_generated IS DISTINCT FROM OLD.actions_generated
     OR NEW.data_freshness_days IS DISTINCT FROM OLD.data_freshness_days
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'weekly_focus: only seen_at may be changed by members';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_weekly_focus_seen_only ON public.weekly_focus;
CREATE TRIGGER protect_weekly_focus_seen_only
BEFORE UPDATE ON public.weekly_focus
FOR EACH ROW
EXECUTE FUNCTION public.protect_weekly_focus_seen_only();

-- ── 3. Efter-verifikation ──
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_focus' ORDER BY policyname;
