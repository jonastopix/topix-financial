# data_basis-kontrakten: estimat mod måling i financial_report_facts

Indført 2026-08-26 (branch `faktum-datagrundlag`, migration
`20260826120000_data_basis_paa_facts.sql`). Dette er det ENE sted skelnen
står — næste skriver skal ikke gætte.

## Skelnen

| Kolonne | Bærer | Værdier |
|---|---|---|
| `source_type` | **HVEM** der skrev rækken — skrivevejens identitet | `canonical`, `canonical_v2`, `manual`, `annual_report`, `manual_baseline`, `baseline` |
| `data_basis` | **HVAD** rækken er — dommen over tallet | `measured`, `estimated` |

- **`measured`**: tal fra en rigtig periode-rapport for netop den måned
  rækken sidder på.
- **`estimated`**: afledt eller fordelt tal — en årsrapports årstal divideret
  med 12 og kopieret ud i tolv måneder, en baseline-fordeling bag en
  `_annual_baseline_sentinel_`-attraprapport, eller enhver fremtidig
  konstruktion der ikke er en måling af måneden selv.

`source_type` kan IKKE bære dommen. Målt i prod 26/8: `manual` dækker både
rigtige måneds-commits (via `commit_report_facts`) og baseline-fordelinger
(`save-annual-baseline` skriver `source_type='manual'` bag sentinel-attrappen).
Samme mærkat, to vidt forskellige epistemiske statusser — deraf kolonnen.

## Regler for skrivere

1. **Sæt altid `data_basis` eksplicit.** Kolonnens default (`'measured'`)
   findes udelukkende som værn mod en overset fremtidig skriver — den er
   ikke en skrivevej. Håndhævet af CI-testen
   `src/test/factsDataBasisGuard.test.ts` (fejler på TS-inserts/upserts uden
   `data_basis` og på SQL-INSERTs i migrationer ≥ `20260826120000` uden
   kolonnen i kolonnelisten).
2. **Kendte skriveveje og deres dom:**
   - `commit_report_facts` (alle resolver-grene: canonical/canonical_v2/manual) → `'measured'`
   - `extract-annual-report` → `'estimated'`
   - `save-annual-baseline` → `'estimated'`
   - `auto-create-baseline-budget` → `'estimated'`
3. **En ny skriver** der ikke oplagt er det ene eller det andet er et
   design-spørgsmål, ikke et default-spørgsmål.

## Læsere

**KONTRAKTEN: Beregninger udelukker estimater. Visninger må vise dem, men
skal sige det. Et tal udledt af et estimat og præsenteret som en måling er
en påstand systemet ikke kan indfri.**

`useCompanyFacts` eksponerer feltet på `CompanyFact.data_basis`.
`factsAdapter` arbejder kun på `metrics`-objektet — `data_basis` er en
række-kolonne og må aldrig flyttes ind i metrics.

Motoren for skelnen er `src/lib/dataGrundlag.ts` (ren, React-fri, testet):
`erEstimat`, `kunMaalinger`, `opgoerGrundlag`, `momErGyldig` (M/M kun når
begge de to seneste punkter er målinger) og `segmenterSerie` (klar til
segmenterede graf-serier — bygget til visnings-PR'en, endnu ubrugt).

Beregningsgates pr. 2026-08-26 (branch `estimat-beregningsgrundlag`):
`generate-ai-forecast` (kun measured, ≥3 står), `HbBudgetBva` (estimater er
ikke realiseret), `generate-financial-commentary` (estimatperioder hverken
kommenteres eller bruges som kontekst), `deriveKpiMetrics`/M/M-blokken
(changePct er `null` — aldrig 0 — når grundlaget er ugyldigt).

Håndhævelse: `src/test/factsDataBasisReadGuard.test.ts` kræver at enhver
fil der læser tabellen enten bruger `data_basis` i kode eller bærer en
begrundet `// data_basis-undtagelse:`-markør, og at markør-mængden matcher
testens eksplicitte undtagelsesliste præcist.

Visningsmærkning pr. 2026-08-26 (branch `estimat-markering`): fælles mærke
`src/components/hjemmebane/EstimatMaerke.tsx` — pill ("Estimat") og kompakt
("est."), begge med forklaringen `ESTIMAT_FORKLARING` som title. Den ENE
forklaring bor dér, og formuleringen matcher uploadsidens eget løfte
("tallene fordeles over 12 måneder og giver dine grafer historisk
kontekst"). Mærket bruges af Nøgletal-tælleren (opgoerGrundlag),
månedstabellens headere, branchesammenligningens "dig"-værdi og forsidens
TalStrip.

Graf-linjer pr. 2026-08-26 (branch `estimat-graflinje` — kontraktens sidste
led): `delSerieTilTegning` i `src/lib/dataGrundlag.ts` spalter hver
værdinøgle i målt + `__estimat` med grænsepunktet i begge nøgler, så
estimat-delen tegnes prikket i samme farve uden udfyldning og uden hul.
Reglen: en strækning er kun fuldt optrukket når BEGGE endepunkter er
målinger. Delte serier tegnes UDEN connectNulls (dokbloks-begrundelse i
motoren). Tooltip dedup'es pr. basenøgle og mærker estimatpunkter
(" · estimat"); forklaringen under grafen genbruger ESTIMAT_FORKLARING.

## Undtagelsen: periodetotaler (2026-08-27, branch `periode-opgoerelse`)

Kontrakten "beregninger udelukker estimater" er begrundet i at den ENKELTE
estimatmåned er fiktion: extract-annual-report skriver `årstal/12` i tolv
identiske rækker, så "marts 2025 = 48.000 kr" er ikke en observation af
marts — det er en regnekonstruktion. Enhver beregning der behandler den
som en måned (M/M, forecast-trend, budgetafvigelse) måler derfor på noget
der ikke findes. Deraf gaterne.

**Summen over hele estimatår er det modsatte tilfælde.** Divisionen med 12
er reversibel: 12 × (årstal/12) giver årsrapportens rigtige årstal tilbage
(på nær `Math.round`-afrunding, højst 6 kr pr. år — bevist i
`src/lib/__tests__/periodeOpgoerelse.test.ts`). Fiktionen ligger i
FORDELINGEN hen over månederne, ikke i totalen — og en sum over hele året
er præcis den operation der annullerer fordelingen. Årsrapportens årstal er
oven i købet et REVIDERET tal; for et helt estimatår er periodetotalen
derfor mere pålidelig end nogen enkelt målt måned.

Derfor gælder for periodetotaler (motoren `src/lib/periodeOpgoerelse.ts`,
`opgoerPeriode`): estimater regnes MED, og grundlaget bæres ud pr. nøgle
(basis: measured/estimated/blandet, estimatAndel til "heraf estimeret"),
så visningen kan sige det — kontraktens visningsled gælder uændret.

Grænsen for undtagelsen er skarp og hedder `heleEstimatAar`:
- **Hele kalenderår af estimater i perioden** → summen er årsrapportens
  eksakte tal. Undtagelsen gælder fuldt.
- **Delår** (fx 6 af 12 estimatmåneder i "Seneste 12") → summen hviler på
  en jævnhedsantagelse: "halvdelen af månederne = halvdelen af årstallet"
  påstår at halvåret stod for præcis 50 % af årets aktivitet. Det er en
  antagelse, ikke et tal fra årsrapporten — flaget er falsk, og visningen
  bør formulere sig derefter.

Arts-reglerne (hvad "total" overhovedet betyder): flows summeres; forhold
beregnes ved at køre MÅNEDSFORMLEN (calcDbMargin/calcResultMargin via
udtraek) på ét summeret kf-objekt — aldrig gennemsnit af månedsprocenter;
beholdninger (bank) summeres aldrig men viser ultimo, med kilderækkens
EGEN basis (banken kan komme fra en ældre, evt. estimeret, måned).
Mål er holdt ude af motoren — månedsmål × N er visningens beslutning.

## Deploy-note

Migrationen køres manuelt i Lovable → SQL editor (jf. CLAUDE.md).
SELECT-før/efter-tallene i migrationskommentaren udfyldes ved kørsel:
forventet 156 + 12 = 168 `estimated`, 162 `measured`, 330 i alt (målt 26/8).
