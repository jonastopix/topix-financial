# Recon: kendt kilde uden template — blindgyden
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27. Målt: 9 uploads (5 dinero, 4 economic, tre
virksomheder, seneste 23. august) afvist med "Known source … detected
but no supported template matched. AI fallback is forbidden for known
sources."

---

## 1. Hvor detekteres "kendt kilde"?

`supabase/functions/_shared/sourceFingerprint.ts`,
`detectSourceSystem()` (29-168). Afgøres på INDHOLD (og for XLSX på
header-rækker) — aldrig på filnavnet (fileName læses ind, linje 37, men
bruges ikke til nogen dom):

- **e-conomic PDF**: footer-URL `secure.e-conomic.com` (42-55), med
  dokumenttype fra "Saldobalance"/"Resultatopgørelse"-headers; HIGH.
- **e-conomic uden branding**: "Resultatopgørelse"-header + e-conomic-
  kontonummerintervaller via `detectEconomicAccountRanges` (73-85);
  MEDIUM.
- **Dinero PDF**: ordet "dinero" i teksten (58-66); MEDIUM.
- **Dinero CSV**: headeren `Konto;Kontonavn;Beløb` (91-99); HIGH.
- **e-conomic XLSX**: CVR-række + "Saldobalance for perioden" (103-117)
  eller "Resultatopgørelse" + Konto/Tekst-kolonner (124-136); HIGH.
- **Combined DK XLSX**: Balance + Nummer/Navn + periodekolonne
  (139-157); HIGH.
- Alt andet: `unknown` (160-167).

Kendte kilder i dag: **economic, dinero, combined_dk**.

## 2. Forbuddet mod AI-fallback

`sourceFingerprint.ts:174-176`:

```ts
export function isAiAllowed(fingerprint: SourceFingerprint): boolean {
  return fingerprint.source_system === "unknown";
}
```

Begrundelsen står to steder:

- Filheaderen (linje 4-6): "Known sources MUST resolve via
  deterministic templates only — AI is forbidden. Unknown sources may
  fall through to AI extraction."
- Håndhævelsen i `extract-financial-data/index.ts` (no_match-grenen,
  847-856): "── KNOWN SOURCE + NO TEMPLATE = FAIL LOUD ──" og loggen
  "Known source … but no template matched → FAIL LOUD (AI forbidden)".

Ingen dato eller fejlspors-reference står VED forbuddet, men rationalet
kan aflæses af nabokoden: `isReadableFinancialDoc` (index.ts:249-261)
siger "Known source system → always trust (validation is advisory…)"
og for unknown+AI kræves PASS som "AI hallucination guard" — mønsteret
er at AI-udtræk anses for upålideligt nok til at kræve enten
uafhængig validering eller (for kendte kilder) helt at afskæres til
fordel for deterministik. Fingerprint-modulet er mærket "Phase 2 + 8"
— beslutningen er arkitektonisk fra det deterministiske spors fødsel,
ikke en enkeltstående hændelse med fejlspor.

## 3. Templates pr. kilde

`_shared/templates/` + registret (`templateRegistry.ts:148-166`), i
prioriteret rækkefølge:

| Template | Kilde | Filtype | Matcher på |
|---|---|---|---|
| dkEconomicSaldobalanceXlsxV1 | economic | xlsx | CVR-række + "Saldobalance for perioden" |
| dkCombinedBalancePnlV1 | combined_dk | xlsx | Balance + Nummer/Navn + periodekolonne |
| dkEconomicSaldobalancePdfV1 | economic | pdf | footer + Saldobalance-struktur |
| dkEconomicResultatopgoerelsePdfV1 | economic | pdf | footer + Resultatopgørelse-struktur |
| dkEconomicResultatopgoerelseXlsxV1 | economic | xlsx | Resultatopgørelse + Konto/Tekst-kolonner |
| dkDineroResultatopgoerelseCsvV1 | dinero | csv | `Konto;Kontonavn;Beløb`-header |
| dkDineroResultatopgoerelsePdfV1 | dinero | pdf | se §4 |
| dkGenericResultatopgoerelsePdfV1 | (ubrandet) | pdf | generisk P&L-struktur |

Dækning i dag: **dinero 2 varianter** (CSV + PDF-resultatopgørelse —
ingen dinero-saldobalance, ingen dinero-XLSX), **economic 4 varianter**
(saldobalance PDF/XLSX + resultatopgørelse PDF/XLSX — ingen
e-conomic-CSV, ingen balance-rapport). Alt uden for de seks + to
øvrige er umatchet.

## 4. Matchningslogikken

`detectTemplate()` (templateRegistry.ts:170-198): hver template scorer
konteksten selv (`detect(ctx)`); krav for match:

1. **score ≥ 80** (188), og
2. **afstand ≥ 10** til næstbedste (191-194) — ambiguity-reglen.

Eksempel, `dkDineroResultatopgoerelsePdfV1.detect` (282-…): hårde
anti-match-guards (e-conomic-footer, AKTIVER/PASSIVER, Saldobalance,
CSV-header, kræver ordet "dinero"); derefter point:
"Resultatopgørelse"-header +35 (hårdt krav), "dinero"-brand +25,
"Hentet:"-vandmærke +25, ≥3 ALL-CAPS-subtotaler ("OMSÆTNING I ALT" …)
+20, ≥5 firecifrede kontonumre +20, P&L-labels m.m.

**Det typiske fejlsted**: dokumentet ER fra kilden (fingerprintet
matcher på branding/footer — lavt krav), men layoutvarianten mangler
delsignalerne, så scoren lander under 80: en Dinero-**saldobalance**
(anti-match på "Saldobalance" → score 0), en Dinero-PDF uden
"Hentet:"-vandmærke eller uden CAPS-subtotaler, en e-conomic-**CSV**,
en balance-rapport. Fingerprint og template stiller altså vidt
forskellige krav — kilden genkendes let, varianten skal bestå en
detaljeret strukturprøve, og mellemrummet er præcis de ni.

## 5. Hvad gemmes om de ni — kan varianten afgøres i dag?

`getEarlyExitPersistPayload` (index.ts:203-232) gemmer:
`validation_errors` (den målte tekst), `extraction_method` og
`routing_branch` = "known_source_unsupported_variant", samt
`raw_extracted_data: { routing_trace }` — og routing_trace indeholder
`source_fingerprint` med evidence-listen (index.ts:479, fx "Dinero
branding detected in PDF text").

**Det gemmes IKKE**: templaternes detection-scores (kun console.log,
templateRegistry.ts:179-182), rå tekst, kolonnenavne, sheetnavne,
subtotaler. Ud fra databasen alene kan man altså se HVILKEN kilde og
HVILKET evidens-spor — men ikke hvilken variant.

**Men informationen er ikke tabt**: selve filen ligger i storage
(`financial-documents`, file_path på rapport-rækken) — varianten kan
afgøres ved at åbne de ni filer. Det er manuelt arbejde, ikke en
forespørgsel.

## 6. Mindste vej til en ny template

Det er en **kodeændring med udrulning** — registret er kompileret kode,
ingen datastruktur/konfig-vej findes:

1. Ny fil i `_shared/templates/` der implementerer `TemplateEntry`
   (`detect` + `extract`, evt. `extractSemantic*` for det semantiske
   spor) — typisk 300-700 linjer målt på de eksisterende.
2. Import + tilføjelse i `TEMPLATE_REGISTRY`
   (templateRegistry.ts:148-166).
3. Evt. ny normaliseringsprofil i `normalizationProfiles.ts`, hvis
   varianten har egen fortegnskonvention.
4. Fixtures + tests (mønster: `_test_fixtures/` + phase4-tests).
5. Merge til main → edge functions auto-deployer.

Mindre kirurgisk genvej for NÆRT beslægtede varianter: justér en
eksisterende templates `detect()`-signaler (fx acceptér manglende
vandmærke mod andre delsignaler) — men ambiguity-reglen og
anti-match-guards skal efterprøves mod golden fixtures.

## 7. Alternativet til enten-template-eller-blindgyde

**Fundet: alternativet er allerede halvt bygget — blindgyden er
klient-siden, ikke serveren.** `getEarlyExitPersistPayload` sætter for
netop denne gren `status: "processed"` + `validation_status: "FAIL"` +
`quality_signals.needs_manual_entry: true` med den erklærede hensigt
(index.ts:210-211): "The user will be guided to enter data manually
instead of seeing a dead-end error." Og ReportReviewDialog HAR
auto-indgangen: needs_manual_entry uden metrics → hop direkte i
redigeringstilstand med "Udfyld tallene nedenfor" (ReportReviewDialog,
auto-enter-effekten linje 168-180 + fejlbeskeden 621-631).

Rapporten lander altså som "Afventer godkendelse" med manuel
indtastning som næste handling. Det der GØR den til en blindgyde:

1. **Upload-svaret siger fejl**: funktionen returnerer
   `{ error: "Known source without supported template", status: "error" }`
   (index.ts:866-874), så upload-fladen toaster en fejl i stedet for
   at sige "filen understøttes ikke endnu — indtast tallene manuelt
   (2 min), eller prøv et andet eksportformat" og pege på kortet.
2. **Fejlteksten er engelsk og intern** ("AI fallback is forbidden…") —
   efter PR #448 vises den for medlemmet, uændret.
3. Ingen prompt om det NÆSTE format: for dinero ville "eksportér som
   CSV (Konto;Kontonavn;Beløb)" ofte ramme den understøttede variant —
   den vejledning findes allerede som mønster i dialogens
   eksportvejledning (ReportReviewDialog 780-795: Dinero/e-conomic/
   Billy-eksportstier), men vises ikke i denne gren.

Den mindst mulige ikke-template-løsning er altså ren formidling:
dansk besked i denne grens `validation_errors`, klient-toast der
skelner "ukendt variant → manuel indtastning eller andet
eksportformat" fra ægte fejl, og evt. eksportvejledningen genbrugt.
Template-arbejdet (§6) kan så prioriteres pr. variant når de ni filer
i storage er blevet åbnet og klassificeret (§5).
