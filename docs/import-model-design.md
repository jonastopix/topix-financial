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

**Slette-knappen er gated på et præfiks.** `HbBudgetEditTable.tsx:450` sætter `isManual = row.key.startsWith("manual_")`, og knappen renderes kun når den er sand (`:534`). Importerede rækker har enum-nøgler.

### Rapport-siden har den modsatte fejl

Rapport-vejen har deterministiske parsere. Men `parseDanishNumber` (`_shared/pdfTextParser.ts:22-35`) antager dansk konvention absolut: punktum er tusindtal, komma er decimal.

Medlemmets `2,700,000` bliver til `2.700,000` og `parseFloat` giver **2,7**.

### Målt mod prod 2026-08-23

| Signal | Tal |
|---|---|
| Rapporter i alt | 193 fra 21 virksomheder |
| Hårde fejl (`status = error`) | 6 |
| Kræver manuel indtastning | 29, fordelt på **5 virksomheder** |
| `known_source_unsupported_variant` | 2 |
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

Fordelingen: **21 af de 23 tilhører Brick Works ApS**, perioderne april-september 2025. De sidste 2 er fra januar-maj 2026 og har tomt `company_name`.

Ingen opdagede det i over et år. Signalet fandtes; der var ingen der lyttede. Samme sygdom som edge functions uden fejlovervågning, men på datasiden.

### Fejlene har én årsag

Ti registrerede fejltekster på tværs af de 23. Fire er ren fortegnsvending:

```
gross_profit_sum: MISMATCH: -115840.07 ≠ 115840.06999999995
gross_profit_sum: MISMATCH:  -14709.06 ≠  14709.059999999998
gross_profit_sum: MISMATCH: -639640.40 ≠ 639640.4
gross_profit_sum: MISMATCH:  -77799.25 ≠  77799.24999999994
```

Tallene er identiske; kun fortegnet er vendt. `dkCombinedBalancePnlV1` har fortegnsdetektion for både business- og credit-konvention, men filhovedet (`:5-8`) siger at **kun credit er understøttet**. Bruger virksomhedens regnskabssystem business-konvention, vender alle fortegn. *Ikke verificeret at Brick Works ramte netop den skabelon — mønstret passer.*

`impossible_margin_check` med 1515% og 260% dækningsgrad peger samme vej: omsætning aflæst for lille, formentlig separatorproblem. `EBT > gross_profit` og `2/3 metrics negative` er fortegn igen.

**Mindst syv af ti fejl er fortegnskonvention eller talaflæsning** — begge dele adresseret af motoren i §4. Brick Works løser sig selv ved gen-upload; det er ikke en separat oprydningsopgave.

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

**P4 — Tal-konvention detekteres, aldrig antages.**

Konventionen udledes af indholdet: har en streng både punktum og komma, er den højeste stilling decimaltegnet; har den kun ét separatortegn, afgøres det af grupperingsmønstret. Det samme gælder fortegnskonvention — business og credit skal begge understøttes, ikke kun den ene.

**P5 — Motoren er vokabularie-uafhængig.**

Motoren omdanner tekst til rækker med etiket og tal. Kategoritildeling er en separat funktion der kan skiftes ud uden at røre motoren. Det gør det muligt at bygge motoren nu og koble den til canonical bagefter.

**P6 — Tallenes tilstand skal være synlig, ikke skjult bag et binært flueben.**

Commit-trinnet gater ikke på validering i dag, og det skal det heller ikke komme til — en gate ville skabe en ny død ende, og valideringen er som målt tæt på støj.

Svaret er synlighed frem for spærring. Et tal der er aflæst automatisk og aldrig efterset, er ikke det samme som et tal et menneske har bekræftet. Medlem og rådgiver skal kunne se forskellen, og et fejlsignal skal nå et menneske frem for at ligge i en kolonne ingen læser.

---

## 3. De tre lag

**Etiketten** er medlemmets eget navn. "Notion". Bevares ordret, altid. Kan aldrig gå tabt, uanset om noget kan klassificeres.

**Det kanoniske felt** er `admin_costs` — nøjagtig det felt rapporten også lander på. Må være tomt.

**Gruppen** udledes af det kanoniske felt og findes allerede i `budgetTemplates.ts:227-236`.

### Hvorfor canonical og ikke en kontoplan

Der findes ingen fælles dansk kontoplan. Kodens egne range-tabeller beviser det: Dinero har `2000-2999 = cogs` og `5000-5999 = facility_costs` (`dkDineroResultatopgoerelseCsvV1.ts:47-58`); e-conomic har `2200-2299 = loenninger` og `5000-5099 = anlaegsaktiver` (`dkEconomicSaldobalanceXlsxV1.ts:59-80`). Samme numre, forskellig betydning. Adskillelsen bæres af kilde-fingerprintet.

Men der findes allerede ét fælles vokabularium: `CanonicalMetrics` i `_shared/canonicalTypes.ts:27-60`, 32 felter, med filhovedet *"Single source of truth for all financial report normalization."*

Otte skabeloner med hvert sit lokale vokabularium normaliserer allerede ind i det sæt via `KF_TO_CANONICAL`, `SEMANTIC_TO_CANONICAL`, `CLASS_TO_CANONICAL` og fortegnsprofilerne. Budget er bare aldrig blevet koblet på.

Opgaven er derfor ikke at opfinde et vokabularium, men at give budget den samme oversættelse de otte skabeloner allerede har. Budget mod faktisk bliver eksakt ved konstruktion — og `REPORT_FIELD_TO_BUDGET_KEYS` (`budgetEngine.ts:268-281`) med sine dokumenterede huller kan slettes frem for udbygges.

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
| `sourceFingerprint.ts:174-176` (`isAiAllowed`) | Kendt kilde uden matchende skabelon → AI spærret, manuel indtastning | Kendt kilde uden skabelon → deterministisk motor → gitter. AI forbliver spærret på kendte kilder (værnet er rigtigt), men gitteret erstatter den døde ende |
| Periode-gaten, `extract-financial-data/index.ts:1561-1599` | Igangværende måned → `status: "error"` | Advarsel, ikke afvisning |
| Budget-enum, `import-budget-excel/index.ts:170-202` | 29 faste værdier, alt andet → `andet` | Fri etiket + valgfrit canonical-felt |
| `HbBudgetEditTable.tsx:450` | Slette-knap kun på `manual_`-rækker | Enhver række kan slettes |

AI-værnet på kendte kilder bevares. Bekymringen er rigtig: AI må ikke digte tal på formater vi burde kunne læse præcist. Ændringen er at fallbacken bliver et gitter i stedet for en blindgyde.

---

## 6. Åbne spørgsmål

**6.1 Sammenligner validatoren floats uden tolerance?**
Fejlteksterne viser rå float-artefakter (`115840.06999999995` mod `-115840.07`). Selv med korrekt fortegn ville afrundingsstøj kunne udløse en fejl. Det er formentlig en del af forklaringen på at 33 fejl blev ignoreret — nogle var falske alarmer. Samme klasse som float-artefakterne lukket i PR #155. **Skal verificeres i koden, ikke antages.**

**6.2 En rapport kan være FAIL uden registreret grund.**
23 fejlede rapporter, kun 10 fejltekster. 13 er markeret FAIL med tom `validation_errors`. Selv hvis nogen havde kigget, kunne de ikke have handlet.

**6.3 Hvad sker der med de 84 eksisterende budgetkategorier hos 14 virksomheder?**
De skal mappes én gang til canonical. Automatisk eller med medlemmets bekræftelse er ikke besluttet. Samme klasse som B9 i opgave-modellen.

**6.4 Hvordan matches budgetlinje mod rapportlinje ved nedboring?**
Rapportsiden gemmer allerede linjeniveau i `normalized_data.raw_lines`, som ingen læser (§7.2). Materialet findes. Men linjenavne matcher sjældent ordret, så matchningen bliver aldrig perfekt, og fladen skal sige det ærligt.

**6.5 Hvad med de 13 virksomheder der aldrig har uploadet?**
Kan ikke ses i data. Nogle har måske prøvet og givet op før en række blev skrevet. Bør genbesøges når importen virker — de 15 aktiverings-sager i `RAEKKEFOELGE.md` er formentlig delvist blokerede frem for frafaldne.

**6.6 Hvem er de to rapporter med tomt `company_name`?**
Januar-maj 2026, fejlede, urørte, committet. Enten er feltet aldrig sat, eller rapporten er ikke koblet ordentligt.

---

## 7. Fund undervejs der skal bogføres

**7.1 `FIN_INCOME` og `TAX` falder ud af canonical.**
`CLASS_TO_CANONICAL` (`canonicalEngine.ts:76-85`) har ingen modtager for de to klasser, men AI-skemaet kan producere dem (`extract-financial-data/index.ts:1174-1177`). Linjer klassificeret som finansiel indtægt eller skat forsvinder uden spor. Rammer rapporter i dag, ikke kun budget.

**7.2 `src/lib/financialParser.ts` importeres ikke af nogen komponent.**
547 linjer plus tests. Grep over `src/` finder kun filen selv og dens tests. Dens `raw_lines` når aldrig databasen. Sjette tilfælde af mønsteret "bygget færdigt, aldrig koblet til en flade" — se `BACKLOG.md`, P4.

**7.3 `RANGE_CLASSES` findes i tre tekstidentiske kopier.**
`dkDineroResultatopgoerelseCsvV1.ts:47-58`, `dkDineroResultatopgoerelsePdfV1.ts:62-73`, `dkGenericResultatopgoerelsePdfV1.ts:62-73`.

**7.4 `parseDanishNumber` findes i fem næsten identiske kopier.**
`_shared/pdfTextParser.ts:22-35` plus varianter i fire skabelonfiler. Klient-varianten `normalizeNumber` (`excelTemplates.ts:53-64`) erstatter ALLE kommaer med punktum, hvilket gør `1,234,567` til `NaN`.

**7.5 `dkCombinedBalancePnlV1` understøtter kun credit-konvention.**
Dokumenteret i filens eget hoved (`:5-8`), men detektionen findes for begge (`:52-58`). Sandsynlig årsag til Brick Works' 21 fortegnsvendte rapporter.

---

## 8. Rækkefølge inden for sporet

**Spor 1 — motoren og de døde ender.** Vokabularie-uafhængigt. Motoren (§4), gitteret som fælles landingsflade (P2), slette-knappen, de fem døde ender (§5). Verificér 6.1 først — float-tolerance er en enkeltlinje-rettelse der kan fjerne en stor del af støjen med det samme.

**Spor 2 — canonical-koblingen.** Budget mapper til `CanonicalMetrics`. `REPORT_FIELD_TO_BUDGET_KEYS` slettes. De 84 eksisterende kategorier mappes.

**Spor 3 — nedboring.** Budgetlinje mod rapportlinje, når 6.4 er besvaret.

Motoren ved intet om kategorier, så spor 1 skal ikke laves om når spor 2 kommer.

---

## 9. Hvad der ikke er besluttet

Datamodel for etiket og canonical-felt på `budget_targets`, UI for gitteret, RLS. Dette dokument beslutter **principper og form**, ikke implementering.
