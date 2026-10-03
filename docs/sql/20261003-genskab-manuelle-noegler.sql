-- IKKE KØRT. DATAFIL — ikke en migration. KRÆVER JONAS' JA (overskriver facts for 50 manuelle måneder).
-- Køres manuelt i Lovable → SQL editor, ÉT TRIN AD GANGEN (editoren eksporterer kun sidste resultatsæt).
-- Rækkefølgen er ligegyldig i forhold til migrationen 20261003221500 (den virker kun ved NÆSTE commit;
-- denne fil retter de rækker, der ALLEREDE har mistet nøglerne). Kort g03-manuel-rettelse-taber-noegler.
--
-- HVAD: for hver facts-række med source_type = 'manual' lægges de kanoniske nøgler til, som
--   (1) står i kilderapportens normalized_data.metrics (samme rapport: f.source_report_id),
--   (2) formularen IKKE kan udtrykke (kanoniske_noegler: dansk_noegle IS NULL og ingen danske_aliaser),
--   (3) har en talværdi (jsonb_each_text-værdi ~ '^-?[0-9]'), og
--   (4) MANGLER i facts.metrics — en nøgle, der står i facts, røres aldrig (vagten, også i UPDATE'en).
-- Det er præcis den regel, migrationens blok bruger (orakel: src/lib/manuelRettelseNoegler.ts,
-- `tabteNoegler`). Formularens tal (alle andre nøgler) røres ikke.
--
-- MÅLT 3/10 (prod, kun SELECT): 57 manuelle facts-rækker; 50 har tabte nøgler (9 virksomheder); 121 par:
--   vehicle_costs 18 (18 ≠ 0; 120.989 kr. — BR Roset 7b0056eb 14 rækker 109.000, Livja 5d7fb0a3 4 rækker 11.989)
--   financial_costs 28 (7 ≠ 0; 59.133 kr.) · financial_income 6 (2 ≠ 0; 3.922 kr.) · extraordinary_items 14 (alle 0)
--   inventory 14 · receivables_total 14 · liabilities_total 26 · provisions_total 1 (balancenøgler; vises ikke på
--   de danske flader i dag, men står i facts som for enhver anden rapport)
--
-- OBS FØR JA — BR ROSET (7b0056eb) ER SKÆVERE END NØGLERNE (målt 3/10):
--   12 af BR Rosets 14 manuelle rækker har HELLER IKKE cogs, admin_costs, sales_costs, facility_costs eller
--   depreciation i facts — formularen blev gemt med de felter tomme, og kilderapporterne er genkørt 17/9 EFTER
--   rettelserne (seneste rettelse 7/9). 7 af de 14 kilderapporter står i dag med status 'error'.
--   At lægge autodriften til gør «Omk. total» MERE rigtig (pengene er brugt), men ikke rigtig: vareforbrug og
--   de navngivne grupper mangler stadig. Det hører til m17-manuelle-rettelser (skal rettelserne nulstilles, så
--   kilden committes?). Vil Jonas tage BR Roset ud her, så fjern dens id i CTE'en `omfang` i ALLE trin.
--
-- SIDEEFFEKT: triggeren trg_mark_commentaries_stale (AFTER UPDATE på financial_report_facts) markerer
--   kommentarer for de berørte måneder som forældede (is_stale = true), når metrics-hashen ændres. Det er
--   den rigtige adfærd — tallene ER ændret. husk_foerste_godkendelse fyrer ikke (data_basis røres ikke).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 1 — FØR (læser kun). KØRT 3/10 (SELECT): i alt 50 rækker · 121 par · 82 ≠ 0. Pr. nøgle (rækker / ≠ 0 / sum kr.):
-- vehicle_costs 18/18/120.989 · financial_costs 28/7/59.133 · financial_income 6/2/3.922 · extraordinary_items 14/0/0 ·
-- inventory 14/14/25.202.000 · receivables_total 14/14/3.808.000 · liabilities_total 26/26/46.618.548 · provisions_total 1/1/19.621.
-- Afviger tallene: STOP og mål hvorfor (en ny commit eller en ny rettelse siden 3/10).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
WITH omfang AS (
  SELECT unnest(ARRAY[
    '01e54ef4-e1d2-45ea-956a-645ad24b70ce','183f082e-5090-41e1-995b-371e72318d73',
    '48c09162-decd-4b77-bc8d-305e5f8cf5d3','5d7fb0a3-7ffa-467f-ad24-b3145961a0a6',
    '7b0056eb-1498-439b-ac3b-0f8e96e83cdd','86d4a4fa-8a43-4c65-ad0e-01f0d53ffbfd',
    'c81621bc-5187-4b61-ac07-058733a14a6d','f6b0a166-ca6c-4b3e-9194-e521718d2e06',
    'f7bde263-c9f3-4687-bb32-de345bf370dc']::uuid[]) AS company_id
), tabt AS (
  SELECT f.id AS fact_id, f.company_id, f.period_key, e.key AS noegle, e.value::numeric AS vaerdi
  FROM public.financial_report_facts f
  JOIN omfang o ON o.company_id = f.company_id
  JOIN public.financial_reports r ON r.id = f.source_report_id
  CROSS JOIN LATERAL jsonb_each_text(
    CASE WHEN jsonb_typeof(r.normalized_data -> 'metrics') = 'object' THEN r.normalized_data -> 'metrics' ELSE '{}'::jsonb END) e
  JOIN public.kanoniske_noegler kn ON kn.noegle = e.key
  WHERE f.source_type = 'manual'
    AND kn.dansk_noegle IS NULL
    AND COALESCE(cardinality(kn.danske_aliaser), 0) = 0
    AND e.value IS NOT NULL AND e.value ~ '^-?[0-9]'
    AND NOT (f.metrics ? e.key)
)
SELECT 'i alt' AS sektion, NULL::text AS noegle, count(DISTINCT fact_id) AS raekker, count(*) AS par,
       count(*) FILTER (WHERE vaerdi <> 0) AS par_ikke_nul, NULL::numeric AS sum
FROM tabt
UNION ALL
SELECT 'pr. nøgle', noegle, count(DISTINCT fact_id), count(*), count(*) FILTER (WHERE vaerdi <> 0), round(sum(vaerdi))
FROM tabt GROUP BY noegle
ORDER BY 1, 2;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 2 — SNAPSHOT (skriver kun i ops). FØR-værdierne gemmes HELE (metrics før) + det, der lægges til.
-- Forventet: «SELECT 50». Kører trinnet to gange, fejler CREATE TABLE (tabellen findes) — godt.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS ops;
REVOKE ALL ON SCHEMA ops FROM PUBLIC, anon, authenticated;

CREATE TABLE ops.genskab_manuelle_noegler_20261003 AS
WITH omfang AS (
  SELECT unnest(ARRAY[
    '01e54ef4-e1d2-45ea-956a-645ad24b70ce','183f082e-5090-41e1-995b-371e72318d73',
    '48c09162-decd-4b77-bc8d-305e5f8cf5d3','5d7fb0a3-7ffa-467f-ad24-b3145961a0a6',
    '7b0056eb-1498-439b-ac3b-0f8e96e83cdd','86d4a4fa-8a43-4c65-ad0e-01f0d53ffbfd',
    'c81621bc-5187-4b61-ac07-058733a14a6d','f6b0a166-ca6c-4b3e-9194-e521718d2e06',
    'f7bde263-c9f3-4687-bb32-de345bf370dc']::uuid[]) AS company_id
), tabt AS (
  SELECT f.id AS fact_id, e.key AS noegle, e.value::numeric AS vaerdi
  FROM public.financial_report_facts f
  JOIN omfang o ON o.company_id = f.company_id
  JOIN public.financial_reports r ON r.id = f.source_report_id
  CROSS JOIN LATERAL jsonb_each_text(
    CASE WHEN jsonb_typeof(r.normalized_data -> 'metrics') = 'object' THEN r.normalized_data -> 'metrics' ELSE '{}'::jsonb END) e
  JOIN public.kanoniske_noegler kn ON kn.noegle = e.key
  WHERE f.source_type = 'manual'
    AND kn.dansk_noegle IS NULL
    AND COALESCE(cardinality(kn.danske_aliaser), 0) = 0
    AND e.value IS NOT NULL AND e.value ~ '^-?[0-9]'
    AND NOT (f.metrics ? e.key)
)
SELECT f.id AS fact_id, f.company_id, f.period_key, f.source_report_id,
       f.metrics AS metrics_foer,
       jsonb_object_agg(t.noegle, t.vaerdi) AS tilfoejet,
       now() AS taget_at
FROM public.financial_report_facts f
JOIN tabt t ON t.fact_id = f.id
GROUP BY f.id, f.company_id, f.period_key, f.source_report_id, f.metrics;

ALTER TABLE ops.genskab_manuelle_noegler_20261003 ADD PRIMARY KEY (fact_id);
REVOKE ALL ON ops.genskab_manuelle_noegler_20261003 FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 3 — SKRIV. Guardet to gange: (a) rækken er uændret siden snapshottet (metrics = metrics_foer), og
-- (b) INGEN af de tilføjede nøgler står i facts (`?|`). En række, der er committet igen i mellemtiden,
-- rammer nul rækker frem for at blive overskrevet. Forventet: «UPDATE 50».
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
UPDATE public.financial_report_facts f
SET metrics = f.metrics || s.tilfoejet
FROM ops.genskab_manuelle_noegler_20261003 s
WHERE f.id = s.fact_id
  AND f.source_type = 'manual'
  AND f.metrics = s.metrics_foer
  AND NOT (f.metrics ?| ARRAY(SELECT jsonb_object_keys(s.tilfoejet)));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TRIN 4 — EFTER (læser kun). Forventet: genskabt 50, mangler 0, rørt_andet 0; og TRIN 1 giver nu 0 rækker.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
SELECT count(*) FILTER (WHERE f.metrics = s.metrics_foer || s.tilfoejet) AS genskabt,
       count(*) FILTER (WHERE f.metrics = s.metrics_foer) AS mangler,
       count(*) FILTER (WHERE f.metrics <> s.metrics_foer || s.tilfoejet AND f.metrics <> s.metrics_foer) AS roert_andet,
       (SELECT round(sum((f2.metrics->>'vehicle_costs')::numeric))
          FROM public.financial_report_facts f2 JOIN ops.genskab_manuelle_noegler_20261003 s2 ON s2.fact_id = f2.id
         WHERE s2.tilfoejet ? 'vehicle_costs') AS autodrift_kr   -- forventet 120989
FROM public.financial_report_facts f
JOIN ops.genskab_manuelle_noegler_20261003 s ON s.fact_id = f.id;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- TILBAGERULNING (kun hvis Jonas beder om den). Guardet på, at rækken STADIG er præcis det, trin 3 skrev
-- (en senere commit overskrives ikke). Forventet: «UPDATE 50». Bagefter: TRIN 4 giver genskabt 0, mangler 50.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- UPDATE public.financial_report_facts f
-- SET metrics = s.metrics_foer
-- FROM ops.genskab_manuelle_noegler_20261003 s
-- WHERE f.id = s.fact_id
--   AND f.metrics = s.metrics_foer || s.tilfoejet;
--
-- Snapshot-tabellen slettes først, når Jonas har set tallene i drift (DROP TABLE ops.genskab_manuelle_noegler_20261003;).
