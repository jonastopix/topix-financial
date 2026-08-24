# Recon: scenarie-sporet — hvad optimistisk/pessimistisk bygges af i dag

Rå observationer med fil- og linjereferencer. Ingen konklusioner, ingen forslag.
Dato: 2026-08-24. Baggrund: generate-budget-scenarios skalerer på gruppe alene,
og gruppen er for grov (Shopify-abonnement vs. bogholderi under Drift;
vareforbrug vs. B2B-provision under Variable).

---

## 1. Edge-funktionen (supabase/functions/generate-budget-scenarios/index.ts, 214 linjer)

Struktur, fil-orden:
- CORS + OPTIONS (:4-13).
- Auth: Bearer-JWT valideret med authClient.auth.getClaims (:16-35) — Bucket A-form.
- Input: `{ baseRows, scenario }`; scenario ∈ optimistisk|pessimistisk (:40-44).
- Prompt (:57-77): baseSummary = én linje pr. række:
  `${key} — ${label} (${group}): [${values.join(", ")}]` (prompt-hærdet så
  modellen ser de rigtige keys, BACKLOG [P3] løst). Systemprompten, ordret:
  regel 1-2 (indtægter ±10-25 %, variable ∓5-15 %, faste fastholdt/let),
  3 (bevar sæsonmønstre), 4 (varieret, ikke flad procent), 5 (personale
  2-5 %), 6 (returnér keys ordret), 7 (hele tal), 8 (alle tal ≠ base).
- Model/gateway: `google/gemini-2.5-flash` via `ai.gateway.lovable.dev`
  (:88-95), tool-forced `generate_scenario` med `key: enum baseKeys` og
  `monthly` (12 tal) + `reasoning` (:105-140).
- Fejlveje: 429/402 → pass-through-fejl (:145-156); intet tool-call → throw;
  2 forsøg (MAX_ATTEMPTS, :79) med to retry-grunde: nul matchende keys
  (:168-176, hærdet validering) og identiske værdier (:179-187); ellers
  `throw lastError` → 500 (:205-212).
- Logging: KUN console.log/warn (forsøg, matched/changed-statistik :190-198)
  — ingen database-skrivning.

## 2. Hvad modellen får at vide

Pr. linje: key, label, gruppe og **alle 12 månedsværdier** (baseSummary —
sæsonmønstret ER med, jf. regel 3). Derudover: INTET. Ingen branche
(companies.industry_label medsendes ikke), ingen størrelse, ingen historik,
ingen realiserede tal, intet årstal, ingen skabelon-kontekst, ingen hints.
Payloaden bygges i generateAIScenario (budgetEngine.ts:684-688):
`{ key, label, group, values }` pr. række — kun base-scenariet.

## 3. Hvad der sker med svaret

Klientside i generateAIScenario (budgetEngine.ts:~695-745):
- Svar-kategorier valideres: key skal være string, monthly PRÆCIS 12 endelige
  tal (falsy-værnet) — ellers droppes kategorien stille.
- Match på NORMALISERET nøgle (normalizeBudgetKey: lowercase, æøå→ascii,
  specialtegn→_) mod både r.key og r.label (U3-værnet mod stille base-kopi).
- Manglende nøgler: linjen beholder sine base-værdier uændret (`return
  { ...r, values: [...r.values] }`) — ingen markering af hvilke der ikke
  blev justeret ud over tælleren.
- Ekstra nøgler (ikke i base): ignoreres (aiByNormKey slås kun op fra
  base-rækkernes side; serversiden enum-begrænser også key til baseKeys).
- Nul match: kastes FØR skrivning ("AI-forslaget matchede ikke …").
- **Skrives DIREKTE**: replaceScenarioValues (delete+insert for scenariet)
  kaldes før retur — medlemmet ser IKKE forslaget først. UI'et
  (HbBudgetEditTable:182-205) opdaterer state, skifter til scenarie-tabben
  og kvitterer "Forslag klar — X af Y linjer justeret · {reasoning}".
  Fortryd findes ikke (nærmeste er "Kopiér base").

## 4. Forecast-motoren

deriveGrowthFactor (budgetEngine.ts): gns. aktual ÷ gns. budget over
aktual-månederne, capped [0.1, 3]; uden aktualer = 1. Bruges KUN i
HbBudgetSimulator (:95-115): forecastRevenue/forecastCosts = aktuals for
forløbne måneder + budget×faktor for resten; én faktor for omsætning
(kf.omsaetning) og én for totalomkostninger (fem KF-buckets, :78-82) — IKKE
pr. gruppe og IKKE pr. linje. Deler INTET med scenarierne: forecasten
læser facts + base-budgettet og skriver aldrig; scenarierne læser aldrig
facts. To adskilte verdener.

## 5. Sim-events

Model (budgetEngine.ts:53-60): `SimEvent = { id, type:
"hire"|"marketing"|"rent"|"software"|"custom", label, monthlyCost,
startMonth 0-11, isRevenue }`. Presets (HbBudgetSimulator:16-28) med
default-beløb og hints; "Fordobl marketing" beregner beløbet af
salg_marketing-rækkernes gennemsnit (:361). Persistering (W7):
`__sim_event__{år}_{idx}`-markørrækker med JSON i period-kolonnen;
debounced fuld delete+insert pr. (company, år); ulæselig JSON ignoreres.
Effekt (:139-167): annualImpact = monthlyCost × (12 − startMonth), lagt
oven på forecasten som extraRevenue/extraCosts — flad, ingen kobling til
linjer eller grupper (bortset fra marketing-presettets beløbsberegning).
**"Adfærdstype"-observation**: `type` + `isRevenue` på EVENTS er det
nærmeste kodebasen kommer en adfærdsklassifikation — men den sidder på
simulator-events, ikke på budgetlinjer.

## 6. Hvad vi ved om linjerne

Pr. budgetlinje findes: key, label, values, isEditable, group — og for
skabelon-kategorier `hint` (budgetTemplates.ts:12, fri tooltip-tekst, fx
"Stripe, MobilePay, kortgebyrer (typisk 1,5–3%)" — beskrivende, aldrig
maskinlæst). Import-laget kender derudover sektion, bemærkning og kommentar
(GitterRaekke), men intet af det når budget_targets. **Der findes INTET
felt eller udledning der siger hvad en linje afhænger af** (omsætning, tid,
beslutning) — gruppen er den eneste klassifikation, og den bærer allerede
tre betydninger: placering, sammenligningsfelt (GROUP_TO_REPORT_FIELD) og
skaleringsregel i scenarie-prompten.

## 7. Historikken — realiserede tal pr. gruppe pr. måned

Kæden: financial_report_facts.metrics (canonical EN-nøgler, én jsonb pr.
(company, period_key), UNIQUE) → de seks gruppe-felter via spor3-tabellen
(gruppe→rapportfelt→canonical): indtaegter=revenue, variable=cogs,
personale=payroll, salg_marketing=sales_costs, faste=facility_costs,
drift=admin_costs. Klientside: useCompanyFacts → factsToDanishMetrics.

Kendte prod-tal (tidligere målinger 2026-08-23/24): 186 processed
rapporter; 24 fulde medlemmer / 34 virksomheder; 11 af 34 med tal nyere
end 60 dage. Facts-dækningen pr. virksomhed er ikke målt pr. gruppe —
SQL'en herunder giver tidsserien og dækningen:

```sql
-- Tidsserie pr. gruppe pr. måned pr. virksomhed
SELECT company_id, period_key,
  (metrics->>'revenue')::numeric        AS indtaegter,
  (metrics->>'cogs')::numeric           AS variable,
  (metrics->>'payroll')::numeric        AS personale,
  (metrics->>'sales_costs')::numeric    AS salg_marketing,
  (metrics->>'facility_costs')::numeric AS faste,
  (metrics->>'admin_costs')::numeric    AS drift
FROM financial_report_facts
ORDER BY company_id, period_key;

-- Dækning: måneder pr. virksomhed, og hvor mange af de seks felter der er sat
SELECT company_id,
  COUNT(*)                                   AS maaneder,
  MIN(period_key)                            AS foerste,
  MAX(period_key)                            AS seneste,
  AVG((metrics ? 'revenue')::int + (metrics ? 'cogs')::int + (metrics ? 'payroll')::int
    + (metrics ? 'sales_costs')::int + (metrics ? 'facility_costs')::int
    + (metrics ? 'admin_costs')::int)        AS gruppefelter_af_6_gns
FROM financial_report_facts
GROUP BY company_id
ORDER BY maaneder DESC;
```

## 8. Måling

```sql
-- Scenarie-udfyldning og afvigelse fra base (samme som gruppevalg-recon §9)
WITH vaerdier AS (
  SELECT company_id, split_part(period, '-', 2) AS scenarie,
         SUM(ABS(budget_amount)) AS sum_abs, COUNT(*) AS raekker
  FROM budget_targets
  WHERE category NOT LIKE '\_\_%' ESCAPE '\'
    AND period ~ '^\d{4}-(base|optimistisk|pessimistisk)-\d+$'
  GROUP BY 1, 2
)
SELECT scenarie,
  COUNT(DISTINCT company_id)                            AS virksomheder,
  COUNT(DISTINCT company_id) FILTER (WHERE sum_abs > 0) AS med_tal,
  COUNT(DISTINCT v.company_id) FILTER (
    WHERE v.scenarie != 'base' AND b.sum_abs IS NOT NULL AND v.sum_abs != b.sum_abs
  ) AS afviger_fra_base
FROM vaerdier v
LEFT JOIN vaerdier b ON b.company_id = v.company_id AND b.scenarie = 'base'
GROUP BY scenarie ORDER BY scenarie;
```

Kald-tælling for generate-budget-scenarios: **der findes INGEN
DB-logging** — funktionen logger kun console.log (forsøg + matched/changed-
statistik, index.ts:83, :190-198), som lander i Supabase/Lovables
edge-function-logs (dashboard → Edge functions → logs; ikke nåbare fra SQL
editor). Ingen tabel i skemaet registrerer invokationer (sweep: eneste
kaldested er budgetEngine.ts:687; ingen *_log-tabel refererer funktionen).
Nærmeste indirekte mål i SQL: virksomheder hvor optimistisk/pessimistisk
findes OG afviger fra base celle-for-celle (W3 'Kopiér base' giver identisk;
W4 giver afvigende) — anden query i gruppevalg-recon §9 skelner dem.
