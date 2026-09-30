-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- MAANED_FOERSTE_GODKENDELSE — hukommelsen om, hvornår en måned FØRSTE gang
-- blev godkendt (Boardroom Score / tal-streak, docs/boardroom-score.md §1 og §4;
-- det tekniske råds fund 1, 30/9-2026).
--
-- PROBLEMET: streaken dømmer på FØRSTE godkendelse, og den eneste kilde var
-- financial_report_facts.created_at. Men «Erstat gammel data»
-- (ReportReviewDialog.handleReplace) soft-sletter den gamle rapport, triggeren
-- cleanup_facts_on_report_delete (20260326142338) SLETTER facts-rækken, og
-- commit_report_facts INDSÆTTER en ny med created_at = now(). Permanent sletning
-- (RapporteringView, klient-DELETE på facts) det samme. En rettet gammel måned
-- blev dermed «for sen», og streaken straffede en rettelse.
--
-- LØSNINGEN, KUN TILFØJENDE: en måned, der én gang er talt rettidig, forbliver
-- rettidig. Én række pr. (company_id, period_key) med tidspunktet for første
-- måling, skrevet af en trigger på financial_report_facts, når en række bliver
-- 'measured' (INSERT, eller UPDATE der skifter data_basis til measured — så en
-- række født som estimat og senere målt får MÅLINGENS tid, ikke estimatets;
-- det lukker også den «kendte unøjagtighed» i docs/boardroom-score.md §1).
-- ON CONFLICT DO NOTHING: den første står. Ingen DELETE-trigger: hukommelsen
-- overlever facts-rækkens død. Ingen klient-skrivning (ingen INSERT/UPDATE/
-- DELETE-policy); UPDATE afvises for alle roller af protect-triggeren.
--
-- HVORFOR IKKE «tidligste rapport, også soft-slettede»: financial_reports har
-- ingen period_key-kolonne (nøglen udledes i commit_report_facts af
-- manual_report_period_key eller parse_dk_report_period_key(report_period)),
-- og permanent sletning fjerner rapportrækken — kilden dør sammen med
-- facts-rækken. Om medlemmets SELECT-policy dækker soft-slettede rækker er
-- desuden IKKE målt i prod (papirkurven læses kun som rådgiver). Hukommelsen er
-- den kilde, der overlever begge veje.
--
-- INGEN eksisterende SECURITY DEFINER-funktion røres (commit_report_facts,
-- cleanup_facts_on_report_delete er urørte). Trigger-funktionen er NY og
-- SECURITY DEFINER med search_path = public, af samme grund som
-- cleanup_facts_on_report_delete: skriverne af facts er SECURITY DEFINER-
-- funktioner (kører som ejer) og service role — begge går uden om RLS — men en
-- fremtidig skriver under en anden rolle må aldrig få sin facts-INSERT væltet af
-- RLS på hukommelsen. Funktionen indsætter KUN i denne ene tabel.
--
-- BAGUDFYLDNING: hver målt facts-række giver sin created_at — det bedste, vi har
-- for rækker, der allerede er blevet erstattet (den oprindelige dato er tabt;
-- fejlen går kun til medlemmets ugunst for måneder rettet FØR i dag, og hooken
-- tager den tidligste af hukommelsen og created_at).
--
-- FØR OG EFTER — samme forespørgsel, ÉT resultatsæt (Lovables editor eksporterer
-- kun det sidste resultatsæt):
--   SELECT 'tabel' AS sektion, coalesce(to_regclass('public.maaned_foerste_godkendelse')::text, 'null') AS svar
--   UNION ALL
--   SELECT 'rls', coalesce((SELECT relrowsecurity::text FROM pg_class WHERE relname = 'maaned_foerste_godkendelse' AND relnamespace = 'public'::regnamespace), 'null')
--   UNION ALL
--   SELECT 'policy-navne', coalesce((SELECT string_agg(policyname || ' [' || cmd || ']', ' · ' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maaned_foerste_godkendelse'), '')
--   UNION ALL
--   SELECT 'trigger i drift', coalesce((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.financial_report_facts'::regclass AND tgname = 'trigger_husk_foerste_godkendelse'), 'MANGLER')
--   UNION ALL
--   SELECT 'protect-trigger', coalesce((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.maaned_foerste_godkendelse'::regclass AND tgname = 'trigger_protect_maaned_foerste_godkendelse'), 'MANGLER')
--   UNION ALL
--   SELECT 'maalte facts', (SELECT count(*) FROM public.financial_report_facts WHERE data_basis = 'measured')::text
--   UNION ALL
--   SELECT 'hukommelse rækker', coalesce((SELECT count(*)::text FROM public.maaned_foerste_godkendelse), 'null');
--
-- FORVENTET FØR: tabel null · rls null · policy-navne tom · trigger MANGLER ·
--   protect-trigger MANGLER · maalte facts N · hukommelse null.
-- FORVENTET EFTER: tabel public.maaned_foerste_godkendelse · rls true ·
--   policy-navne «Medlemmet læser egen virksomheds første godkendelser [SELECT] ·
--   Rådgivere læser alle første godkendelser [SELECT]» · trigger O («origin»,
--   dvs. i drift) · protect-trigger O · maalte facts N · hukommelse rækker =
--   antal DISTINKTE (company_id, period_key) blandt de målte — normalt N.
--
-- BEVIS PÅ TRIGGEREN I DRIFT (efter kørslen; «tgenabled = O» siger kun, at den
-- er slået til): godkend en måned i platformen, og mål derefter
--   SELECT period_key, foerst_godkendt_at FROM public.maaned_foerste_godkendelse
--   WHERE company_id = '<virksomhed>' ORDER BY period_key DESC LIMIT 3;
-- — den nye måned skal stå med et tidspunkt = godkendelsen. Erstat derefter
-- samme måned («Erstat gammel data») og kør SELECT'en igen: tidspunktet må
-- IKKE flytte sig, mens financial_report_facts.created_at for perioden er ny:
--   SELECT f.period_key, f.created_at, h.foerst_godkendt_at
--   FROM public.financial_report_facts f
--   JOIN public.maaned_foerste_godkendelse h USING (company_id, period_key)
--   WHERE f.company_id = '<virksomhed>' AND f.period_key = '<YYYY-MM>';
--
-- MÅLING UDEFRA FØR Update (CLAUDE.md «Nye migrations»): med anon-nøglen
--   GET /rest/v1/maaned_foerste_godkendelse?select=period_key&limit=0 → HTTP 200
-- (42P01 = tabellen mangler).

CREATE TABLE public.maaned_foerste_godkendelse (
  company_id         uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_key         text        NOT NULL,
  foerst_godkendt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period_key)
);

COMMENT ON TABLE public.maaned_foerste_godkendelse IS
  'Hvornår en måned (period_key) FØRSTE gang blev målt/godkendt for virksomheden. Skrives af trigger_husk_foerste_godkendelse på financial_report_facts (ON CONFLICT DO NOTHING); overlever Erstat gammel data og permanent sletning. Læses af Boardroom Score/tal-streaken (docs/boardroom-score.md §4). Aldrig UPDATE.';

ALTER TABLE public.maaned_foerste_godkendelse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Medlemmet læser egen virksomheds første godkendelser"
  ON public.maaned_foerste_godkendelse FOR SELECT TO authenticated
  USING (company_id = public.user_company_id(auth.uid()));

CREATE POLICY "Rådgivere læser alle første godkendelser"
  ON public.maaned_foerste_godkendelse FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));

-- Aldrig UPDATE — for nogen rolle. DELETE kun som cascade fra companies (ingen policy giver klienten DELETE).
CREATE OR REPLACE FUNCTION public.protect_maaned_foerste_godkendelse()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'maaned_foerste_godkendelse er hukommelse: rækker opdateres aldrig (company_id=%, period_key=%)', OLD.company_id, OLD.period_key;
END;
$$;

CREATE TRIGGER trigger_protect_maaned_foerste_godkendelse
  BEFORE UPDATE ON public.maaned_foerste_godkendelse
  FOR EACH ROW EXECUTE FUNCTION public.protect_maaned_foerste_godkendelse();

-- Husk første måling: ved INSERT af en målt række, eller ved UPDATE der GØR rækken målt.
CREATE OR REPLACE FUNCTION public.husk_foerste_godkendelse()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NEW.data_basis IS DISTINCT FROM 'measured' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.data_basis = 'measured' THEN
    RETURN NEW;  -- var allerede målt: gen-godkendelse flytter intet
  END IF;
  INSERT INTO public.maaned_foerste_godkendelse (company_id, period_key, foerst_godkendt_at)
  VALUES (NEW.company_id, NEW.period_key, now())
  ON CONFLICT (company_id, period_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.husk_foerste_godkendelse() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_maaned_foerste_godkendelse() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trigger_husk_foerste_godkendelse
  AFTER INSERT OR UPDATE OF data_basis ON public.financial_report_facts
  FOR EACH ROW EXECUTE FUNCTION public.husk_foerste_godkendelse();

-- Bagudfyldning: de målte rækkers created_at (den første står ved konflikt — der er én række pr. (company_id, period_key) i facts).
INSERT INTO public.maaned_foerste_godkendelse (company_id, period_key, foerst_godkendt_at)
SELECT company_id, period_key, created_at
FROM public.financial_report_facts
WHERE data_basis = 'measured'
ON CONFLICT (company_id, period_key) DO NOTHING;
