# Recon: kobl aarsrapportNormalisering på extract-annual-report
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27. Linjenumre fra branch `feat/spoerg-om-omsaetning`
(c021a9ac, PR #442) — den nyeste tilstand af begge filer. Mål: motoren skal
se tallene FØR skrivning, og en rapport der ikke lukker skal AFVISES uden
at der skrives facts.

---

## 1. Rækkefølgen i extract-annual-report/index.ts

| Trin | Linjer | Hvad |
|---|---|---|
| AI-svar parses | 176-184 | `extracted = JSON.parse(toolCall.function.arguments)` — **årstallene kommer ind her**, i `extracted` (nettoomsaetning, bruttoresultat, …) |
| Revenue-fallback | 187-207 | 0/null → afled fra bruttoresultat (+ evt. cogs); muterer `extracted.nettoomsaetning`; sætter `revenueStatus` |
| **Division med 12** | 210 | `const monthly = (val) => val != null ? Math.round(val / 12) : null` |
| baseMetrics bygges | 212-220 | `monthly(...)` pr. felt — herfra er tallene MÅNEDSTAL |
| metrics filtreres | 222-227 | null droppes; cash/equity tilføjes udelt |
| no_metrics-gate | 229-234 | tomt metrics → `failReport` + 422 (eneste eksisterende afvisning efter udtræk) |
| STEP 4: beskyttede måneder | 236-247 | læs eksisterende facts for året |
| STEP 5: **DELETE** | 249-255 | slet årets annual/baseline-facts |
| STEP 6: **UPSERT** | 257-291 | byg og indsæt op til 12 rækker |
| STEP 7: rapport-række | 295-316 | status "processed", extracted_data + success_log, normalized_data (flad), report_period |
| Svar | 320-322 | ok, inserted, protected_count, year, revenue_status, extracted |

Bemærk også STEP 0 FØR alt dette (66-86): auto-soft-delete af tidligere
FEJLEDE årsrapporter for samme år — en skrivning der allerede er sket når
motoren ville køre.

## 2. Hvor indsættes motoren så den ser ÅRSTALLENE?

**Mellem linje 207 og 210** — efter revenue-fallbacket, før `monthly`
overhovedet defineres. Dér bærer `extracted` årstallene under
dokumentnavnene:

- `extracted.nettoomsaetning` (evt. netop afledt, `revenueStatus` fortæller
  hvordan), `extracted.bruttoresultat`, `extracted.personaleomkostninger`,
  `extracted.direkte_omkostninger`, `extracted.afskrivninger`,
  `extracted.andre_eksterne_omkostninger`, `extracted.resultat_foer_skat`,
  `extracted.likvider`, `extracted.egenkapital`.

Motoren kaldes på disse, og VED ok erstattes fortegns-rå værdier med
`vaerdier` før baseMetrics — dvs. baseMetrics (212-220) skal bygges af
motorens output i stedet for af `extracted` direkte. `monthly()` består
uændret; kun inputtet skifter. Det opfylder §12-beslutningen
("normaliseringen skal køre på årstallene før divisionen") og løser
2-kroners/afrundings-problemet, fordi motorens 5 %/500-tolerancer dømmer
årstal.

En detalje: motorens regel 2 (revenue 0 → null) og funktionens nye
`manglerOmsaetning`-brug (193, 213) overlapper nu — efter koblingen bør
funktionens egen 0-håndtering i baseMetrics afløses af motorens
`vaerdier.revenue`, så dommen ikke står to steder.

## 3. Findes feltnavne-mappingen?

**Nej — den skal skrives, og der er en fælde at undgå.** Målt:

- `KF_TO_CANONICAL` (canonicalEngine.ts:41-73) kender `omsaetning`,
  `loenninger`, `daekningsbidrag`, `admin` — IKKE `nettoomsaetning`,
  `personaleomkostninger`, `bruttoresultat`, `andre_eksterne_omkostninger`.
  Genbrug ville droppe felterne tavst (§12-beslutningen siger allerede
  nej til den vej).
- `SEMANTIC_TO_CANONICAL` (canonicalEngine.ts:811-850) — samme historie.
- `DANISH_TO_CANONICAL` i validate-facts-parity (101-115) og
  manual-commit-RPC'ens CASE (migration 20260722130000:90-100) mapper
  UI-nøglerne (loenninger …), ikke årsrapport-skemaets navne.

Årsrapport-skemaets syv navne findes kun ét sted: i tool-skemaet selv
(131-149). Mappingen er triviel (7 linjer) og hører hjemme i
extract-annual-report ved motor-kaldet:

```
nettoomsaetning → revenue · bruttoresultat → gross_profit ·
personaleomkostninger → payroll · direkte_omkostninger → cogs ·
afskrivninger → depreciation · andre_eksterne_omkostninger → admin_costs ·
resultat_foer_skat → ebt · likvider → cash · egenkapital → equity
```

(Motorens input-interface har allerede præcis disse engelske felter,
inkl. cash og equity som gennemskrives urørt.)

## 4. Beskyttede måneder og delete+upsert — og afbrydelse før skrivning

Koden (236-291), forkortet til de bærende linjer:

```ts
243:  const protectedPeriods = new Set(
245:      .filter((f: any) => !["annual_report", "manual_baseline", "baseline"].includes(f.source_type))
249:  // ── STEP 5: Delete old annual + baseline facts for this year ──
250:  await adminClient
252:    .delete()
254:    .in("source_type", ["annual_report", "manual_baseline", "baseline"])
255:    .like("period_key", `${year}-%`);
262:    if (protectedPeriods.has(periodKey)) continue;
271:      data_basis: "estimated",
281:      .upsert(rows, { onConflict: "company_id,period_key,source_type" });
```

**Afbrydes FØR STEP 5, er funktionens egne fact-skrivninger nul** —
DELETE og UPSERT er de eneste facts-operationer, og de ligger begge efter
det foreslåede motor-punkt. Men tre ting ER allerede sket på det
tidspunkt og skal håndteres:

1. **Klientens dedup-soft-delete** (RapporteringView:914-919): den
   EKSISTERENDE årsrapport for året soft-deletes FØR upload — og
   triggeren `cleanup_facts_on_report_delete` (SECURITY DEFINER) har
   allerede slettet dens 12 faktarækker. En afvisning efterlader året
   TOMT, ikke uændret. Det er dagens adfærd også ved fejl, men en motor
   der afviser oftere gør hullet hyppigere. Vil man kunne afvise uden
   tab, skal dedup'en flyttes til efter succes (eller gendannes ved
   afvisning).
2. **Storage-filen** (klient, RapporteringView:921-922): ligger der
   allerede. Harmløs — "Se original fil" peger på den via rapport-rækken.
3. **Rapport-rækken** (klient-INSERT, status "processing") og STEP 0's
   auto-oprydning af gamle fejl-rapporter (66-86). Rækken SKAL markeres
   (fejl/afvist) ved afbrydelse — ellers hænger den i "processing" for
   evigt. `failReport` (46-61) gør præcis det og er mønstret at genbruge.

## 5. Hvordan markeres fejl i dag — og månedsvejens forbillede

Årsvejen: `failReport(step, message, extra)` (46-61) sætter
`status: "error"` og `extracted_data: { error_log: { step, message, at } }`.
Fladen viser så "Kunne ikke behandles" på årsrapport-rækken
(RapporteringView:1068) og klientens catch toaster "Upload fejlede" med
funktionens fejlbesked (968). STEP 0 rydder automatisk gamle
error-rapporter ved næste upload af samme år (66-86) — retry-løkken er
altså allerede understøttet.

Månedsvejens forbillede er et ANDET og venligere mønster:
`getEarlyExitPersistPayload` (extract-financial-data/index.ts:203-232)
sætter ved kendte-kilde-fejl `status: "processed"` +
`validation_status: "FAIL"` + `quality_signals.needs_manual_entry: true`
— med den udtrykkelige begrundelse (210-211): "The user will be guided to
enter data manually instead of seeing a dead-end error." Rapporten lander
så i review-flowet i stedet for som blindgyde.

Fund: en afvist årsrapport KAN følge failReport-mønstret uden nyt
maskineri (grund i error_log, vist som "Kunne ikke behandles" + toast) —
men vil man have "afvist ser ud som månedsafvist", er needs_manual_entry-
mønstret det rigtige forbillede, og det kobler naturligt til
spørge-mekanikken fra PR #442 (afvisningsgrundene
`omkostninger_ikke_udtrukket`/`for_faa_felter` er præcis "guided manual
entry"-tilfælde).

## 6. Prompt og tool-skema — hvad hviler på minus-instruksen?

```
109: - Negative tal (underskud, tab) angives som negative tal
138:   personaleomkostninger: { type: "number", description: "Negativt tal" },
```

(Tool-skemaet i sin helhed: 131-149; required: year + resultat_foer_skat,
linje 150.)

Forudsætter noget andet i funktionen de negative fortegn? Målt: **nej.**
Revenue-fallbacket bruger `Math.abs` på begge led (198) og er
fortegns-agnostisk; resten af funktionen skriver værdier igennem. Ingen
kode i filen læser et fortegn.

MEN linje 109 bærer to instrukser i én sætning: (a) omkostninger med
minus (den motoren gør overflødig og fjendtlig), og (b) "underskud, tab
angives som negative" — den del er ØNSKET for resultatlinjen
(`resultat_foer_skat`, `aarsresultat`): fjernes hele linjen, kan AI'en
finde på at aflevere et underskud som positivt tal, og motorens
vendingslogik er bygget til at OPDAGE kreditnegative dokumenter, ikke til
at gendanne et fortegn AI'en har kastet væk (begge lukningsveje testes
mod ±ebt, så et abs'et underskud ville vendes korrekt KUN hvis
regnestykket lukker den vej — det gør det, men man flytter dommen fra
dokument til motor). Den kirurgiske ændring er derfor: fjern
"Negativt tal"-beskrivelsen på personaleomkostninger (138) og omskriv 109
til kun at handle om resultatlinjer — ikke slette den.

## 7. Hvad går i stykker hvis en årsrapport kan afvises?

Hver kalder/flade, målt:

1. **RapporteringView.handleUpload (939-949)**: håndterer allerede
   `!result.ok` — kaster og toaster funktionens fejlbesked (968). En
   afvisning med en dansk `grund` i `error` vises altså direkte. Ikke i
   stykker, men beskeden skal formuleres til mennesker.
2. **Dedup-soft-deleten (914-919)**: se §4.1 — det reelle brud. I dag
   mister medlemmet årets gamle tal hvis det NYE upload fejler; en motor
   der afviser gør det til et normaltilfælde. Skal løses sammen med
   koblingen, ellers straffer afvisningen medlemmet.
3. **Rækken i listen**: en afvist rapport står som "Kunne ikke behandles"
   (1068) med Slet som eneste handling — ingen grund-visning.
   error_log'en findes i extracted_data men fladen læser den ikke.
4. **Review Queue (ReportReviewQueue.getFlags, 44-73)**: flagger på
   ai_eligible/extraction_method/routing_trace/correction_log — årsvejen
   sætter INGEN af delene, så en afvist årsrapport er USYNLIG i køen.
   Rådgiveren opdager den kun via medlemmets liste.
5. **STEP 0-oprydningen (66-86)**: virker FOR afvisning — gamle
   error-rapporter for året ryddes ved næste forsøg. Ingen ændring nødvendig.
6. **Members.tsx:267** læser `extracted_data.nettoomsaetning` på
   årsrapporter til oversigt — tolererer manglende felter (null-safe).
   Ikke i stykker.
7. **update-annual-report-revenue**: kræver eksisterende annual-facts
   (404-guarden) — efter en afvisning findes ingen facts, så "Ret
   omsætning" på en afvist rapport ville få 404 "Re-upload the annual
   report first". Konsistent, men beskeden forudsætter at re-upload
   hjælper — hvilket den ikke gør hvis afvisningsgrunden består.
8. **Spørge-mekanikken fra PR #442** (950-953): læser `revenue_status`
   af et OK-svar; en afvisning når aldrig dertil. Uændret.

Ingen kalder crasher — bruddet er semantisk: (2) gør afvisning dyr for
medlemmet, (3)+(4) gør den stum for rådgiveren.
