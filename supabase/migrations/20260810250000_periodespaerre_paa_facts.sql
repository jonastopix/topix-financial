-- Spærre: en umulig periode må aldrig stå i tallene.
--
-- Baggrund: års-guarden (uploadår−2) bor kun i extract-financial-datas
-- automatiske tragt. Den manuelle vej har intet tilsvarende værn: året
-- er et frit talfelt (min/max 2000-2100 er en HTML-hint), klient-
-- valideringen springes over ved "Gem kladde", DB-constrainten på
-- manual_report_period_key validerer kun FORMAT, og
-- resolve_report_commit_candidate tager nøglen direkte og afviser kun
-- fremtidige perioder. "Juni 2020" — præcis den værdi guarden blev
-- bygget for at afvise — kan indtastes manuelt og committes.
--
-- Insertet i financial_report_facts er det ene flaskehalspunkt begge
-- veje passerer. Derfor sidder spærren her.
--
-- To lag, fordi en CHECK-constraint skal være immutabel og derfor ikke
-- kan bruge now():
--   CHECK   = format + absolut bund. period_key er text uden validering
--             i dag, mens KPI-grafer, benchmarks og
--             parse_dk_report_period_key alle antager 'YYYY-MM'.
--   TRIGGER = relativt vindue mod uploadtidspunktet.
--
-- Grænsen er 60 måneder, ikke uploadår−2. Guarden i tragten er stram og
-- GENOPRETTELIG (dropper auto-perioden, beder om manuel bekræftelse).
-- Denne spærre er løs og ABSOLUT (kaster fejl). De skal ikke have samme
-- grænse. Ældste rigtige data er 2024-01; 60 måneder rammer aldrig en
-- bevidst historik-upload.
--
-- Verificeret før oprettelse: 266 rækker, 0 med ugyldigt format,
-- 0 før 2015, 0 i fremtiden.

-- Idempotent: migrationen skal kunne køres igen på en genopbygget base.
ALTER TABLE public.financial_report_facts
  DROP CONSTRAINT IF EXISTS financial_report_facts_period_key_format;

ALTER TABLE public.financial_report_facts
  ADD CONSTRAINT financial_report_facts_period_key_format
  CHECK (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$' AND period_key >= '2015-01');

CREATE OR REPLACE FUNCTION public.guard_facts_period_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _floor text := to_char(now() - interval '60 months', 'YYYY-MM');
  _ceil  text := to_char(now(), 'YYYY-MM');
BEGIN
  IF NEW.period_key < _floor THEN
    RAISE EXCEPTION
      'Perioden % ligger mere end 60 måneder tilbage (tidligst %). Kontrollér rapportens periode.',
      NEW.period_key, _floor
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.period_key > _ceil THEN
    RAISE EXCEPTION
      'Perioden % ligger i fremtiden (seneste %). En måned der ikke er slut, kan ikke gøres op.',
      NEW.period_key, _ceil
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_facts_period_window ON public.financial_report_facts;
CREATE TRIGGER trigger_guard_facts_period_window
  BEFORE INSERT OR UPDATE OF period_key ON public.financial_report_facts
  FOR EACH ROW EXECUTE FUNCTION public.guard_facts_period_window();

-- Kontrol: skal give 266 rækker og 0 uden for vinduet.
SELECT
  count(*)                                                        AS raekker,
  count(*) FILTER (WHERE period_key !~ '^\d{4}-(0[1-9]|1[0-2])$') AS ugyldigt_format,
  count(*) FILTER (WHERE period_key < to_char(now() - interval '60 months', 'YYYY-MM')) AS for_gamle,
  count(*) FILTER (WHERE period_key > to_char(now(), 'YYYY-MM'))  AS i_fremtiden
FROM public.financial_report_facts;
