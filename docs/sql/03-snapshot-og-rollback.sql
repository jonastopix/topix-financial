-- IKKE KØRT. DATAFIL — ikke en migration. KRÆVER JONAS' JA (genkørslen overskriver rapporter og facts).
-- Snapshot og tilbagerulning for genkørslen af de AI-læste rapporter efter Pakke B skive 1
-- (AI-skemaet med de fem grupper, `extract-financial-data` bevist i drift 3/10 kl. 21:49, `ai_skema: skive-1`).
-- Skrevet 3/10 på grenen fix/manuel-rettelse-noegler. Den oprindelige `udkast-genkoersel-plan/03-snapshot-og-rollback.sql`
-- (17/9) ligger kun i ~/Downloads og er ikke i repoet; denne fil erstatter den for AI-holdet og følger samme tabelnavne
-- (ops.genkoersel_foer_rapporter / ops.genkoersel_foer_facts — de findes IKKE i prod, målt 3/10: skemaet ops findes ikke).
-- Kort: m17-koerelisten punkt (3), m17-ai-skema-grupper. Tørkørslen pr. virksomhed: docs/OVERLEVERING.md DEL 2
-- «3. oktober — tørkørsel af genkørslen af de 43 AI-rapporter».
--
-- Køres i Lovable → SQL editor, ÉT TRIN AD GANGEN (editoren eksporterer kun sidste resultatsæt).
--
-- HOLDET (reglen, målt 3/10 → 21 rapporter hos 7 virksomheder):
--   extraction_method = 'ai_extraction' · deleted_at IS NULL · status = 'processed'
--   · manual_override_status IS DISTINCT FROM 'applied'   (en manuel rettelse har forrang i resolveren — genkørsel ændrer intet; m17-manuelle-rettelser)
--   · rapporten ejer en facts-række                        (ellers er der intet at rette i Dine tal)
--   · virksomheden er kunde (er_kunde = true)               (Topix.dk ApS er gæst og tages ud — 3 rapporter)
--   Booking Innovation 3 · CARMA STUDIO 4 · Green Solar 1 · KJ AUTO 1 · Nordic By Hand 3 · PHILBERT 6 · Rezycl.com 3.
--   UDE (22 = 43 − 21): 14 manuelt rettede (ANLA 2, Booking 5, Green Solar 2, Rezycl 4, YKRG 1), 4 med status ≠ processed
--   (Livja 1, PHILBERT 2026-05 1, Warburg 2 — Warburg ejer ingen facts; måneden står på balancerapporten), 3 Topix.dk,
--   1 PHILBERT-rapport (2026-02) uden facts-række.
--
-- Snapshottet FRYSER holdet: genkørslen og tilbagerulningen læser rapport-id'erne af ops.genkoersel_foer_rapporter,
-- aldrig af reglen igen.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 1 — FØR (læser kun). Forventet 3/10: 21 rapporter, 7 virksomheder, 21 facts-rækker.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
SELECT c.name AS virksomhed, count(*) AS rapporter, count(f.id) AS facts,
       string_agg(f.period_key, ',' ORDER BY f.period_key) AS maaneder
FROM public.financial_reports fr
JOIN public.companies c ON c.id = fr.company_id
JOIN public.financial_report_facts f ON f.source_report_id = fr.id
WHERE fr.extraction_method = 'ai_extraction'
  AND fr.deleted_at IS NULL
  AND fr.status = 'processed'
  AND fr.manual_override_status IS DISTINCT FROM 'applied'
  AND c.er_kunde IS TRUE
GROUP BY c.name
ORDER BY c.name;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 2 — SNAPSHOT (skriver kun i ops). Hele rækkerne gemmes. Forventet: «SELECT 21» to gange.
-- Kører trinnet to gange, fejler CREATE TABLE — godt (et snapshot overskrives aldrig).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS ops;
REVOKE ALL ON SCHEMA ops FROM PUBLIC, anon, authenticated;

CREATE TABLE ops.genkoersel_foer_rapporter AS
SELECT now() AS taget_at, 'ai-skema-skive-1'::text AS hold, fr.*
FROM public.financial_reports fr
JOIN public.companies c ON c.id = fr.company_id
WHERE fr.extraction_method = 'ai_extraction'
  AND fr.deleted_at IS NULL
  AND fr.status = 'processed'
  AND fr.manual_override_status IS DISTINCT FROM 'applied'
  AND c.er_kunde IS TRUE
  AND EXISTS (SELECT 1 FROM public.financial_report_facts f WHERE f.source_report_id = fr.id);
ALTER TABLE ops.genkoersel_foer_rapporter ADD PRIMARY KEY (id);

CREATE TABLE ops.genkoersel_foer_facts AS
SELECT now() AS taget_at, f.*
FROM public.financial_report_facts f
WHERE f.source_report_id IN (SELECT id FROM ops.genkoersel_foer_rapporter);
ALTER TABLE ops.genkoersel_foer_facts ADD PRIMARY KEY (id);

REVOKE ALL ON ops.genkoersel_foer_rapporter, ops.genkoersel_foer_facts FROM PUBLIC, anon, authenticated;

-- Kontrol (egen kørsel): forventet rapporter 21, facts 21, og udækket før pr. virksomhed som i OVERLEVERING.
SELECT (SELECT count(*) FROM ops.genkoersel_foer_rapporter) AS rapporter,
       (SELECT count(*) FROM ops.genkoersel_foer_facts) AS facts;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 3 — GENKØRSLEN (ikke SQL). «Genkør rapporter» (/virksomheder/genkoer) KUN for id'erne i
-- ops.genkoersel_foer_rapporter, hold à 10, derefter «Godkend alle der er PASS». Id-listen til fladen:
--   SELECT string_agg(id::text, E'\n' ORDER BY company_id, report_period) FROM ops.genkoersel_foer_rapporter;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 4 — EFTER (læser kun): pr. rapport før/efter — ai_skema-markøren, de fem nye nøgler, udækket, facts ændret.
-- Udækket regnes med husets formel (omkostningsnoegler.kontrolsum) på normalized_data.metrics:
--   regnet = basis + |andre driftsindtægter| + |finansielle indtægter| − Σ|drift (8 nøgler) + afskrivninger| − |finans|
--   basis  = |omsætning| − |vareforbrug| (ellers dækningsbidrag, ellers |omsætning|); udækket = ebt − regnet.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
WITH par AS (
  SELECT s.id, s.company_id, s.normalized_data->'metrics' AS foer, r.normalized_data->'metrics' AS efter,
         r.raw_extracted_data->>'ai_skema' AS ai_skema, r.status AS status_efter
  FROM ops.genkoersel_foer_rapporter s JOIN public.financial_reports r ON r.id = s.id
), udaekket AS (
  SELECT p.*, x.side, x.m,
    CASE WHEN jsonb_typeof(x.m->'ebt') = 'number' AND jsonb_typeof(x.m->'revenue') = 'number' THEN round(
      (x.m->>'ebt')::numeric - (
        CASE WHEN jsonb_typeof(x.m->'cogs') = 'number' THEN abs((x.m->>'revenue')::numeric) - abs((x.m->>'cogs')::numeric)
             WHEN jsonb_typeof(x.m->'gross_profit') = 'number' THEN (x.m->>'gross_profit')::numeric
             ELSE abs((x.m->>'revenue')::numeric) END
        + COALESCE(abs(CASE WHEN jsonb_typeof(x.m->'other_operating_income') = 'number' THEN (x.m->>'other_operating_income')::numeric END), 0)
        + COALESCE(abs(CASE WHEN jsonb_typeof(x.m->'financial_income') = 'number' THEN (x.m->>'financial_income')::numeric END), 0)
        - (SELECT COALESCE(sum(abs((x.m->>k)::numeric)), 0) FROM unnest(ARRAY['payroll','payroll_related','other_staff_costs','sales_costs','facility_costs','admin_costs','vehicle_costs','other_costs','depreciation']) k WHERE jsonb_typeof(x.m->k) = 'number')
        - COALESCE(abs(CASE WHEN jsonb_typeof(x.m->'financial_costs') = 'number' THEN (x.m->>'financial_costs')::numeric END), 0)
      )) END AS udaekket
  FROM par p CROSS JOIN LATERAL (VALUES ('foer', p.foer), ('efter', p.efter)) AS x(side, m)
)
SELECT c.name, u.id, u.status_efter, u.ai_skema,
       max(u.udaekket) FILTER (WHERE u.side = 'foer') AS udaekket_foer,
       max(u.udaekket) FILTER (WHERE u.side = 'efter') AS udaekket_efter,
       bool_or(u.m ?| ARRAY['payroll_related','other_staff_costs','vehicle_costs','other_costs','extraordinary_items']) FILTER (WHERE u.side = 'efter') AS nye_noegler_efter,
       (SELECT f.metrics IS DISTINCT FROM sf.metrics FROM public.financial_report_facts f JOIN ops.genkoersel_foer_facts sf ON sf.id = f.id WHERE f.source_report_id = u.id LIMIT 1) AS facts_aendret
FROM udaekket u JOIN public.companies c ON c.id = u.company_id
GROUP BY c.name, u.id, u.status_efter, u.ai_skema
ORDER BY c.name, u.id;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TILBAGERULNING (kun hvis Jonas beder om den). Tre trin, hver for sig.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- R1 — rapporterne: udtrækkets kolonner tilbage. Guardet: ingen manuel rettelse er lagt på siden snapshottet,
--      og rapporten er ikke slettet. Forventet «UPDATE 21».
-- UPDATE public.financial_reports r
-- SET extracted_data = s.extracted_data, raw_extracted_data = s.raw_extracted_data, normalized_data = s.normalized_data,
--     validation_status = s.validation_status, validation_errors = s.validation_errors, quality_signals = s.quality_signals,
--     status = s.status, processed_at = s.processed_at, extraction_contract_version = s.extraction_contract_version,
--     extraction_method = s.extraction_method, report_type = s.report_type, report_period = s.report_period,
--     company_name = s.company_name, cvr_number = s.cvr_number, ai_analysis = s.ai_analysis
-- FROM ops.genkoersel_foer_rapporter s
-- WHERE r.id = s.id
--   AND r.manual_override_status IS NOT DISTINCT FROM s.manual_override_status
--   AND r.deleted_at IS NULL;
--
-- R2 — facts: rækkerne fra snapshottet tilbage (samme id). Guardet: rækken ejes stadig af samme rapport.
--      Forventet «UPDATE 21». (Opdaterer period_key kun hvis den er flyttet — trigger guard_facts_period_window dømmer.)
-- UPDATE public.financial_report_facts f
-- SET metrics = s.metrics, period_key = s.period_key, period_label = s.period_label, source_type = s.source_type,
--     data_basis = s.data_basis, committed_at = s.committed_at, committed_by = s.committed_by
-- FROM ops.genkoersel_foer_facts s
-- WHERE f.id = s.id
--   AND f.source_report_id = s.source_report_id;
--
-- R3 — kontrol (læser kun): facts-rækker, genkørslen SKABTE (rapport i holdet, id ikke i snapshottet), og snapshot-rækker,
--      der ikke længere findes. Forventet 0 og 0. Andet end 0: STOP — de afgøres pr. række af Jonas (en sletning er
--      ikke en del af denne fil).
-- SELECT 'ny facts-række' AS hvad, f.id, f.company_id, f.period_key FROM public.financial_report_facts f
--  WHERE f.source_report_id IN (SELECT id FROM ops.genkoersel_foer_rapporter) AND f.id NOT IN (SELECT id FROM ops.genkoersel_foer_facts)
-- UNION ALL
-- SELECT 'forsvundet', s.id, s.company_id, s.period_key FROM ops.genkoersel_foer_facts s
--  WHERE NOT EXISTS (SELECT 1 FROM public.financial_report_facts f WHERE f.id = s.id);
--
-- Snapshot-tabellerne slettes først, når Jonas har set tallene i drift.
