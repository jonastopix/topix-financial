# Recon: spørg medlemmet om det manglende felt (årsrapport-vejen)
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27, main. Grundlag for beslutningen "vejen skal SPØRGE
om omsætningen når dokumentet ikke bærer den". Målt kontekst: 4 af 13
årgange mangler omsætning (ANLA null, Livja null, YKRG 0, Topix null før
rettelse).

---

## 1. "Ret omsætning" — kontrol, handler og hvad den skriver

`src/components/hjemmebane/rapportering/RapporteringView.tsx`.
Knappen (1105-1114) åbner inline-input (1075-1102: felt "Årsomsætning i
kr." + Gem/Fortryd via `editingRevenue`/`manualRevenue`-state). Handleren:

```tsx
979:  const handleSaveRevenue = async (reportId: string, year: string) => {
980:    const val = parseFloat(manualRevenue.replace(/\./g, "").replace(",", "."));
981:    if (isNaN(val) || val < 0) {
982:      toast.error("Indtast et gyldigt beløb");
983:      return;
984:    }
985:    setSavingRevenue(true);
986:    try {
987:      const { data, error } = await supabase.functions.invoke("update-annual-report-revenue", {
988:        body: { report_id: reportId, year, company_id: companyId, annual_revenue: val },
989:      });
990:      if (error) throw new Error(error.message);
991:      if (!data?.ok) throw new Error(data?.error || "Opdatering fejlede");
992:      toast.success("Omsætning opdateret ✓", {
993:        description: `${new Intl.NumberFormat("da-DK").format(val)} kr. fordelt over ${data.updated} måneder`,
994:      });
...
1001:    } catch (err: any) {
1002:      toast.error("Kunne ikke gemme", { description: err.message || "Ukendt fejl" });
```

Skrivningen sker server-side i
`supabase/functions/update-annual-report-revenue/index.ts` (Bucket A,
`authenticateUser` + medlemskab/advisor-tjek, 7-37):

- **Facts: ja.** Deler med 12 (linje 43: `Math.round(annual_revenue / 12)`)
  og skriver `metrics.revenue` på HVER annual_report-faktarække for året
  (47-82) — spread af eksisterende metrics + ny revenue, række for række.
- **extracted_data: ja.** `nettoomsaetning` (årstallet, udelt) +
  `success_log.revenue_status: "manual"` (84-104).
- **normalized_data: NEJ.** Feltet røres ikke. Rapport-rækkens
  normalized_data (den flade metrics-kopi fra udtrækket) driver altså fra
  faktarækkerne efter en manuel rettelse. Det er præcedensen for §6.

## 2. Tjekkes resultatet? Kan den ramme nul rækker tavst?

Ja, den tjekkes — i begge ender, i modsætning til Slet-flowet:

- Klienten destrukturerer `{ data, error }`, kaster på `error` OG på
  `!data?.ok`, og viser toast (990-991, 1001-1002).
- Edge-funktionen har en eksplicit nul-række-guard: 0 fundne facts →
  404 `"No annual_report facts found for this year. Re-upload the annual
  report first."` (60-64), og hver enkelt UPDATE tjekkes (75-80) med
  `updated`-tæller retur (108). Skrivningen sker med service-role, så
  RLS-filtrering kan ikke give tavse nul rækker.

Rest-hul: `extracted_data`-opdateringen (101-104) tjekkes ikke — men den
er metadata, ikke tal.

## 3. Uploadflowet fra klik til færdig

Alt i samme komponent (`AnnualReportsSection` i RapporteringView):

1. Årvælger (1019-1030, `uploadYear`-state) + "Upload årsrapport <år>"-knap
   (1031-1033) → skjult `<input type="file" accept=".pdf">` (1034-1044).
2. `handleUpload` (899-960): filnavns-sanering + storage-path (903-907) →
   dedup-soft-delete af eksisterende årsrapport for året (910-914) →
   storage-upload (916-917) → INSERT af financial_reports-række med
   `report_type: "aarsrapport"`, `status: "processing"` (919-932) →
   `supabase.functions.invoke("extract-annual-report", ...)` (934-938) →
   fejl kaster og toaster (955-956); succes toaster med `inserted` /
   `protected_count`-differentieret besked (940-949) → cache-invalidering
   + `annualQuery.refetch()` (951-954). Tilstande: `uploading`,
   `uploadYear`, `confirmDelete`, `editingRevenue`, `manualRevenue`.
3. Listen re-render fra `annualQuery` (878-897), hvor `year` udledes af
   report_period og `revenue` læses fra `extracted_data.nettoomsaetning`.

**Naturligt indsættelsespunkt for et spørgsmål:** mellem trin 2's
invoke-svar og succes-toasten (efter linje 938). Svaret bærer allerede
`result.extracted` (se §4), så klienten kan afgøre "mangler omsætning"
uden ekstra kald, og komponenten HAR allerede den inline-redigering
spørgsmålet skal munde ud i: `setEditingRevenue(reportRow.id)` +
`update-annual-report-revenue` er hele svar-vejen, færdigbygget. Et
spørgsmål er altså ikke en ny mekanisme, men en autoåbning af
"Ret omsætning"-flowet (evt. som dialog) når feltet mangler — flowet
brydes ikke, fordi rapporten og faktarækkerne allerede er skrevet og
spørgsmålet kun BERIGER bagefter, idempotent pr. felt.
Generalisering til "det felt der mangler" kræver at
update-annual-report-revenue generaliseres tilsvarende (i dag er den
hardcodet til `revenue`/`nettoomsaetning`) — samme /12-, guard- og
idempotens-skabelon kan bære et `field`-parameter.

## 4. Hvad returnerer extract-annual-report?

`extract-annual-report/index.ts:317`:

```ts
return new Response(JSON.stringify({ ok: true, inserted, protected_count, year, extracted }), ...
```

`extracted` er HELE det AI-udtrukne objekt (inkl. felter der er null/
udeladte, og inkl. en evt. afledt `nettoomsaetning` fra fallbacket
186-204). Klienten kan altså SE præcist hvilke felter der mangler
(`extracted.nettoomsaetning == null` osv.) — nok til beslutningen.

Det klienten IKKE får i svaret: klassifikationen. `revenue_status`
("extracted"/"derived"/"missing_gross_profit_only"/"missing"),
`derived_fields` og `metrics_keys` skrives kun i `success_log` på
`extracted_data` (293-313), ikke i responsen. Vil spørgsmålet skelne
"mangler helt" fra "klasse B-mikro uden omsætningslinje"
(`is_gross_profit_only` ER dog med i extracted), kan `success_log`
enten tilføjes responsen eller læses via refetch. Bemærk også nul-fælden:
funktionen skelner i dag IKKE 0 fra måling (`monthly(0)` = 0 skrives som
tal, YKRG-tilfældet) — "et nul tæller som manglende" skal afgøres af
spørgeren, indtil normaliseringsmotorens regel 2 tager over.

Fejlsiden er også struktureret: `{ ok: false, error, step }` med steps
download/ai_extraction/ai_no_tool_call/ai_parse/no_metrics/insert_facts.

## 5. Findes "udtrækket mangler noget, spørg brugeren" allerede?

Fire mønstre, i faldende genbrugelighed for DENNE beslutning:

- **"Ret omsætning" selv** (§1). ER mønstret i miniature: felt mangler →
  brugeren taster årstal → /12 → alle faktarækker + rapport opdateres,
  idempotent, med nul-række-guard. Mangler kun at blive (a) trigget
  automatisk ved manglende felt frem for manuelt, (b) generaliseret fra
  revenue til et feltparameter. Direkte genbrugelig.
- **AnnualBaseline + save-annual-baseline** (`src/pages/AnnualBaseline.tsx`,
  FIELDS 20-49): en hel side der spørger om fem årstal, deler med 12 og
  skriver 12 `manual_baseline`-facts via sentinel-rapport. Strukturelt
  samme idé ("spørg om årstal, fan ud /12"), men eget source_type og eget
  flow — en skabelon at skele til, ikke at kalde.
- **ReportManualOverride / "Ret data"** (`ReportManualOverride.tsx` +
  `OverrideFormFields` + `reportOverrideHelpers.saveManualOverride`):
  fuld dansk-nøgle-formular over ALLE felter; "Gem og anvend" = manual
  override applied + commit med det samme (onApplied → commit_report_facts,
  kommentar 32-37). Bygget til MÅNEDS-rapporter: perioden er én måned, og
  commit-vejen skriver ÉN faktarække — den kan ikke fan-ud til 12
  annual-rækker. Ikke genbrugelig til årsvejen uden ombygning.
- **ReportReviewDialog (edit-tilstand)**: inline-redigering af
  metrics_preview før commit — samme manual-override-maskine som ovenfor,
  samme én-periode-begrænsning. Dertil `quality_signals.needs_manual_entry`
  på månedsvejen (reportUploadEngine.ts:134-140), som er flag-varianten af
  "udtrækket mangler noget" — men den beder brugeren om ALT, ikke om det
  ene manglende felt.

Fund: repoet har altså allerede både spørgemønstret (Ret omsætning) og
generalisering-som-formular (Ret data) — men kun det første passer
årsvejens 12-række-model.

## 6. normalized_data på årsrapport-rækken — form og paritet

`extract-annual-report` skriver normalized_data ÉN gang, på ÉN række
(rapportens egen), i FLAD form — bemærk: metrics-objektet direkte, ikke
pakket under `.metrics` som canonical-vejen gør:

```ts
305:  await adminClient
306:    .from("financial_reports")
307:    .update({
308:      status: "processed",
309:      extracted_data: { ...extracted, success_log } as any,
310:      normalized_data: metrics as any,
311:      report_period: `Årsrapport ${year}`,
```

**Kan et felt tilføjes bagefter uden at bryde paritetsvalidatorerne?**
Fund, i tre lag:

1. `validate-facts-parity` læser `report.normalized_data?.metrics`
   (index.ts:153). For årsrapporter er det `undefined` (flad form), ingen
   `key_figures` findes, og validatoren lander ALLEREDE i
   `ui_source_is_none_but_fact_exists`-mismatch for hver eneste
   annual_report-faktarække — den loader alle facts uden
   source_type-filter (46-48). Årsvejen står altså allerede UDEN FOR
   paritetskontrakten; at tilføje et felt i facts kan ikke forværre en
   række der i forvejen tælles som mismatch af formårsagen.
2. `useCompanyFacts`-paritetsproben (PARITY_DEBUG) springer årsrapporter
   over af samme grund: `getEffectiveKeyFigures` finder hverken
   `.metrics` eller `key_figures` → null → `continue` (106-117 rammes
   aldrig).
3. Præcedensen `update-annual-report-revenue` opdaterer facts +
   extracted_data men IKKE normalized_data (§1) — dvs. den eksisterende
   efter-berigelse lader allerede de to lag drive fra hinanden, usanktioneret
   fordi validatorerne alligevel ikke kan læse den flade form.

Konsekvens som fund: "uden at bryde paritetsvalidatorerne" er i dag
trivielt opfyldt — de er allerede brudt/blinde for årsvejen. Skal
paritet nogensinde GÆLDE årsrapporter, skal enten formen (flad →
`.metrics`) eller validatoren ændres, og så skal en spørge-mekanisme
skrive begge lag (facts OG normalized_data) — hvilket
update-annual-report-revenue i dag ikke gør.
