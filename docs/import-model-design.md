# Import-model — design

**Besluttet**: 2026-08-23
**Status**: Principper og form besluttet (P1-P6). Datamodel, UI og canonical-kobling er ikke besluttet.
**Grundlag**: `docs/import-recon.md`-fund, `docs/kontoplan-recon.md`-fund, og måling mod prod 2026-08-23.
**Placering**: Tempo 1 i `docs/RAEKKEFOELGE.md`.

---

## 1. Baggrund

To betalende medlemmer skrev 22. august. Det ene får forkerte tal ud af sin budget-CSV og kan ikke slette de poster systemet selv har opfundet. Det andet får besked på at indtaste sin rapport manuelt.

### Budget-importen har ingen parser

Der findes ingen kode der omdanner en celle til et tal. Hele arket flades til tekst (`HbBudgetImport.tsx:141-149`) og sendes til `gemini-2.5-flash`. Alt — tal, fortegn, rækketyper, kategorier — afgøres af sprogmodellen ud fra prompt-tekst.

Prompten indeholder to linjer der forklarer begge medlemmets klager (`import-budget-excel/index.ts:107-113`):

- **"Beløb skal ALTID være POSITIVE tal"** — medlemmets fil skriver omkostninger som `(17.000)`. Instruktionen gør dem positive. Det er "den har tilpasset omkostninger selv", sat i system.
- **"Ignorer totaler, subtotaler, marginer og beregnede felter"** — en instruktion, ikke kode. Medlemmets fil har "Subtotal Personale & konsulentydelser" direkte under de tre poster den summerer. Modellen gætter.

Prompten nævner ikke parenteser, tusindtalsseparatorer, decimaltvetydighed, bindestreg-som-nul, procenttegn eller valutategn.

### Tre ting der forstærker det

**Kategori-enummet har 29 faste værdier** (`index.ts:170-202`). Medlemmets budget har omkring 90 linjer. Redigeringstabellen kan holde frie kategorier via `manual_`-nøgler — kun importen kan ikke.

**Dubletter summeres ved skrivning.** `confirmBudgetImport` (`budgetEngine.ts:709-721`) lægger rækker med samme kategori og periode sammen. Tages både detaljelinjen og subtotalen, adderes de i stilhed. Samme klasse som `tech_software`-fejlen (PR #151).

**Slette-knappen er gated på et præfiks.** `HbBudgetEditTable.tsx:450` sætter `isManual = row.key.startsWith("manual_")`, og knappen renderes kun når den er sand (`:534`).

### Rapport-siden har den modsatte fejl

Rapport-vejen har deterministiske parsere. Men `parseDanishNumber` (`_shared/pdfTextParser.ts:22-35`) antager dansk konvention absolut: punktum er tusindtal, komma er decimal.

Medlemmets `2,700,000` bliver til `2.700,000` og `parseFloat` giver **2,7**.

### Målt mod prod 2026-08-23

| Signal | Tal |
|---|---|
| Rapporter i alt | 193 fra 21 virksomheder |
| Hårde fejl (`status = error`) | 6 |
| Kræver manuel indtastning | 29, fordelt på **5 virksomheder** |
| Uploads seneste 60 dage | 69, heraf 7 fejlede eller manuelle |
| Budgetter | 14 virksomheder, 84 distinkte kategorier |

**Hver fjerde virksomhed der har uploadet, har ramt muren.** Set pr. rapport 15%; set pr. virksomhed 24%.

13 af 34 virksomheder har aldrig uploadet. En upload der aldrig blev til en række, kan ikke ses i data.

### Valideringen er tæt på støj

Krydstabel `validation_status` × manuel rettelse:

| | Rettet i hånden | Urørt |
|---|---|---|
| **PASS** | 30 | 90 |
| **FAIL** | 20 | 33 |
| **NULL** | 4 | 16 |

**30 rapporter bestod valideringen og blev alligevel rettet i hånden.** Et grønt flueben betyder ikke at tallene er rigtige.

**33 rapporter fejlede og blev aldrig rørt.** Rettelsesraten er 38% på FAIL mod 25% på PASS — signalet korrelerer knap nok med om tallene er forkerte.

### 23 fejlede, urørte rapporter er committet

Af de 53 fejlede er 43 committet til `financial_report_facts`; 20 blev rettet først, 23 ikke. Deres tal står i KPI'er, på forsiden, i budget mod faktisk og på rådgiverens skærm.

**21 af de 23 tilhører Brick Works ApS**, perioderne april-september 2025. De sidste 2 er fra januar-maj 2026 og har tomt `company_name`.

Ingen opdagede det i over et år. Signalet fandtes; der var ingen der lyttede.

### Fejlene har én årsag

Ti registrerede fejltekster på tværs af de 23. Fire er ren fortegnsvending:

```
gross_profit_sum: MISMATCH: -115840.07 ≠ 115840.06999999995
gross_profit_sum: MISMATCH:  -14709.06 ≠  14709.059999999998
gross_profit_sum: MISMATCH: -639640.40 ≠ 639640.4
gross_profit_sum: MISMATCH:  -77799.25 ≠  77799.24999999994
```

Tallene er identiske; kun fortegnet er vendt. `dkCombinedBalancePnlV1` har fortegnsdetektion for både business- og credit-konvention, men filhovedet (`:5-8`) siger at **kun credit er understøttet**. *Ikke verificeret at Brick Works ramte netop den skabelon — mønstret passer.*

`impossible_margin_check` med 1515% og 260% dækningsgrad peger samme vej: omsætning aflæst for lille. `EBT > gross_profit` og `2/3 metrics negative` er fortegn igen.

**Mindst syv af ti fejl er fortegnskonvention eller talaflæsning** — begge dele adresseret af motoren i §4. Brick Works' tal ville blive rigtige ved en gen-upload. Men det kan de ikke, se §6.7.

---

## 2. Principperne

**P1 — Der findes ingen afvisning. Kun grader af hjælp.**

Et medlem må aldrig ende i en død ende. Kan motoren læse filen deterministisk, gør den det. Kan den ikke, læser den så meget den kan og viser resten som rækker medlemmet kan bekræfte eller rette. Kan den intet, viser den filen som et gitter medlemmet kan arbejde i direkte.

Værste udfald er at medlemmet ser sine egne tal i en tabel og trykker godkend. Ikke en fejlbesked.

**P2 — Gitteret er rygraden, ikke plan B.**

Alle importer lander i samme redigerbare gitter, uanset om parseren fik det hele, halvdelen eller ingenting. Parseren udfylder bare mere eller mindre af det.

Det gør indsæt-fra-regneark — som medlemmet eksplicit bad om — til en egenskab ved arkitekturen frem for en ekstra funktion. Og det opfylder P1 ved konstruktion.

**P3 — Linje-først, ikke kategori-først.**

Motoren bevarer hver linje som den er, med medlemmets egen etiket. Kategorisering er et efterfølgende, valgfrit trin.

En kategori-først-model har intet sted at lægge det ukendte. En linje-først-model lægger det i gitteret uden kategori og lader medlemmet bestemme. Det er den eneste model hvor P1 kan holdes.

**P4 — Tal- og fortegnskonvention detekteres, aldrig antages.**

Tal-konventionen udledes af indholdet: har en streng både punktum og komma, er den højeste stilling decimaltegnet; har den kun ét separatortegn, afgøres det af grupperingsmønstret. Det samme gælder fortegnskonvention — business og credit skal begge understøttes, ikke kun den ene.

**P5 — Motoren er vokabularie-uafhængig.**

Motoren omdanner tekst til rækker med etiket og tal. Kategoritildeling er en separat funktion der kan skiftes ud uden at røre motoren.

**P6 — Tallenes tilstand skal være synlig, ikke skjult bag et binært flueben.**

Commit gater ikke på validering i v2-grenen, og det skal det heller ikke komme til — en gate ville skabe en ny død ende, og valideringen er som målt tæt på støj.

Svaret er synlighed frem for spærring. Et tal aflæst automatisk og aldrig efterset er ikke det samme som et tal et menneske har bekræftet. Medlem og rådgiver skal kunne se forskellen, og et fejlsignal skal nå et menneske frem for at ligge i en kolonne ingen læser.

**P7 — Et medlem skal altid kunne rette sin egen historik.**

En forkert rapport må ikke kunne spærre for en rigtig. Ejerskab af en periode skal kunne overtages af en nyere rapport — som et bevidst valg, ikke automatisk og lydløst.

---

## 3. De tre lag

**Etiketten** er medlemmets eget navn. "Notion". Bevares ordret, altid.

**Det kanoniske felt** er `admin_costs` — nøjagtig det felt rapporten også lander på. Må være tomt.

**Gruppen** udledes af det kanoniske felt og findes allerede i `budgetTemplates.ts:227-236`.

### Hvorfor canonical og ikke en kontoplan

Der findes ingen fælles dansk kontoplan. Kodens egne range-tabeller beviser det: Dinero har `2000-2999 = cogs` og `5000-5999 = facility_costs` (`dkDineroResultatopgoerelseCsvV1.ts:47-58`); e-conomic har `2200-2299 = loenninger` og `5000-5099 = anlaegsaktiver` (`dkEconomicSaldobalanceXlsxV1.ts:59-80`). Samme numre, forskellig betydning. Adskillelsen bæres af kilde-fingerprintet.

Men der findes allerede ét fælles vokabularium: `CanonicalMetrics` i `_shared/canonicalTypes.ts:27-60`, 32 felter, med filhovedet *"Single source of truth for all financial report normalization."*

Otte skabeloner med hvert sit lokale vokabularium normaliserer allerede ind i det sæt. Budget er bare aldrig blevet koblet på.

Opgaven er derfor ikke at opfinde et vokabularium, men at give budget den samme oversættelse de otte skabeloner allerede har. Budget mod faktisk bliver eksakt ved konstruktion — og `REPORT_FIELD_TO_BUDGET_KEYS` (`budgetEngine.ts:268-281`) kan slettes frem for udbygges.

De 29 enum-nøgler og `generate-budget-from-accounts`' frie snake_case-nøgler dør begge.

---

## 4. Hvad motoren skal kunne

Ren funktion, ingen database, ingen AI. Testet før nogen flade bygges. Samme mønster som `canonicalEngine`, `budgetEngine`, `opgaveEngine`.

1. **Find tabelgrænser.** Hvor begynder datatabellen, hvor slutter den, og indeholder filen flere tabeller. Remm-filen har et KPI-resumé i linje 4-15 og en månedstabel fra linje 17.
2. **Detektér tal-konvention** pr. fil, ikke pr. celle (P4). Rapportér hvilken konvention der blev valgt, så den kan vises og overstyres.
3. **Normalisér celler til tal.** Parenteser som negativt fortegn, tusindtalsseparatorer, bindestreg og tom celle som nul, procenttegn, valutategn, mellemrum.
4. **Klassificér rækker** som post, subtotal, sektionsoverskrift eller støj — på struktur, ikke på ordvalg. En subtotal genkendes på at den summerer rækkerne over sig, ikke på at den hedder "subtotal".
5. **Bevar etiketten** ordret på hver post.
6. **Returnér et resultat med huller**, aldrig en fejl. Rækker den ikke kunne læse, kommer med som rækker uden tal.

Kategoritildeling er **ikke** motorens opgave (P5).

---

## 5. Døde ender der skal fjernes

| Sted | Adfærd i dag | Skal blive til |
|---|---|---|
| `excelTemplates.ts:197-199` (`detectTemplate`) | Enhver workbook med ark `DATA` **og** `P&L Top Line` afvises som fejl | Læses som enhver anden fil, lander i gitteret |
| `sourceFingerprint.ts:174-176` (`isAiAllowed`) | Kendt kilde uden matchende skabelon → AI spærret, manuel indtastning | Kendt kilde uden skabelon → deterministisk motor → gitter. AI forbliver spærret på kendte kilder (værnet er rigtigt) |
| Periode-gate ved **upload**, `extract-financial-data/index.ts:1561-1599` | Igangværende måned → `status: "error"` | Advarsel, ikke afvisning |
| Periode-gate ved **commit**, `resolve_report_commit_candidate` | Blokerer perioder der ikke er afsluttet | **Bevares.** Er rigtig — en halv måned må ikke committes som endeligt tal. Men teksten skal gøre klart at filen er modtaget og læst |
| Budget-enum, `import-budget-excel/index.ts:170-202` | 29 faste værdier, alt andet → `andet` | Fri etiket + valgfrit canonical-felt |
| `HbBudgetEditTable.tsx:450` | Slette-knap kun på `manual_`-rækker | Enhver række kan slettes |
| Ejerskab i `resolve_report_commit_candidate` | En tidligere rapport ejer perioden → `can_commit = false`, `state = 'blocked'` | Overtagelse som bevidst valg (P7). Se §6.7 |

AI-værnet på kendte kilder bevares. Bekymringen er rigtig: AI må ikke digte tal på formater vi burde kunne læse præcist. Ændringen er at fallbacken bliver et gitter i stedet for en blindgyde.

---

## 6. Åbne spørgsmål og fund i commit-vejen

**6.1 Float-tolerance — MODBEVIST 2026-08-23.**
Hypotesen holdt ikke. `canonicalEngine.ts:38` definerer `const TOLERANCE = 2` (2 kr. absolut), brugt i `gross_profit_sum` (`:598`), `ebit_calculation` (`:628`), `result_consistency` (`:640`), `balance_equation` (`:656`) og `period_consistency` (`:669`). Float-halen i fejlteksten er ren formattering: `expected.toFixed(2)` mod et råt `metrics.gross_profit` (`:602`). Afvigelsen på Brick Works er ~231.680 kr. — en fortegnsvending, ikke afrundingsstøj. En ældre validator med 1% relativ tolerance findes i `financialParser.ts:405-414`, men de citerede fejl kommer entydigt fra `canonicalEngine`.

**6.2 FAIL uden registreret grund — FORKLARET 2026-08-23.**
`validation_errors` bygges udelukkende af `canonical_checks` (`extract-financial-data/index.ts:1371-1374`). Men status kan blive FAIL alene på `hasAiFail` (`canonicalEngine.ts:759-771`), som omfatter `deterministic_parser_status` og modellens egne checks. En rapport hvor parseren fejlede, men alle 13 canonical checks bestod, får `validation_status = 'FAIL'` og `validation_errors = null`.

**Skal rettes:** fejllisten skal bygges af alle fejlede checks, ikke kun de kanoniske. En FAIL skal altid kunne forklares.

**6.3 V2-grenen gater ikke på validering — BEKRÆFTET 2026-08-23.**
`resolve_report_commit_candidate` har tre grene. Manuel kræver `manual_override_status = 'applied'`. **V1 kræver `validation_status = 'PASS'`. V2 kræver kun at metrics findes.**

V2-grenen bærer allerede statussen med: `_out.validation_status := COALESCE(_r.validation_status, 'unknown')`. Informationen er der — der er bare ingen der læser den, og `can_commit` sættes uafhængigt af den.

Konsekvens: samme fejl behandles forskelligt alt efter hvilken kontraktversion der processerede filen. To medlemmer med identiske problemer får forskelligt udfald, og ingen kan se hvorfor.

**Skal rettes:** ikke ved at gate (bryder P1), men ved at bære tilstanden ind i `financial_report_facts` som en denormaliseret kolonne. Denormaliseret, fordi et join tilbage giver rapportens *nuværende* status frem for den den havde da tallet blev godkendt.

**6.7 Ejerskab spærrer for gen-upload — NYT FUND 2026-08-23.**
Ejer en anden rapport allerede perioden, sættes `can_commit := false` og `state := 'blocked'`. Ejerskabet frigives kun hvis den ejende rapport er soft-deletet.

De 21 fejlede rapporter fra Brick Works **ejer deres perioder**. Uploader de de samme måneder igen — korrekt aflæst med den nye motor — bliver den nye rapport blokeret af den gamle forkerte.

**Et medlem kan ikke rette sin egen historik ved at gøre det rigtige.** Det er den alvorligste døde ende fundet i forløbet, fordi den rammer præcis det medlem der forsøger at hjælpe sig selv. Deraf P7.

Uafklaret: findes der en flade hvor et medlem kan slette en rapport?

**6.4 Hvad sker der med de 84 eksisterende budgetkategorier hos 14 virksomheder?**
De skal mappes én gang til canonical. Automatisk eller med medlemmets bekræftelse er ikke besluttet.

**6.5 Hvordan matches budgetlinje mod rapportlinje ved nedboring?**
Rapportsiden gemmer allerede linjeniveau i `normalized_data.raw_lines`, som ingen læser (§7.2). Materialet findes. Men linjenavne matcher sjældent ordret, så matchningen bliver aldrig perfekt, og fladen skal sige det ærligt.

**6.6 Hvad med de 13 virksomheder der aldrig har uploadet?**
Kan ikke ses i data. Bør genbesøges når importen virker — de 15 aktiverings-sager i `RAEKKEFOELGE.md` er formentlig delvist blokerede frem for frafaldne.

**6.8 Hvem er de to rapporter med tomt `company_name`?**
Januar-maj 2026, fejlede, urørte, committet.

---

## 7. Fund undervejs der skal bogføres

**7.1 `FIN_INCOME` og `TAX` falder ud af canonical.**
`CLASS_TO_CANONICAL` (`canonicalEngine.ts:76-85`) har ingen modtager for de to klasser, men AI-skemaet kan producere dem (`extract-financial-data/index.ts:1174-1177`). Linjer klassificeret som finansiel indtægt eller skat forsvinder uden spor.

**7.2 `src/lib/financialParser.ts` importeres ikke af nogen komponent.**
547 linjer plus tests. Dens `raw_lines` når aldrig databasen. Sjette tilfælde af mønsteret "bygget færdigt, aldrig koblet til en flade".

**7.3 `RANGE_CLASSES` findes i tre tekstidentiske kopier.**
`dkDineroResultatopgoerelseCsvV1.ts:47-58`, `dkDineroResultatopgoerelsePdfV1.ts:62-73`, `dkGenericResultatopgoerelsePdfV1.ts:62-73`.

**7.4 `parseDanishNumber` findes i fem næsten identiske kopier.**
Klient-varianten `normalizeNumber` (`excelTemplates.ts:53-64`) erstatter ALLE kommaer med punktum, hvilket gør `1,234,567` til `NaN`.

**7.5 `dkCombinedBalancePnlV1` understøtter kun credit-konvention.**
Dokumenteret i filens eget hoved (`:5-8`), men detektionen findes for begge (`:52-58`). Sandsynlig årsag til Brick Works' 21 fortegnsvendte rapporter.

---

## 8. Rækkefølge inden for sporet

**Spor 1 — motoren.** Vokabularie-uafhængigt og uafhængigt af commit-vejen. Motoren (§4) med tests, derefter gitteret som fælles landingsflade (P2), slette-knappen og de døde ender i §5 der ikke rører commit.

**Spor 2 — commit-vejen.** 6.2 (fejlliste fra alle checks), 6.3 (tilstand bæres ind i facts) og 6.7 (ejerskab kan overtages). Kan køre parallelt med spor 1 — de rører ikke samme filer.

**Spor 3 — canonical-koblingen.** Budget mapper til `CanonicalMetrics`. `REPORT_FIELD_TO_BUDGET_KEYS` slettes. De 84 eksisterende kategorier mappes.

**Spor 4 — nedboring.** Budgetlinje mod rapportlinje, når 6.5 er besvaret.

Motoren ved intet om kategorier, så spor 1 skal ikke laves om når spor 3 kommer.

---

## 9. Hvad der ikke er besluttet

Datamodel for etiket og canonical-felt på `budget_targets`, kolonne for valideringstilstand på `financial_report_facts`, UI for gitteret, RLS. Dette dokument beslutter **principper og form**, ikke implementering.
