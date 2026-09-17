-- ÉN fælles liste over kanoniske nøgler — koden og databasen læser den samme (17/9-2026).
--
-- JONAS 17/9 (ordret): «Vi får med din anbefaling til den bedste løsning» — valg B: den faste
-- nøgleliste i resolve_report_commit_candidate fjernes og erstattes af ÉN fælles liste, som
-- både koden og databasen læser.
--
-- HVORFOR: resolveren kopierede kun nøgler fra en FAST liste på 19 (V2 :139-142 og V1 :166-169 i
-- 20260910220000) og en FAST CASE på 20 danske navne (manuel :89-111). Alt andet faldt bort i
-- STILHED: vehicle_costs, financial_costs, payroll_related, other_staff_costs og extraordinary_items
-- blev læst af skabelonerne (recon-resultat-alle-skabeloner.md, vindue A) og lå i
-- financial_reports.normalized_data->'metrics', men nåede aldrig financial_report_facts — derfor
-- «regnet ≫ ebt» på fladen. Saldobalance-rettelsen tilføjer to nøgler mere (other_costs,
-- other_operating_income), som den samme liste ville have tabt.
--
-- LØSNINGEN: tabellen public.kanoniske_noegler (noegle → dansk_noegle, gruppe, label, gamle
-- aliaser). Resolveren slår op i den (EXISTS / SELECT) i stedet for listerne. Koden læser den
-- samme liste i test: src/lib/__tests__/kanoniskeNoegler.guard.test.ts FEJLER hvis
-- canonicalTypes.CanonicalMetrics kender en nøgle seeden ikke har (eller omvendt), og hvis
-- factsAdapter/reportOverrideHelpers' danske nøgler afviger fra seedens. En ny nøgle = én række
-- her + én linje i typen, og værnet holder dem sammen.
--
-- HVAD ER MED: alle 32 nøgler i CanonicalMetrics (canonicalTypes.ts:27-62) undtagen de to AFLEDTE
-- PROCENTER gross_margin_pct og equity_ratio_pct (regnes af læserne af de gemte tal — gemt ville de
-- kunne drive fra tallene efter en manuel rettelse; de har aldrig været committet). 'trade_payables'
-- stod på den gamle liste men findes ikke i CanonicalMetrics og skrives af ingen kode (målt: kun i
-- migrationer) — udgår. PLUS financial_income (renteindtægter — «to nøgler, ikke netto», vindue A's
-- skabelon-udkast lægger nøglen i typen og læser den i e-conomics PDF'er; seedet NU, så resolveren kun
-- ændres én gang; værnet kanoniskeNoegler.guard bærer den som navngiven, selvudløbende undtagelse indtil A
-- lander). gruppe: indtaegt (revenue, other_operating_income, financial_income), omkostning (11),
-- resultat (6), balance (13) — 33 rækker. danske_aliaser bærer den gamle CASE's alternative navne
-- (bruttofortjeneste → gross_profit, resultat_foer_afskrivninger → ebitda, likvider → cash), så
-- ældre manual_normalized_data mapper som før.
--
-- RLS: SELECT for authenticated (ren metadata, ingen kundedata); skrivning kun service_role (ingen
-- INSERT/UPDATE/DELETE-policy → kun service-role/ejer). Resolveren er SECURITY DEFINER (ejer:
-- postgres) og læser tabellen uanset.
--
-- resolve_report_commit_candidate: ORDRET kopi af 20260910220000 (genereret af dens tekst) med
-- PRÆCIS tre ændringer: V2-listen → EXISTS, V1-listen → EXISTS, manuel CASE → SELECT på
-- dansk_noegle/aliaser. SECURITY DEFINER, search_path, adgangstjek, regel 6 (dansk tid),
-- ejerskab/kollision: UÆNDREDE. commit_report_facts røres ikke (20260826120000 gælder).
--
-- SKREVET 17/9, IKKE KØRT. SECURITY DEFINER-funktion → Jonas' grønne lys (CLAUDE.md «FORBIDDEN»).
-- Deploy manuelt i Lovable → SQL editor efter merge og udrulning af koden, FØR backfill
-- (udkast-saldobalance-fortegn/backfill-facts-manglende-noegler.sql) og FØR genkørslen af de 36.
--
-- FØR (kør og gem):
--   SELECT md5(pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure)) AS foer_md5;
--   SELECT to_regclass('public.kanoniske_noegler') AS tabel_foer;                       -- forventet NULL
--   SELECT id FROM financial_reports WHERE deleted_at IS NULL
--     AND normalized_data->'metrics'->>'vehicle_costs' IS NOT NULL ORDER BY uploaded_at DESC LIMIT 1;  -- <testrapport>
--   SELECT (resolve_report_commit_candidate('<testrapport>'::uuid)).metrics_preview ? 'vehicle_costs' AS foer;  -- forventet false
-- EFTER:
--   SELECT count(*) AS noegler, count(dansk_noegle) AS med_dansk FROM public.kanoniske_noegler;  -- 33 / 20
--   SELECT md5(pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure)) AS efter_md5;  -- ≠ foer_md5
--   SELECT pg_get_functiondef('public.resolve_report_commit_candidate(uuid)'::regprocedure);  -- ingen «IN ('revenue'», ingen «CASE _k»
--   SELECT (resolve_report_commit_candidate('<testrapport>'::uuid)).metrics_preview ? 'vehicle_costs' AS efter;  -- forventet true
--   SELECT (resolve_report_commit_candidate('<testrapport>'::uuid)).metrics_preview ? 'gross_margin_pct';       -- forventet false
-- ROLLBACK: kør funktions-kroppen fra 20260910220000_regel_6_dansk_tid.sql igen (ordret som før);
--   tabellen kan blive stående (den skader intet) eller: DROP TABLE public.kanoniske_noegler;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Tabellen
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kanoniske_noegler (
  noegle         text PRIMARY KEY,
  dansk_noegle   text UNIQUE,
  gruppe         text NOT NULL CHECK (gruppe IN ('resultat', 'omkostning', 'indtaegt', 'balance')),
  label          text NOT NULL,
  -- Den gamle manuelle CASE's alternative danske navne (bruttofortjeneste, likvider, resultat_foer_afskrivninger).
  danske_aliaser text[] NOT NULL DEFAULT '{}'::text[],
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kanoniske_noegler IS
  'ÉN fælles liste over kanoniske nøgler i financial_report_facts.metrics. Læses af resolve_report_commit_candidate (V2/V1 på noegle, manuel på dansk_noegle/aliaser) og af koden i test (kanoniskeNoegler.guard.test.ts mod canonicalTypes.CanonicalMetrics). Ny nøgle = én række her + typen.';

ALTER TABLE public.kanoniske_noegler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kanoniske_noegler_laes_authenticated" ON public.kanoniske_noegler;
CREATE POLICY "kanoniske_noegler_laes_authenticated"
  ON public.kanoniske_noegler FOR SELECT
  TO authenticated
  USING (true);
-- Ingen INSERT/UPDATE/DELETE-policies: kun service_role (bypasser RLS) og ejeren skriver.

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Seed — alle nøgler facts skal kunne bære (idempotent: opdaterer label/gruppe/aliaser, rører ikke created_at)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.kanoniske_noegler (noegle, dansk_noegle, gruppe, label, danske_aliaser) VALUES
  ('revenue', 'omsaetning', 'indtaegt', 'Omsætning', ARRAY[]::text[]),
  ('other_operating_income', 'andre_driftsindtaegter', 'indtaegt', 'Andre driftsindtægter', ARRAY[]::text[]),
  ('financial_income', NULL, 'indtaegt', 'Finansielle indtægter', ARRAY[]::text[]),
  ('cogs', 'direkte_omkostninger', 'omkostning', 'Direkte omkostninger', ARRAY[]::text[]),
  ('payroll', 'loenninger', 'omkostning', 'Lønomkostninger', ARRAY[]::text[]),
  ('payroll_related', NULL, 'omkostning', 'Pension og sociale omkostninger', ARRAY[]::text[]),
  ('other_staff_costs', NULL, 'omkostning', 'Øvrige personaleomkostninger', ARRAY[]::text[]),
  ('sales_costs', 'salgsomkostninger', 'omkostning', 'Salgsomkostninger', ARRAY[]::text[]),
  ('facility_costs', 'lokaleomkostninger', 'omkostning', 'Lokaleomkostninger', ARRAY[]::text[]),
  ('admin_costs', 'administrationsomkostninger', 'omkostning', 'Administrationsomkostninger', ARRAY[]::text[]),
  ('vehicle_costs', NULL, 'omkostning', 'Autodrift og transport', ARRAY[]::text[]),
  ('other_costs', 'oevrige_omkostninger', 'omkostning', 'Øvrige omkostninger', ARRAY[]::text[]),
  ('depreciation', 'afskrivninger', 'omkostning', 'Afskrivninger', ARRAY[]::text[]),
  ('financial_costs', NULL, 'omkostning', 'Finansielle omkostninger', ARRAY[]::text[]),
  ('gross_profit', 'daekningsbidrag', 'resultat', 'Dækningsbidrag', ARRAY['bruttofortjeneste']::text[]),
  ('ebitda', 'ebitda', 'resultat', 'EBITDA', ARRAY['resultat_foer_afskrivninger']::text[]),
  ('ebit', 'ebit', 'resultat', 'EBIT', ARRAY[]::text[]),
  ('extraordinary_items', NULL, 'resultat', 'Ekstraordinære poster', ARRAY[]::text[]),
  ('ebt', 'resultat_foer_skat', 'resultat', 'Resultat før skat', ARRAY[]::text[]),
  ('net_result', 'resultat_efter_skat', 'resultat', 'Resultat efter skat', ARRAY[]::text[]),
  ('assets_total', 'aktiver_i_alt', 'balance', 'Aktiver i alt', ARRAY[]::text[]),
  ('inventory', NULL, 'balance', 'Varelager', ARRAY[]::text[]),
  ('receivables_total', NULL, 'balance', 'Tilgodehavender i alt', ARRAY[]::text[]),
  ('trade_receivables', 'debitorer', 'balance', 'Debitorer', ARRAY[]::text[]),
  ('unbilled_wip', NULL, 'balance', 'Igangværende arbejder', ARRAY[]::text[]),
  ('cash', 'bank_balance', 'balance', 'Bank / likvider', ARRAY['likvider']::text[]),
  ('equity_total', 'egenkapital', 'balance', 'Egenkapital', ARRAY[]::text[]),
  ('related_party_net', NULL, 'balance', 'Mellemregning', ARRAY[]::text[]),
  ('provisions_total', NULL, 'balance', 'Hensættelser', ARRAY[]::text[]),
  ('current_liabilities', 'kreditorer', 'balance', 'Kortfristet gæld', ARRAY[]::text[]),
  ('debt_total', 'gaeld_i_alt', 'balance', 'Gæld i alt', ARRAY[]::text[]),
  ('vat_payable', NULL, 'balance', 'Moms', ARRAY[]::text[]),
  ('liabilities_total', NULL, 'balance', 'Passiver i alt', ARRAY[]::text[])
ON CONFLICT (noegle) DO UPDATE
  SET dansk_noegle = EXCLUDED.dansk_noegle,
      gruppe = EXCLUDED.gruppe,
      label = EXCLUDED.label,
      danske_aliaser = EXCLUDED.danske_aliaser;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. resolve_report_commit_candidate — ordret som 20260910220000, bortset fra de tre opslag
-- ────────────────────────────────────────────────────────────────────────────
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
