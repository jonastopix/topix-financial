# Overlap-recon: korrektionsmaskineriet vs. aarsrapportNormalisering
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27, main + #440. Spørgsmålet: er evnen i
`supabase/functions/_shared/aarsrapportNormalisering.ts` allerede bygget i
det eksisterende canonical-maskineri? Kort svar: **delvist — kernen
(omkostninger positive, GP-afstemning) findes allerede; resultatlinje-dommen
og afvisningen som førsteklasses udfald gør ikke.** Detaljer og forbehold
nedenfor.

---

## 1. Hvor produceres korrektionsloggen?

Fil: `supabase/functions/_shared/canonicalEngine.ts`. Der er TO producenter,
én pr. spor:

**Legacy-sporet** — `normalizeToCanonical()`:

```
153:  const corrections: CorrectionLogEntry[] = [];
179:  function correct(field, raw, normalized, rule, reason, confidence = "HIGH") {
180:    corrections.push({ field, source: "key_figure", raw_value: raw, normalized_value: normalized, rule, reason, confidence });
181:  }
482:  return { metrics, correction_log: corrections };
```

**Semantisk spor** — `normalizeSemanticExtraction()`:

```
916:  const corrections: CorrectionLogEntry[] = [];
947:      corrections.push({
952:        rule: `${ruleType}_${action_applied}`,
```

Datastrukturen er `CorrectionLogEntry` (importeret fra `canonicalTypes.ts`,
linje 13): `{ field, source, raw_value, normalized_value, rule, reason,
confidence }`.

Loggen samles i `CanonicalOutput.correction_log`
(`buildCanonicalOutput`, linje 1361; semantisk via linje 1021/986) og
**gemmes på `financial_reports.normalized_data`** som hele canonical-objektet:

```
extract-financial-data/index.ts
1632:        // Phase 4: Full canonical output in normalized_data
1633:        normalized_data: canonical,
```

plus en bagudkompatibel kopi i `extracted_data.validation.corrections`
(index.ts:1347) og `canonical_checks` i `quality_signals` (index.ts:1641).
Debug-siden læser `norm.correction_log` (`ReportDebug.tsx:104, 317-333`) og
`provenance` (`ReportDebug.tsx:105, 345`).

Provenance bygges af `buildProvenance()` (canonicalEngine.ts:516-561,
key_figure-sporet) og beriget pr. `source_field_id` i det semantiske spor
(963-981), re-keyet til kanonisk nøgle i `buildCanonicalFromSemantic`
(1094-1095).

---

## 2. Hvilke regler findes?

**Hårdkodede i `normalizeToCanonical()`** (legacy, key_figures-input):

| Regel | Linje | Gør |
|---|---|---|
| `revenue_must_be_positive` | 199-203 | Math.abs på negativ omsætning — alle kilder |
| `expense_must_be_positive` (cogs-varianten) | 205-222 | Math.abs på negativ `direkte_omkostninger`, MEDMINDRE deterministisk contra-cost validerer (revenue − cogs = GP med signeret cogs) |
| `expense_must_be_positive` | 224-229 | Math.abs på `alwaysPositiveExpenseFields` = loenninger, marketing, lokaler, admin, tech_software, afskrivninger — alle kilder |
| `saldobalance_gross_profit_sign_inverted` | 231-240 | Vender negativt GP når magnitude matcher revenue − cogs; kun saldobalance + AI |
| `saldobalance_result_sign_inverted` | 242-262 | Vender resultat_foer_skat/efter_skat når fortegnet ikke matcher beregnet GP − opex; kun saldobalance + AI |
| `asset_must_be_positive` | 264-269 | Math.abs på aktiver |
| `liability_must_be_positive` | 271-276 | Math.abs på passiver |
| `saldobalance_equity_sign_inverted` | 278-284 | Kreditkonvention: negativ egenkapital → positiv; kun saldobalance + AI |
| `tech_software_merged_into_admin` / `tech_software_merge_skipped_double_count` | 300-365 | Afstemningsstyret fold af tech_software ind i admin_costs |
| `cash_balance_ytd_enforced` | 369-398 | Bank-linjens ÅTD-kolonne overstyrer key_figure; kun ikke-deterministisk |
| `balance_ytd_enforced` | 400-458 | Evidensgated ÅTD-håndhævelse for balanceposter; kun saldobalance + AI |

**Profilstyrede i det semantiske spor** (`normalizationProfiles.ts`, 7
profiler, linje 229-237): pr. `MetricFamily` (revenue_like, cost_like,
profit_like, …) vælges abs/negate/keep/conditional/reject, med
`field_overrides` pr. feltnavn. Korrektioner logges som
`family_default_abs`, `field_override_negate` osv. (canonicalEngine.ts:952)
samt `normalization_rejected` (938). Kanonisk lag tilføjer
`canonical_precedence` (1076), `canonical_derivation` (1114-1177) og
`family_safe_derivation` (1207).

**⚠ FUND — de betingede profilregler eksekveres ikke.** Profilerne
deklarerer `contra_cost_check` og `cross_validate_profit_direction`
(normalizationProfiles.ts:106, 133, 138), men `applyNormalizationRule`
anvender kun fallback-aktionen og evaluerer aldrig checket:

```
canonicalEngine.ts
870:    case "conditional":
871:      // For conditional rules, apply fallback action
```

Testene rører det ikke: `phase0_2_test.ts:262-267` asserterer kun at
override'et FINDES med action "conditional"; fixturens
`expected_normalized_value: -50000` shape-tjekkes alene (280-288). Den
ægte contra-cost-logik lever KUN i legacy-sporet (205-222).

---

## 3. Er fortegnsdetektionen kildeafhængig?

Ja, den interessante del er. Bindingerne sidder i to flag øverst i
`normalizeToCanonical()`:

```
150:  const reportType = extractedData?.report_type || "";
151:  const isSaldobalance = reportType.toLowerCase().includes("saldo");
152:  const isDeterministic = extractionMethod === "deterministic_template";
```

- **Kildeuafhængigt** (kører på alt der går gennem legacy-sporet):
  `revenue_must_be_positive`, `expense_must_be_positive` (inkl. de fem
  altid-positive omkostningsfelter), `asset/liability_must_be_positive`.
- **Bundet til saldobalance + AI** (`isSaldobalance && !isDeterministic`):
  ALLE tre fortegns-DETEKTIONER — gross_profit-vending (233),
  resultat-vending (243), egenkapital-vending (280) — samt
  `balance_ytd_enforced` (408). Et dokument hvis `report_type` ikke
  indeholder "saldo" får aldrig resultatlinjen efterprøvet.
- **Bundet til deterministisk routing**: hele det profilstyrede spor
  kræver en `SemanticExtractionResult` med `normalization_profile_id`,
  som kun templates producerer (`normalizeSemanticExtraction`, 909-913;
  routingen i extract-financial-data/index.ts:1320-1337 vælger sporet på
  `routingTrace.branch`/`extractionMethod`).

Så: mekanikken KAN køre på et ikke-saldobalance-dokument (funktionen tager
bare `extractedData` med `key_figures`), men resultatlinje-dommen — det
Alina-fejlen kræver — er tekst-matchet til ordet "saldo" i report_type og
til AI-sporet. Et kreditnegativt P&L-udkast som Alinas rammer ingen af
detektionerne; kun de ubetingede abs-regler.

---

## 4. Hvad producerer canonical_checks og ai_checks?

**canonical_checks**: `runExtendedValidation()`
(canonicalEngine.ts:564-773). 13 checks (headeren siger 12):
required_fields_present, numeric_values_only, gross_profit_sum (595-607,
tolerance 2 kr), ebitda_calculation, ebit_calculation, result_consistency
(639-649, kun statementType "pnl"), balance_equation, period_consistency,
mixed_period_columns_detected, suspicious_sign_pattern (688-699, >50 %
negative metrics), impossible_margin_check (701-720, med
contra-cost-undtagelse), missing_core_totals, cost_lines_present (739-757
— samme idé som min `omkostninger_ikke_udtrukket`).

Genbrugelighed: signaturen er `(extractedData, metrics, periodBasis,
statementType, aiChecks)`. Den er i praksis metrics-drevet; extractedData
bruges kun til `key_figures` for period_consistency (573, 668) og tåler
tomt objekt (semantisk spor kalder den med `{ key_figures: {} }`, linje
1239). **Ja — genbrugelig uafhængigt af kildetype**, med to forbehold:
tolerancen er 2 kr absolut (38: `const TOLERANCE = 2`), og flere checks
skifter adfærd på `statementType`.

**ai_checks**: ikke en motor — en videreførelse af udtrækkets egen
selvvalidering. Legacy: mappet fra `extractedData.validation.checks`
(1321-1325) plus `deterministic_parser_status` (1328-1334). Semantisk:
fra `semantic.parser_validation.checks` (1229-1238). Genbrugelig kun hvis
kilden overhovedet HAR en selvvalidering — extract-annual-report har ingen.

---

## 5. Hvad gør min motor som maskineriet ikke gør — og omvendt?

**aarsrapportNormalisering gør, som maskineriet IKKE gør:**

1. **Dømmer resultatlinjens polaritet ved symmetrisk lukning.** Maskineriets
   eneste resultat-vending (`saldobalance_result_sign_inverted`, 242-262)
   er (a) gated til saldobalance+AI, (b) fortegns-match uden tolerance-dom
   (`(value > 0) === (expectedResult > 0)`), (c) kræver absGP > 0. Min
   motor lukker regnestykket begge veje med skaleret tolerance og skærpet
   vendings-bevis — og virker på et P&L-dokument som Alinas.
2. **Afviser som førsteklasses udfald.** Maskineriet returnerer ALTID
   metrics; fejl bliver FAIL-flag i validation/quality_signals som
   kalderen kan (og i årsrapport-vejen: ville skulle bygges til at)
   reagere på. Min motor returnerer `{ ok: false, grund }` med fire
   maskinlæsbare grunde der matcher klasse-taksonomien i designdokumentet.
3. **Nul-som-manglende.** `revenue === 0 → null` med note findes ingen
   steder i maskineriet (YKRG-fejlen ville passere igen).
4. **Ingen kilde-routing påkrævet.** Ren funktion på ni tal; maskineriet
   kræver `extractedData`-formen (key_figures + report_type) eller en
   template-produceret SemanticExtractionResult.

**Maskineriet gør, som min motor IKKE gør:**

1. Korrektionslog + provenance pr. felt, persisteret og vist i debug-UI.
   Min motor har kun `noter: string[]` — ingen felt-for-felt-spor af hvad
   der blev vendt.
2. Kildespecifikke konventioner (7 profiler: kredit/business,
   saldobalance/pnl/combined) og line_items-evidens (ÅTD-håndhævelse,
   tech_software-fold, bank-linje).
3. 13 valideringschecks, ai_eligible-dommen, afledninger (ebitda, ebit,
   gross_margin_pct, equity_ratio_pct), statement-type- og
   periode-basis-detektion.
4. Balancesiden overhovedet: min motor rører ikke cash/equity ud over
   gennemskrivning.

**Overlappet, udiplomatisk:** min regel 1 (abs på omkostninger) ER
`expense_must_be_positive`, og min invariant 1 ER `gross_profit_sum` med
en anden tolerance; `omkostninger_ikke_udtrukket` er `cost_lines_present`
omdøbt til en afvisningsgrund. Cirka halvdelen af motoren genopfinder
altså eksisterende evner i mindre format. Den anden halvdel —
polaritetsdommen uden saldobalance-binding, afvisningen og
nul-håndteringen — findes ikke i maskineriet, og det var netop de tre der
manglede i Alina/YKRG-fejlene. Motoren er ikke overflødig, men den er
heller ikke ny evne fra bunden: den er en genindpakning plus tre ægte
tilføjelser. Var resultat-vendingens saldobalance-gate i stedet blevet
generaliseret og forsynet med en afvisningsvej, havde maskineriet kunnet
bære det hele — det ville til gengæld røre kode som ti profiler/tests
låser fast.

---

## 6. Kan extract-annual-report rutes gennem maskineriet?

Ingen af forhindringerne er uoverstigelige, men de er reelle:

1. **Feltnavnene matcher ikke.** Årsrapport-udtrækket bruger
   `nettoomsaetning`, `personaleomkostninger`,
   `andre_eksterne_omkostninger`, `bruttoresultat`, `aarsresultat`
   (extract-annual-report/index.ts:134-147). `KF_TO_CANONICAL`
   (canonicalEngine.ts:41-73) kender `omsaetning`, `loenninger`, `admin`/
   `administrationsomkostninger`, `daekningsbidrag`, `arets_resultat`.
   Fem af ni felter ville blive droppet TAVST (194: `if (!canonicalField)
   continue`). Kræver enten omdøbning i tool-skemaet eller et
   oversættelseslag.
2. **Resultatlinje-dommen ville ikke fyre.** Detektionerne er gated på
   `report_type.includes("saldo")` + `!isDeterministic` (151-152, 233,
   243, 280). En årsrapport/et P&L-udkast får kun abs-reglerne — Alina
   ville stadig ende som underskud. Gaten skulle generaliseres, dvs.
   ændring i det fredede maskineri.
3. **Tolerancen passer ikke.** `TOLERANCE = 2` kr (38) er bygget til
   interne sammentællinger i samme dokument. Årsrapport-vejens /12-
   afrundede månedstal (monthly() = Math.round(val/12)) driver op til
   flere kroner pr. felt; gross_profit_sum ville FAIL'e på afrunding
   alene, medmindre motoren kører på ÅRSTAL før division — hvilket ville
   kræve omlægning af rækkefølgen i extract-annual-report (i dag
   divideres FØR metrics bygges, index.ts:207-217).
4. **Ingen validering/gate-plumbing i årsrapport-vejen.** Funktionen
   sætter hverken `validation_status`, `extraction_method` eller
   `quality_signals`, og gemmer flade metrics i `normalized_data`
   (index.ts:310), ikke et CanonicalOutput. At adoptere maskineriet er
   også at adoptere dets kontrakt: debug-siden og paritetsvalidatorerne
   forventer canonical-formen under `normalized_data.metrics`, mens
   årsrapporter i dag gemmer fladt (jf. designdokumentet §6).
5. **Det semantiske/profilstyrede spor er lukket land.** Det kræver en
   deterministisk template med `normalization_profile_id`
   (canonicalEngine.ts:909-913) — en AI-udtrukket årsrapport har ingen
   template, så kun legacy-sporet er tilgængeligt.
6. **Facts-fanout forbliver årsvejens egen.** /12-fordeling, beskyttede
   måneder og delete+upsert (index.ts:233-288) findes ikke i maskineriet;
   det slutter ved rapport-rækken.

Realistisk mellemvej, som fund: kør `runExtendedValidation()` (som ER
genbrugelig) på årsrapportens metrics som port, og lad
`aarsrapportNormalisering` levere polaritetsdommen og afvisningen —
frem for enten at genopfinde checkene eller at åbne saldobalance-gaten i
det test-låste maskineri.
