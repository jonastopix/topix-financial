# Recon: FAIL uden nogen fejlbesked
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27, main. Kort dom: **fejllisten skrives IKKE altid
korrekt — der findes én præcis mekanisme hvor status bliver FAIL med tom
validation_errors, og den passer på de syv aktive (ai_extraction).**
Grunden EKSISTERER i databasen for hver af dem; den ligger bare i en
kolonne ingen kopierer videre.

---

## 1. Alle skrivesteder for validation_status / validation_errors

**Edge functions** (`supabase/functions/extract-financial-data/index.ts`):

| Sted | Linjer | Status | Errors |
|---|---|---|---|
| `getEarlyExitPersistPayload` (kendte-kilde-fejl: structural/semantic fail, kendt kilde uden template) | 203-232 (status 218, errors 219; spejlet i quality_signals 222-223) | altid "FAIL" | `errors`-parametret — alle kaldere (716-718, 852-856, 878-882) sender ét konkret element |
| ai_no_tool_call | 1264-1269 | "FAIL" | `["AI returned no tool call"]` |
| **Hoved-payloaden** | **1629-1630** (spejl i quality_signals 1639-1640) | `finalStatus` (1371) | `allErrors.length > 0 ? allErrors : null` |
| Periode ikke afsluttet | 1580-1585 | "FAIL" | `["Periode ikke afsluttet"]` |
| Exception-handler | 1775-1780 | "FAIL" | `[error.message]` |

**Klienten** (spejlet i HbReportUploadZone med samme linjemønster):

| Sted | Linjer | Errors |
|---|---|---|
| FileUploadZone: multi-sheet-afvisning | 158-166 | udfyldt (dansk besked) |
| FileUploadZone: password-PDF | 210-214 | `["PDF is password protected"]` (sætter IKKE validation_status — kun status "error") |
| FileUploadZone: structural client-fail | 226-243 | udfyldt, både kolonne og quality_signals |

**RPC'er/SQL**: ingen. Migrationerne LÆSER kun validation_status
(`resolve_report_commit_candidate` m.fl.). `generate-financial-commentary:133`
er et internt AI-payload-felt, ikke en DB-skrivning.
`extract-annual-report` sætter aldrig kolonnerne (målt i årsvejs-reconen).

## 2. Kan status blive FAIL med tom validation_errors?

Ja — på præcis ét skrivested: **hoved-payloaden, linje 1629-1630**:

```ts
1371:    const finalStatus = canonical.validation?.status ?? "FAIL";
1372:    const allErrors = (canonical.validation?.canonical_checks ?? [])
1373:      .filter((c: any) => c.result === "FAIL")
1374:      .map((c: any) => `${c.name}: ${c.details}`);
...
1629:        validation_status: finalStatus,
1630:        validation_errors: allErrors.length > 0 ? allErrors : null,
```

`allErrors` bygges UDELUKKENDE af canonical_checks. Men `finalStatus`
kan blive FAIL af en anden kilde (se §3/§4). Er ingen canonical-checks
FAIL, er `allErrors` tom, og kolonnen skrives eksplicit til **null** —
mens status står FAIL. Alle øvrige skrivesteder hardkoder en ikke-tom
liste sammen med FAIL og kan ikke producere kombinationen. (Teoretisk
rest: `canonical.validation` helt fraværende → `?? "FAIL"` med tom
liste — muligt kun på det semantiske spor hvor extractedData bruges rå
som canonical; de ni er ai_extraction, hvor buildCanonicalOutput altid
sætter validation.)

## 3. FAIL-kæden i månedsvejen — kan checks tabes?

`runExtendedValidation` (canonicalEngine.ts:564-773) → status afledes
(759-771):

```ts
760:  const hasCanonicalFail = checks.some(c => c.result === "FAIL");
761:  const hasAiFail = aiChecks.some(c => c.result === "FAIL");
765:  if (hasCanonicalFail || hasAiFail) {
766:    status = "FAIL";
```

- **Canonical-checks tabes ikke**: allErrors filtrerer direkte på
  `canonical_checks` med result FAIL (1372-74), så hver eneste
  canonical-FAIL lander i validation_errors med navn og detaljer.
  (Motorens interne `errors`-array er hullet — fx pusher
  ebit_calculation-FAIL (626-630) aldrig til `errors` — men det er
  harmløst, for kolonnen bygges af checks-listen, ikke af `errors`.)
- **ai_checks tabes ALTID**: `hasAiFail` kan alene gøre status FAIL
  (761, 765), men ai_checks indgår hverken i `errors` eller i
  `allErrors`. Resultat: status FAIL, validation_errors null.

Det er hullet: statusdommen lytter til to kilder, fejllisten kun til
den ene.

## 4. ai_extraction-grenen specifikt

Ja, stien findes, og den er ikke eksotisk:

1. AI-udtrækket lykkes teknisk. Tool-skemaet KRÆVER at modellen
   selv-validerer (index.ts:1183-1206: `validation.status` og
   `validation.checks`, fx `daekningsbidrag_sum`,
   `resultat_consistency`, `balance_equation`).
2. `buildCanonicalOutput` mapper modellens checks til `ai_checks`
   (canonicalEngine.ts:1321-1325).
3. Modellen melder ét check FAIL; alle 13 canonical-checks er
   PASS/SKIP (fx fordi felterne der skulle udløse dem mangler — et
   SKIP tæller ikke som FAIL).
4. `hasAiFail` → status FAIL (761, 765) → `finalStatus` FAIL (1371)
   → `allErrors` tom (1372-74) → `validation_errors: null` (1630).

Fejllisten "overskrives" ikke — den **bygges aldrig** af den kilde der
fældede dommen. Profilen matcher de syv aktive præcist: ai_extraction,
FAIL, tom kolonne.

## 5. Hvad viser fladen ved FAIL?

**validation_errors læses INGEN steder i src/** — grep finder kun
skrivesteder (FileUploadZone/HbReportUploadZone) og typedefinitionen.
Selv en korrekt udfyldt liste når aldrig medlemmet.

- **Medlemmets rapporteringsflade**: FAIL-rapporten er
  `status: "processed"` (financial doc-reglen, index.ts:1426-1434) og
  lander som "Afventer godkendelse". Åbner medlemmet
  ReportReviewDialog, kommer forklaringen fra
  `resolve_report_commit_candidate` — for v1-FAIL bliver det
  `state_reason: "Ingen godkendte metrics fundet"` (vist i dialogen,
  ReportReviewDialog.tsx:805-806, og i toasten,
  RapporteringView.tsx:263). Generisk uanset om validation_errors er
  fuld eller tom — men med tom kolonne er der HELLER ikke noget at
  opgradere til.
- **Review Queue**: flag "Validation fail" (ReportReviewQueue.tsx:55)
  og kolonnen `Validation: FAIL` (216). Ingen fejltekst — kun link til
  report-debug.
- **ReportDebug**: viser validation_status (142) og validation_errors
  KUN når listen er ikke-tom (157-161). For de syv: badge FAIL og
  ingen liste — præcis det målte symptom.

## 6. Hvor ligger grunden så i dag?

For en af de syv aktive er grunden med stor sandsynlighed IKKE tabt —
den ligger i AI'ens egne checks, som gemmes to steder:

1. **`normalized_data.validation.ai_checks`** — canonical-objektet
   gemmes helt (index.ts:1633); ai_checks sættes i buildCanonicalOutput
   (1321-25, canonicalEngine 1365). **ReportDebug viser dem** i
   validation-sektionen (ReportDebug.tsx:247-258) — rækkerne med
   result FAIL ER grunden.
2. **`extracted_data.validation`** — AI'ens rå selvvalidering,
   spejlet tilbage for bagudkompatibilitet (index.ts:1343-1351, inkl.
   `corrections` og `errors`).
3. `raw_extracted_data` — hele AI-svaret, sidste udvej (ReportDebug
   har en JSON-blok til den).
4. `quality_signals` hjælper IKKE her: dens `validation_errors` er
   samme tomme værdi (1640), og `canonical_checks` (1641) indeholder
   pr. definition ingen FAIL i dette scenarie.

**Opskriften i dag**: Review Queue → rækkens debug-link →
`/admin/report-debug/<id>` → validation-sektionen → `ai_checks` →
FAIL-rækkernes `details`. Medlem og rådgiver kan ikke se den ad nogen
almindelig flade.

## Konklusion som fund

De ni er ikke "noget andet" — de er den forudsigelige konsekvens af at
`allErrors` kun høster canonical_checks, mens statusdommen også fælder
på ai_checks. Rettelsen er én linje i substans (medtag ai_checks'
FAIL-rækker i allErrors, index.ts:1372-74) — men verificér mod de to
april-rækker, om de deler mekanismen, før alle ni tælles i samme bunke.
