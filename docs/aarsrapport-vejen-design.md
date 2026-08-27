# Årsrapport-vejen — måling og design

Målt 27. august 2026. Recon afsluttet, to rettelser udført i drift,
ingen kodeændring endnu.

## 1. Hvad vejen er

`extract-annual-report` tager en PDF, udtrækker årstal, dividerer med 12
og skriver tolv identiske månedsrækker i `financial_report_facts` med
`source_type = 'annual_report'` og `data_basis = 'estimated'`.
Funktionen sletter og genskriver alle tolv måneder for året —
et upload er destruktivt for det år.

/12-modellen er bekræftet: `count(distinct metrics)` = 1 i alle 13 årgange.

Vejen skriver fire nøgler: `payroll`, `depreciation`, `cogs`, `admin_costs`.
`sales_costs` og `facility_costs` findes ikke i dens tool-skema.
`admin_costs` mappes fra `andre_eksterne_omkostninger` — et bredere begreb
end administrationsomkostninger.

## 2. Konventionen bæres af en prompt

`canonicalEngine` tvinger omkostninger positive i kode
(`alwaysPositiveExpenseFields`, `Math.abs`). Årsrapport-vejen har intet
tilsvarende. `monthly()` er kun `Math.round(val / 12)`.

I stedet står konventionen i prompten:

- linje 108: «Negative tal (underskud, tab) angives som negative tal»
- linje 137: `personaleomkostninger: { description: "Negativt tal" }`

Resultatet er delvis efterlevelse: `payroll` negativ i 108 af 120 rækker,
`admin_costs` og `cogs` sjældnere. Samme kode, samme kontraktversion v1,
ti forskellige mønstre.

Årsrapport-vejen har hverken `validation_status` eller `extraction_method`.
Den ene destruktive skrivevej er den eneste helt uden port og uden spor.
Der findes ingen testfil for funktionen.

## 3. Beviset: Alina Beauty & Skincare

Dokumentet `udkast klinik 2025.pdf` er en kreditnegativ resultatopgørelse
fra et bogføringssystem — ikke en årsrapport. Omsætning står negativt,
omkostninger positivt.

| linje | dokument | lagret ×12 | dom |
|---|---|---|---|
| omsætning | −1.808.290,32 | 1.808.292 | vendt korrekt |
| dækningsbidrag | −1.345.082,49 | 1.345.080 | vendt korrekt |
| lønninger | +561.554,81 | −561.552 | **vendt forkert** |
| salg+lokale+transport+admin | +358.707,10 | 358.704 | urørt korrekt |
| afskrivninger | +26.485,17 | 26.484 | urørt korrekt |
| årets resultat | −398.494,61 | −398.496 | **urørt forkert** |

Opgørelsen går op på kronen: −1.345.082,49 + 561.554,81 + 24.276,54
+ 157.277,50 + 631,30 + 176.521,76 + 26.485,17 − 169,63 + 10,43
= −398.494,61. I dokumentets konvention er det et **overskud**.

Modellen vendte omsætning og dækningsbidrag efter instinkt, vendte
lønninger fordi prompten bad om et negativt tal, og lod resultatlinjen
stå fordi den så negativ ud. Prompten konverterede et overskud på
398.495 til et underskud af samme størrelse. Vist til medlemmet
fra 25. april til 27. august.

Rettet 27/8: `payroll` og `ebt` gjort positive i både
`financial_report_facts.metrics` og `financial_reports.normalized_data`.
`raw_extracted_data` urørt som bevis.

## 4. Vejen fodres ikke med årsrapporter

Seks af tretten uploads på vejen er noget andet end en årsrapport:

| virksomhed | fil | faktisk dokument |
|---|---|---|
| Alina Beauty & Skincare | udkast klinik 2025.pdf | udkast, resultatopgørelse |
| Floren Engros 2024 | Bilag til oplysningsskema 2024 | skattebilag |
| PHILBERT ApS | sum April Topix Balance 2026-0… | månedsbalance fra april 2026 |
| Rezycl.com | Saldobalance 2025.pdf | saldobalance |
| Doggybed | årsopgørelse 2025.pdf | årsopgørelse |
| remm. | Spec.hæfte 2025 | specifikationshæfte |

Kun Alina-dokumentet er åbnet og læst. De fem andre er udledt af filnavnet
alene — stærkt indicium, ikke bevis. Dokumenttypen skal verificeres ved at
åbne filen, før nogen af dem behandles som fejlfodret.

PHILBERTs årsrapport 2025 er en aprilbalance fra 2026 divideret med tolv.
Samtidig ligger seks rigtige PHILBERT-rapporter ucommittede i køen.

Ingen port sagde fra. Alina-filen står i rådgiverfladen som
`Aarsrapport · Årsrapport 2025 · Committed ✓`.

## 5. Klassificering af de tretten

Regnestykket `bruttoresultat − |omkostninger| = ebt` afgør klassen.

**A — stemmer under positiv konvention (6):** ANLA GLAS 2024,
Booking Innovation 2024, Doggybed 2025, Livja 2025, Topix.dk 2025,
YKRG 2024. Kan normaliseres maskinelt.

**B — resultatlinjen også vendt (1):** Alina Beauty & Skincare 2025.
Rettet. Kræver kildelæsning, kan ikke afgøres maskinelt.

**C — stemmer ikke under nogen konvention (3):** Floren Engros 2024
og 2025, Rezycl.com 2025. Skal genudtrækkes, ikke fortegnsrettes.
To af dem er påvist fejlfodret: skattebilag og saldobalance.
Floren Engros 2025 hedder `Årsregnskab 2025.pdf` — dokumenttypen er
ikke verificeret, kun at regnestykket ikke går op.

PHILBERT 2025 er ude af klassen: løst 27/8 (§9). Fremgangsmåden er
gentagelig for Rezycl.com, som har PASS-rapporter for januar, april og
juni 2026 liggende ucommittede.

**D — for tyndt udtræk til dom (2):** Booking Innovation 2025 og
remm. 2025. remm. har ingen omkostningsnøgler overhovedet, så
`ebt_beregnet` (410.388) er blot bruttoresultatet uden fradrag.
Afvigelsen på 87.180 siger intet om fortegn.

Rezycl.com er den eneste virksomhed helt uden negative omkostninger og
samtidig den mest ødelagte: bruttoresultat −1.178.676 på en omsætning
af 2.011.440. Den ville bestå ethvert fortegnstjek.

YKRG har `revenue = 0` i alle tolv måneder — et falsk nul skrevet
i stedet for null. Enhver margin på det år dividerer med nul.

## 6. Hvad en rettelse kræver

**Begge tabeller i ét greb.** `financial_reports.normalized_data`
spejler faktarækkerne med samme fortegn, og to paritetsvalidatorer
(`validate-facts-parity`, `useCompanyFacts` PARITY_DEBUG) sammenligner
1:1. Rettes kun den ene side, melder begge massemismatch.
Årsrapporter gemmer fladt; saldobalancer gemmer under `metrics`
med `cvr` ved siden af.

**`ebt` må aldrig `abs()`'es generelt.** Topix har ægte underskud
(−484.128 lagret mod −485.700 beregnet, begge negative og konsistente).
Alinas rettelse er kun rigtig fordi dokumentet blev læst.
Resultatlinjen kan kun afgøres per virksomhed mod kilden — eller
maskinelt via en polaritetsdetektion der lukker regnestykket.

**`cogs` er sikker at `abs()`'e på denne vej.** Contra-cost er afvist:
hos 382fd787 giver omsætning − |cogs| bruttoresultatet præcist, og
bruttoresultatet er mindre end omsætningen. Undtagelsen i
`canonicalEngine` (linje 205–222) er ægte og test-låst og skal ikke røres.

**Læserne tåler rettelsen.** Abs-lejren (`calcTotalExpenses`, `kpiDefs`,
`weeklyFocusKpi`, alle Hb-budgetflader) ændrer sig ikke. Rå-lejren
(`PerformanceOverview` løn-%, NoegletalView-trendserien,
MemberDetail-kort, `run-company-agent` payroll_pct,
`ai-financial-feedback`) bliver rigtig.

**Bivirkning at forvente:** `computeDerivedMetrics` har en `opex > 0`-guard
der i dag tavst dropper EBITDA/EBIT-afledning for negative tal.
Positive tal aktiverer den. Samme for `auto-create-baseline-budget`s
`> 0`-gates.

## 7. Den manuelle vej

95 negative værdier, 16 rækker, én virksomhed, indtastet 7. juli.
`OverrideFormFields.tsx` linje 26–32 viser placeholders med negative
eksempler («Eks. -600000») på netop de seks felter — mens
`computeDerivedMetrics` i samme flow ikke kan regne på negative tal.
Brugeren fulgte instruksen. UI'et og beregningen er uenige.

Eget spor. Ikke en migrering.

## 8. `equity` er forældreløs

Årsrapport-vejen skriver nøglen `equity`; de tre andre veje skriver
`equity_total`. `factsAdapter` mapper kun `equity_total` og dropper
ukendte nøgler tavst. En repo-bred søgning finder ingen læser af
`equity` — hverken i `src/` eller `supabase/functions/`.
120 rækker hos 8 virksomheder er ikke usynlige i UI'et; de er
uden aftager i hele kodebasen.

Rettelsen er ét kanonisk navn, ikke en mapping i adapteren.

## 9. Rettet i drift 27. august

- Topix.dk 2025: `revenue` 48.929,75 tilføjet til tolv rækker
  (587.157 ÷ 12). Skrevet uden om udtræksvejen — går tabt hvis
  årsrapporten uploades igen.
- Alina Beauty & Skincare 2025: `payroll` og `ebt` gjort positive
  i fakta og rapport.
- Klasse A, seks årgange: de fire omkostningsnøgler gjort positive i
  både `financial_report_facts.metrics` og
  `financial_reports.normalized_data`, betinget og idempotent.
  180 værdier. `ebt` urørt og verificeret uændret på alle seks.
- PHILBERT ApS: tre PASS-rapporter committed via medlemsfladen
  (januar, marts, april 2026 — målte tal), og den fejltypede
  årsrapport 2025 slettet. Triggeren `cleanup_facts_on_report_delete`
  fjernede de tolv faktarækker. Den opdigtede årsomsætning på 192.840
  var under halvdelen af de rigtige måneders niveau.

## 10. Påstande der er trukket tilbage

- «Topix' tal står på et skattebilag» — nej. Skattebilaget er
  soft-slettet og fik aldrig faktarækker. Årsrapporten blev
  gen-uploadet 26/8 kl. 22:08.
- «Kun AI'en ser årsrapportens egenkapital» — nej. Ingen læser findes.
- «Fortegnsfejlen er personale og afskrivninger» — for snævert.
  Fire nøgler på årsrapport-vejen, seks på den manuelle, plus
  resultatlinjen.
- «Udtrækket overtager PDF'ens fortegn» — for løst. Prompten
  beder aktivt om negative omkostninger.
- «PHILBERT er en anden fortegnsvendt ebt» — nej. Afvigelsen er
  ti procent, ikke afrunding. Forkert dokument, ikke forkert fortegn.
- «133 af 141 uploads» er ikke et medlemstal: 29 af dem er
  Topix' egne testuploads. Korrigeret succesrate ca. 92,9 %.
- «Rådgiveren har ingen UPDATE-politik på financial_reports» — nej.
  Målt i pg_policy: seksten politikker, alle permissive, herunder
  «Advisors can update financial reports» og «Advisors can delete
  facts». Påstanden var min, ikke reconens.
- «Slet-knappen på årsrapporten er død» — nej. Den virker, inkl.
  bekræftelsestrin og facts-oprydning via trigger. Konklusionen byggede
  på målinger taget før klikket. `financial_report_facts` har derimod
  ingen UPDATE-politik overhovedet — det står ved magt.
- «reviewed_at er et dødt felt» — nej. Det er rådgiverens læst-flag,
  skrevet i CompanyChatPane. Det er blot ikke en godkendelsesmarkør.

## 11. Åbne beslutninger

- Skal skattebilaget understøttes som selvstændig kilde eller som
  supplement? Blokerer omskrivningen af udtræksfunktionen.
- Skal vejen afvise dokumenter der ikke er årsrapporter, eller
  klassificere dem om? Seks af tretten er i dag fejlfodret.
- Skal klasse C genudtrækkes eller nulstilles?
- Hvad fik Alina at vide af agenten i de fire måneder tallet var forkert?
  Målt 27/8: intet. Fire ugekort i perioden, det eneste med indhold er
  fra 21. april — fire dage før uploadet — og bygger på hendes
  månedsdata. Ingen agent_runs, ingen agent_proposals. Intet at
  trække tilbage.

## 12. Normaliseringsarkitektur — besluttet 27/8

Det eksisterende canonical-maskineri kan allerede det halve af
`aarsrapportNormalisering`: `expense_must_be_positive` og
`gross_profit_sum` findes. Fortegnsdetektionen — resultatvending,
egenkapitalvending, bruttovending — er gated på
`report_type.toLowerCase().includes("saldo")` og på AI-sporet.

Besluttet:

- **Saldobalance-gaten åbnes ikke.** Den er låst af syv profiler og et
  tocifret antal tests, og den bærer de veje der virker for flertallet.
- **Årsrapport-vejen rutes ikke gennem legacy-motoren.**
  `KF_TO_CANONICAL` kender ikke `nettoomsaetning`,
  `personaleomkostninger` eller `andre_eksterne_omkostninger`, og
  `if (!canonicalField) continue` ville droppe fem af ni felter tavst
  — samme fejlklasse som `equity` i `factsAdapter`.
- **Mellemvejen:** `runExtendedValidation()` som port — den er
  metrics-drevet og genbrugelig — og `normaliserAarsrapport` til
  polaritetsdom og afvisning.
- **Normaliseringen skal køre på årstallene før divisionen med tolv.**
  I dag divideres først (`extract-annual-report/index.ts:207-217`), så
  motoren ville dømme afrundede månedstal mod en 2-kroners tolerance.

Og en beslutning som målingen har truffet for os: vejen skal ikke
afvise på dokumenttype, men på om regnestykket lukker. Den test ville
have afvist seks af tretten uploads — inklusive Alinas udkast, som
intet typetjek ville have fanget.
