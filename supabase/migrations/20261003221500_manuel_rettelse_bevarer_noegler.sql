-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- KRÆVER GRØNT LYS (Jonas): ændrer en SECURITY DEFINER-funktion, public.resolve_report_commit_candidate
-- (CLAUDE.md «FORBIDDEN uden eksplicit grønt lys»). Ingen frontend venter på den; ingen Update nødvendig.
--
-- HVAD: den manuelle gren af resolve_report_commit_candidate bevarer de kanoniske nøgler, formularen
-- ikke kan udtrykke (dansk_noegle IS NULL og ingen danske_aliaser), fra SAMME rapports
-- normalized_data.metrics. Ellers er funktionen tegn for tegn den, der kører i prod 3/10
-- (fixture: src/lib/__tests__/fixtures/resolve_report_commit_candidate.prod-2026-10-03.sql,
-- md5 eaf5feab333dd6a6bd3a695b8a6bd932 af pg_get_functiondef). commit_report_facts røres IKKE.
--
-- HVORFOR (målt i prod 3/10, kort g03-manuel-rettelse-taber-noegler, docs/OVERLEVERING.md DEL 2
-- «3. oktober — den manuelle rettelse bevarer nøglerne»): commit_report_facts gør
-- `SET metrics = _candidate.metrics_preview` (hele objektet erstattes), og den manuelle gren bygger
-- metrics_preview KUN af formularens danske navne. 50 af 57 manuelle facts-rækker (9 virksomheder) har
-- mistet 121 nøgle-værdier, kilderapporten har: vehicle_costs 18 (alle ≠ 0, 120.989 kr.),
-- financial_costs 28 (7 ≠ 0, 59.133 kr.), financial_income 6 (2 ≠ 0, 3.922 kr.), extraordinary_items 14
-- (alle 0), inventory 14, receivables_total 14, liabilities_total 26, provisions_total 1.
-- Den ALLEREDE TABTE data genskabes IKKE af denne migration (den virker først ved næste commit) — se
-- den separate datafil docs/sql/20261003-genskab-manuelle-noegler.sql (kræver Jonas' ja).
--
-- Mindste korrekte rettelse — de to alternativer, der blev vejet:
--   (a) merge i commit_report_facts (`metrics || preview`): ville også genoplive en nøgle, rådgiveren
--       BEVIDST har tømt i formularen (formularen sender null for et tomt felt → nøglen udelades), og
--       en gammel værdi fra en tidligere commit ville overleve en ny rapport. Forkert.
--   (b) seede danske navne (pensioner_sociale/oevrige_personale/autodrift) i kanoniske_noegler: retter
--       intet alene — formularen har intet felt for dem (PNL_FIELDS) og ville stadig ikke sende dem —
--       og finans/balancenøglerne har slet ikke et navn. Kræver ny UI. Åbent punkt hos Jonas.
--   Valgt: bevar KUN det, formularen ikke kan udtrykke, fra rapportens egen kilde. Formularens tal vinder.
--
-- FØR (Lovable SQL editor, egen kørsel — skal give md5 = eaf5feab333dd6a6bd3a695b8a6bd932):
--   SELECT md5(pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure)) AS md5,
--          (SELECT prosecdef FROM pg_proc WHERE oid = 'public.resolve_report_commit_candidate(uuid)'::regprocedure) AS secdef;
--   Står der en anden md5: STOP — funktionen er ændret siden 3/10, og filen skal bygges om på den nye.
--   (Migrationen standser også selv: DO-blokken herunder kaster, hvis md5 ikke er den forventede.)
--
-- EFTER (egen kørsel):
--   SELECT md5(pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure)) AS md5,
--          position('BEVAR NØGLER, FORMULAREN IKKE KAN UDTRYKKE' IN pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure)) > 0 AS blokken_findes,
--          (SELECT prosecdef FROM pg_proc WHERE oid = 'public.resolve_report_commit_candidate(uuid)'::regprocedure) AS secdef;
--   Forventet: md5 = 62938b01c9311c67020af28db981d741, blokken_findes = true, secdef = true.
--   Adfærden (læser kun — funktionen skriver intet): for en manuelt rettet rapport med autodrift i kilden,
--   fx BR Roset 2026-07 (facts-rækken findes; rapport-id slås op i samme kørsel):
--   SELECT c.state, c.metrics_preview ? 'vehicle_costs' AS har_auto, c.metrics_preview->>'vehicle_costs' AS auto
--   FROM public.financial_report_facts f, LATERAL public.resolve_report_commit_candidate(f.source_report_id) c
--   WHERE f.company_id = '7b0056eb-1498-439b-ac3b-0f8e96e83cdd' AND f.period_key = '2026-07';
--   Forventet: state 'update_available', har_auto true, auto 4000. (auth.uid() bruges ikke af resolveren.)
--
-- TILBAGERULNING: kør fixture-filens CREATE OR REPLACE (prod-definitionen 3/10) med et afsluttende «;».
--
-- Værn: src/lib/__tests__/manuelRettelseNoegler.guard.test.ts (funktionen = fixture + blokken, tegn for tegn;
-- blokkens betingelser; FØR-vagten; den rene spejling src/lib/manuelRettelseNoegler.ts).

BEGIN;

DO $vagt$
BEGIN
  IF md5(pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure)) <> 'eaf5feab333dd6a6bd3a695b8a6bd932' THEN
    RAISE EXCEPTION 'STOP: resolve_report_commit_candidate er ændret siden 3/10 (md5 %). Byg migrationen om på den nye definition.',
      md5(pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure));
  END IF;
END
$vagt$;

CREATE OR REPLACE FUNCTION public.resolve_report_commit_candidate(p_report_id uuid)
 RETURNS report_commit_candidate
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _out public.report_commit_candidate;
  _raw_metrics jsonb;
  _mapped jsonb := '{}'::jsonb;
  _k text;
  _v numeric;
  _canonical_key text;
  _has_any boolean := false;
  _existing record;
  _owner_deleted_at timestamptz;
BEGIN
  _out.report_id := p_report_id;

  SELECT * INTO _r
  FROM public.financial_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    _out.eligible := false;
    _out.eligibility_reason := 'Report not found';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Rapport ikke fundet';
    RETURN _out;
  END IF;

  _out.company_id := _r.company_id;
  _out.report_type := COALESCE(_r.manual_report_type, _r.report_type);

  IF _r.deleted_at IS NOT NULL THEN
    _out.eligible := false;
    _out.eligibility_reason := 'Report is soft-deleted';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Rapport er slettet';
    RETURN _out;
  END IF;

  IF _r.status != 'processed' THEN
    _out.eligible := false;
    _out.eligibility_reason := format('Status is %s, expected processed', _r.status);
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := format('Rapport har status: %s', _r.status);
    RETURN _out;
  END IF;

  -- ========== MANUAL OVERRIDE (highest priority, both V1 and V2) ==========
  IF _r.manual_override_status = 'applied'
     AND _r.manual_normalized_data IS NOT NULL
     AND (_r.manual_normalized_data -> 'metrics') IS NOT NULL
  THEN
    _out.source_type := 'manual';
    _out.validation_status := 'manual-approved';
    _raw_metrics := _r.manual_normalized_data -> 'metrics';

    FOR _k, _v IN
      SELECT key, value::numeric
      FROM jsonb_each_text(_raw_metrics)
      WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
    LOOP
      -- Dansk → canonical via den fælles liste (dansk_noegle eller et af de gamle aliaser) — før en fast CASE.
      SELECT kn.noegle INTO _canonical_key
      FROM public.kanoniske_noegler kn
      WHERE kn.dansk_noegle = _k OR _k = ANY(kn.danske_aliaser)
      LIMIT 1;

      IF _canonical_key IS NOT NULL THEN
        IF NOT (_mapped ? _canonical_key) THEN
          _mapped := _mapped || jsonb_build_object(_canonical_key, _v);
          _has_any := true;
        END IF;
      END IF;
    END LOOP;

    -- BEVAR NØGLER, FORMULAREN IKKE KAN UDTRYKKE (3/10-2026, kort g03-manuel-rettelse-taber-noegler,
    -- migration 20261003221500). Formularen skriver kun danske navne, og en kanonisk nøgle uden dansk_noegle
    -- og uden danske_aliaser kan den aldrig sende (vehicle_costs, financial_costs, financial_income,
    -- payroll_related, other_staff_costs, extraordinary_items, inventory, liabilities_total, …).
    -- commit_report_facts ERSTATTER hele metrics med metrics_preview, så før denne blok slettede en manuel
    -- rettelse dem af facts (målt 3/10: 50 af 57 manuelle facts-rækker). De tages nu fra SAMME rapports
    -- normalized_data.metrics. Formularens tal vinder altid (NOT (_mapped ? _k)), og blokken sætter IKKE
    -- _has_any: en rettelse uden ét eneste formulartal er stadig «Ingen mappable metrics».
    IF jsonb_typeof(_r.normalized_data -> 'metrics') = 'object' THEN
      FOR _k, _v IN
        SELECT e.key, e.value::numeric
        FROM jsonb_each_text(_r.normalized_data -> 'metrics') e
        JOIN public.kanoniske_noegler kn ON kn.noegle = e.key
        WHERE kn.dansk_noegle IS NULL
          AND COALESCE(cardinality(kn.danske_aliaser), 0) = 0
          AND e.value IS NOT NULL AND e.value ~ '^-?[0-9]'
      LOOP
        IF NOT (_mapped ? _k) THEN
          _mapped := _mapped || jsonb_build_object(_k, _v);
        END IF;
      END LOOP;
    END IF;

    _out.metrics_preview := _mapped;
    _out.period_key := _r.manual_report_period_key;
    _out.period_label := COALESCE(_r.manual_report_period_label, _r.report_period);

  -- ========== V2 BRANCH: extraction_contract_version = 'v2' ==========
  ELSIF _r.extraction_contract_version = 'v2'
     AND _r.normalized_data IS NOT NULL
     AND (_r.normalized_data -> 'metrics') IS NOT NULL
  THEN
    _out.source_type := 'canonical_v2';
    _out.validation_status := COALESCE(_r.validation_status, 'unknown');
    _raw_metrics := _r.normalized_data -> 'metrics';

    FOR _k, _v IN
      SELECT key, value::numeric
      FROM jsonb_each_text(_raw_metrics)
      WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
    LOOP
      -- Canonical nøgle via den fælles liste — før en fast IN-liste på 19 nøgler, der lod
      -- vehicle_costs, financial_costs, payroll_related, other_staff_costs og extraordinary_items falde bort i stilhed.
      IF EXISTS (SELECT 1 FROM public.kanoniske_noegler kn WHERE kn.noegle = _k) THEN
        _mapped := _mapped || jsonb_build_object(_k, _v);
        _has_any := true;
      END IF;
    END LOOP;

    _out.metrics_preview := _mapped;
    _out.period_key := parse_dk_report_period_key(_r.report_period);
    _out.period_label := _r.report_period;

  -- ========== V1 BRANCH: requires validation_status = 'PASS' ==========
  ELSIF _r.validation_status = 'PASS'
     AND _r.normalized_data IS NOT NULL
     AND (_r.normalized_data -> 'metrics') IS NOT NULL
  THEN
    _out.source_type := 'canonical';
    _out.validation_status := 'PASS';
    _raw_metrics := _r.normalized_data -> 'metrics';

    FOR _k, _v IN
      SELECT key, value::numeric
      FROM jsonb_each_text(_raw_metrics)
      WHERE value IS NOT NULL AND value ~ '^-?[0-9]'
    LOOP
      -- Canonical nøgle via den fælles liste — før en fast IN-liste på 19 nøgler, der lod
      -- vehicle_costs, financial_costs, payroll_related, other_staff_costs og extraordinary_items falde bort i stilhed.
      IF EXISTS (SELECT 1 FROM public.kanoniske_noegler kn WHERE kn.noegle = _k) THEN
        _mapped := _mapped || jsonb_build_object(_k, _v);
        _has_any := true;
      END IF;
    END LOOP;

    _out.metrics_preview := _mapped;
    _out.period_key := parse_dk_report_period_key(_r.report_period);
    _out.period_label := _r.report_period;

  ELSE
    _out.eligible := false;
    _out.eligibility_reason := 'No canonical PASS or manual-approved metrics';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Ingen godkendte metrics fundet';
    _out.validation_status := COALESCE(_r.validation_status, 'unknown');
    RETURN _out;
  END IF;

  IF NOT _has_any THEN
    _out.eligible := false;
    _out.eligibility_reason := 'No mappable metrics after filtering';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Ingen mappable metrics fundet';
    RETURN _out;
  END IF;

  IF _out.period_key IS NULL OR _out.period_key = '' THEN
    _out.eligible := false;
    _out.eligibility_reason := 'Cannot resolve period key';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := 'Periode kunne ikke bestemmes';
    RETURN _out;
  END IF;

  -- Block current and future months — a period is only committable once the month is complete.
  -- DANSK TID (10/9-2026): now() er UTC; fladen dømmer i Europe/Copenhagen (reportCardView.erForTidligt),
  -- og den 1. mellem 00:00 og 02:00 dansk tid sagde de to forskelligt. Samme regel i TypeScript: _shared/maanedsnoegle.ts.
  IF _out.period_key >= to_char(now() AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM') THEN
    _out.eligible := false;
    _out.eligibility_reason := 'Period is current or future month';
    _out.can_commit := false;
    _out.state := 'not_ready';
    _out.state_reason := format('Periode %s er ikke afsluttet endnu — kan kun godkendes efter månedens afslutning', _out.period_key);
    RETURN _out;
  END IF;

  _out.eligible := true;
  _out.eligibility_reason := NULL;

  -- Ownership lookup
  SELECT * INTO _existing
  FROM public.financial_report_facts
  WHERE company_id = _r.company_id AND period_key = _out.period_key;

  IF FOUND THEN
    _out.existing_owner_id := _existing.source_report_id;
    IF _existing.source_report_id = p_report_id THEN
      _out.ownership_state := 'same_report';
      _out.can_commit := true;
      _out.state := 'update_available';
      _out.state_reason := NULL;
    ELSE
      SELECT deleted_at INTO _owner_deleted_at
      FROM public.financial_reports
      WHERE id = _existing.source_report_id;

      IF _owner_deleted_at IS NOT NULL THEN
        _out.ownership_state := 'none';
        _out.can_commit := true;
        _out.state := 'ready';
        _out.state_reason := NULL;
      ELSE
        _out.ownership_state := 'other_report';
        _out.can_commit := false;
        _out.state := 'blocked';
        _out.state_reason := format('Periode %s ejes af rapport %s', _out.period_key, _existing.source_report_id);
      END IF;
    END IF;
  ELSE
    _out.ownership_state := 'none';
    _out.existing_owner_id := NULL;
    _out.can_commit := true;
    _out.state := 'ready';
    _out.state_reason := NULL;
  END IF;

  RETURN _out;
END;
$function$;

DO $vagt$
BEGIN
  IF position('BEVAR NØGLER, FORMULAREN IKKE KAN UDTRYKKE' IN pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'STOP: blokken står ikke i funktionen efter CREATE OR REPLACE';
  END IF;
END
$vagt$;

COMMIT;
