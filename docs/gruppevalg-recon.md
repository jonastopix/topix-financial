# Recon: gruppevalgets synlighed + scenariernes tilblivelse

Rå observationer med fil- og linjereferencer. Ingen konklusioner.
Dato: 2026-08-24. Baggrund: importeret budget hvor linjegættet lagde 116.340 kr.
marketing i forkert gruppe — gruppen afgør både placering OG sammenligning
(GROUP_TO_REPORT_FIELD, spor3-design §2), uden at fladen siger det.

---

## DEL A — HVOR TRÆFFES OG VISES GRUPPEVALGET

### 1. Alle steder et medlem kan se eller ændre en linjes gruppe

| # | Sted | Kan ændres? | Hvordan det ser ud | Forklaring i fladen |
|---|---|---|---|---|
| 1 | HbImportGitter — sektionsvælger (:184-224) | JA (pr. sektion) | `<select>` i sektionsoverskriften: "SEKTIONSNAVN → [Driftsomkostninger ▾]", 11px, hb-surface | INGEN — kun aria-label "Budgetgruppe for …". Intet om hvad valget betyder |
| 2 | HbImportGitter — linjevælger (:265-289) | JA (pr. linje) | lille select UNDER etiketten, 10px, "stille metadata" (ingen ramme før hover) | INGEN — aria-label "Gruppe for …". Kode-kommentaren (:254-264) forklarer designet til UDVIKLEREN, intet til medlemmet |
| 3 | HbImportGitter — "Vi genkendte din opbygning"-kortet (:390-420 ca.) | nej | tekst om sektioner/subtotaler | forklarer subtotal-fravalg, IKKE gruppens rolle |
| 4 | HbBudgetEditTable — gruppeoverskrifter (:83-86, :440 ff.) | NEJ | GROUP_LABELS som rækkeoverskrifter (bg-hb-sage) | ingen — ren visning |
| 5 | HbBudgetEditTable — "Tilføj linje" pr. gruppe (:570-612) | indirekte (ny linje ARVER gruppens nøgle; eksisterende linjes gruppe kan IKKE ændres her) | "+ Tilføj linje" under hver gruppe | ingen |
| 6 | HbBudgetBva — grupperækker + "x % af gruppen" (spor 3) | nej | sammenligningen PR. gruppe | fodnoten (:398-401-omegn) forklarer at regnskabet bærer ét tal pr. gruppe — men IKKE at gruppevalget i importen styrede det |
| 7 | HbBudgetImport — skriveplan-preview ("Det her skrives til budget …", :374-418) | nej | linjeantal, fordelinger, sprungne kolonner | plan.grupper RENDERES IKKE (verificeret i spor3-recon §4/§8) — previewet viser INTET om grupper |
| 8 | BudgetteringView — costByGroup (:141-150) | nej | omkostningsfordeling pr. gruppe | ingen |

Observation på tværs: gruppen kan kun ÆNDRES i importgitteret (sted 1-2).
Efter godkendelse findes ingen flade hvor en linjes gruppe kan flyttes —
decodeBudgetRows læser __group__-markøren, og redigeringstabellen viser kun
grupperne som overskrifter. En forkert gruppe fra importen kan altså kun
rettes ved at genimportere.

### 2. Importgitterets vælgere — rå JSX og tekster

Sektionsvælgeren (HbImportGitter.tsx:181-224, uddrag):

```tsx
{/* Sektionsoverskrift MED gruppevælger — valget er en del af
    overskriften, aldrig et skjult felt. ... */}
<span>{gruppe.sektion ?? "Linjer uden sektion"}</span>
<span className="normal-case tracking-normal">→</span>
<select value={erSektionUdeladt(...) ? IKKE_BUDGET_SENTINEL : (gitter.sektionsGrupper[...] ?? gruppeForslag(...))} ...
  aria-label={`Budgetgruppe for ${gruppe.sektion ?? "linjer uden sektion"}`}>
  {GROUP_ORDER.map(...)}<option .../>
  <option value={IKKE_BUDGET_SENTINEL}>Ikke et budgetbeløb</option>
</select>
```

Linjevælgeren (:265-289): select under etiketten, `text-[10px] text-hb-ink-soft`,
viser `raekkeGruppe(gitter, raekke)` (= linjegættet eller sektionens valg) —
**der er ingen visuel forskel på "motoren gættede" og "medlemmet valgte"**, og
ingen tekst i fladen omkring nogen af vælgerne. De omgivende tekster er:
overskriften "Gennemse dine linjer", tællerlinjen ("x medtaget · y fravalgt …")
og fodnoten "Alle beløb i kr. Fravalgte linjer importeres ikke." (:315-320) —
ingen af dem nævner gruppen.

### 3. Redigeringstabellen (HbBudgetEditTable)

Ingen gruppevælger findes: grep efter saetSektionsgruppe/saetRaekkegruppe/
select i filen giver kun GROUP_LABELS-importen (:4) og gruppeoverskrifterne
(:83-86). "Tilføj linje"-flowet (:570-612) opretter en ny kategori I gruppens
sektion (handleAddCategory(group.group)) — gruppen arves og kan ikke vælges.
Eksisterende linjers gruppe er låst til __group__-markøren/skabelonen.

### 4. Står der NOGEN steder at gruppen afgør sammenligningen?

Sweep af al medlemsvendt tekst i src/components/hjemmebane/budget/ efter
sammenlign/realiseret/rapportfelt/regnskab:

- BudgetteringView.tsx:285-286 (tom-tilstanden): "Tallene sammenlignes
  automatisk med dine rapporter under Budget vs. realiseret." — nævner IKKE
  gruppen.
- HbBudgetBva.tsx fodnote: "Regnskabet bærer ét realiseret tal pr. gruppe
  pr. måned, så de enkelte linjer viser kun budgettet og deres andel af
  gruppen." — forklarer granulariteten, IKKE at gruppevalget i importen er
  det der kobler.
- HbBudgetBva.tsx:236: "Budgettet er ikke udfyldt endnu — udfyld det under
  Scenarier, så sammenligner vi …" — intet om gruppen.
- Alle øvrige fund er KODE-kommentarer (HbBudgetBva.tsx:23-31 forklarer
  gruppe→rapportfelt — til udvikleren, ikke medlemmet).

**Svar: NEJ.** Intet medlemsvendt sted kobler gruppevalget til
sammenligningen. Import-vejledningen (visVejledning-boksen i HbBudgetImport)
er det nærmeste: "Behold de seks sektioner — de afgør hvor linjerne havner,
og hvad de sammenlignes med når dit regnskab kommer ind" — men den handler
om SKABELONENS sektioner og vises kun i skabelon-vejledningen, ikke ved
gitterets vælgere.

---

## DEL B — SCENARIERNE

### 5. Hvordan optimistisk/pessimistisk bygges i dag

Definition: SCENARIOS (src/components/budget/types.ts) — base ("Dit reelle
budget – udgangspunktet"), optimistisk ("Hvad hvis alt går bedre end
forventet?"), pessimistisk ("Worst case – hvad kan du tåle?").

Skriveveje der producerer scenarie-rækker (period = "{år}-{scenarie}-{måned}"):
- W2 saveScenarioEdits (budgetEngine) — redigeringstabellens Gem, skriver KUN
  det aktive scenarie (activeScenario-tab i HbBudgetEditTable:68-70).
- W3 copyBaseToScenario — "Kopiér base"-knappen (HbBudgetEditTable:405-408):
  1:1-kopi af base ind i tabben.
- W4 generateAIScenario — "Foreslå scenarie"-knappen (:397-404): se §6.
- W5 confirmBudgetImport skriver SAMME tal i alle tre scenarier
  (budgetEngine: flatMap over ["base","optimistisk","pessimistisk"]) — men
  W5 HAR INGEN FLADE-KALDERE længere (grep: kun budgetEngine + tests).
- W8 confirmImportFraSkriveplan (import-gitteret) skriver KUN base — bevidst
  ("et importeret budget er ét budget; optimistisk/pessimistisk laver
  medlemmet bagefter").

Medlemmet ser: tre tabs i HbBudgetEditTable; på ikke-base-tabs de to knapper
plus teksten "Vi foreslår et optimistisk/pessimistisk-budget ud fra dit
base-budget — hver linje justeres og kan rettes bagefter." (:412-417).

### 6. Findes en afledning fra base — og bruger den gruppen?

JA: generateAIScenario (W4) → edge-funktionen generate-budget-scenarios.
Payloaden medsender gruppen pr. linje (budgetEngine: {key, label, group,
values}), og prompten (index.ts:55-73) viser den til modellen
("${r.key} — ${r.label} (${r.group}): […]") og styrer skaleringen på
GRUPPE-semantik:

  1. OPTIMISTISK: indtægter +10-25 %, variable omkostninger −5-15 %,
     faste fastholdes/let ned.
  2. PESSIMISTISK: indtægter −10-25 %, variable +5-15 %, faste
     fastholdes/let op.
  5. Personaleomkostninger ±2-5 %.

Afledningen er altså LLM-baseret (google/gemini via Lovable-gateway, 2
forsøg, U3-normaliseret key-match) — der findes INGEN deterministisk
gruppe-baseret skalering i koden. En forkert gruppe giver forkert skalering
her også (marketing i forkert gruppe skaleres efter den forkerte regel).

### 7. HbBudgetSimulator

En ANDEN ting end scenarier: hvad-hvis-sektionen ("Simulér", design-blok
§c7). Forecast (deriveGrowthFactor: aktual/budget-faktor, capped [0.1,3])
plus sim-EVENTS med presets ("Ansæt én medarbejder" 40.000, "Fordobl
marketing" — beregnes af salg_marketing-gruppens rækker (:361),
"Flyt til større lokaler", "Nyt softwareabonnement", "Brugerdefineret").
Events persisteres som __sim_event__-markørrækker (W7), IKKE som
scenarie-værdier. Rører aldrig optimistisk/pessimistisk.

### 8. "Kom i gang på 5 minutter"

HbBudgetEditTable:334-378: kort der vises når totalOmsaetning === 0.
"Indtast tre årstal — vi fordeler dem på 12 måneder": Omsætningsmål (kr/år),
Lønbudget (kr/år), Øvrige omkostninger (kr/år) → applyQuickstartRows
(budgetEngine): omsætning/12 i alle indtaegter-rækker; løn/12 i
loenninger/personale-rækkerne; (omkostninger−løn)/12 fordelt LIGELIGT over
øvrige redigerbare omkostningsrækker. Skriver i det AKTIVE scenarie (via
setScenarioData → Gem). Flad fordeling, ingen sæson.

### 9. Måling — SELECT til Lovable SQL editor

```sql
-- Virksomheder med udfyldte scenarier, og om tallene afviger fra base.
WITH vaerdier AS (
  SELECT company_id,
         split_part(period, '-', 2) AS scenarie,
         split_part(period, '-', 1) AS aar,
         category,
         split_part(period, '-', 3) AS maaned,
         budget_amount
  FROM budget_targets
  WHERE category NOT LIKE '\_\_%' ESCAPE '\'
    AND period ~ '^\d{4}-(base|optimistisk|pessimistisk)-\d+$'
),
pr_scenarie AS (
  SELECT company_id, scenarie,
         COUNT(*) AS raekker,
         SUM(ABS(budget_amount)) AS sum_abs
  FROM vaerdier GROUP BY 1, 2
)
SELECT
  scenarie,
  COUNT(DISTINCT company_id)                                   AS virksomheder,
  COUNT(DISTINCT company_id) FILTER (WHERE sum_abs > 0)        AS med_tal,
  -- afviger scenariet fra base? (join på samme virksomhed)
  COUNT(DISTINCT p.company_id) FILTER (
    WHERE p.scenarie != 'base' AND b.sum_abs IS NOT NULL
      AND p.sum_abs != b.sum_abs
  ) AS afviger_fra_base
FROM pr_scenarie p
LEFT JOIN pr_scenarie b
  ON b.company_id = p.company_id AND b.scenarie = 'base'
GROUP BY scenarie
ORDER BY scenarie;

-- Finkornet: pr. virksomhed, er optimistisk/pessimistisk identisk med base
-- celle for celle? (identisk = W5-mønstret 'samme tal i alle tre')
SELECT v.company_id,
  BOOL_AND(o.budget_amount IS NOT DISTINCT FROM v.budget_amount) AS optimistisk_identisk,
  BOOL_AND(pe.budget_amount IS NOT DISTINCT FROM v.budget_amount) AS pessimistisk_identisk
FROM vaerdier v
LEFT JOIN vaerdier o  ON o.company_id = v.company_id AND o.scenarie = 'optimistisk'
  AND o.aar = v.aar AND o.category = v.category AND o.maaned = v.maaned
LEFT JOIN vaerdier pe ON pe.company_id = v.company_id AND pe.scenarie = 'pessimistisk'
  AND pe.aar = v.aar AND pe.category = v.category AND pe.maaned = v.maaned
WHERE v.scenarie = 'base'
GROUP BY v.company_id
ORDER BY v.company_id;
```

(NB: anden query kræver CTE'en fra første — kør dem samlet, eller gentag
WITH-blokken.)
