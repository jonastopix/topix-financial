# Import-model — design

**Besluttet**: 2026-08-23
**Status**: Principper og form besluttet. Datamodel, UI og canonical-kobling er ikke besluttet.
**Grundlag**: `docs/import-recon.md`-fund, `docs/kontoplan-recon.md`-fund, og måling mod prod 2026-08-23.
**Placering**: Tempo 1 i `docs/RAEKKEFOELGE.md`.

---

## 1. Baggrund

To betalende medlemmer skrev 22. august. Det ene får forkerte tal ud af sin budget-CSV og kan ikke slette de poster systemet selv har opfundet. Det andet får besked på at indtaste sin rapport manuelt.

### Budget-importen har ingen parser

Der findes ingen kode der omdanner en celle til et tal. Hele arket flades til tekst (`HbBudgetImport.tsx:141-149`) og sendes til `gemini-2.5-flash`. Alt — tal, fortegn, rækketyper, kategorier — afgøres af sprogmodellen ud fra prompt-tekst.

Prompten indeholder to linjer der forklarer begge medlemmets klager (`import-budget-excel/index.ts:107-113`):

- **"Beløb skal ALTID være POSITIVE tal"** — medlemmets fil skriver omkostninger som `(17.000)`. Instruktionen gør dem positive. Det er "den har tilpasset omkostninger selv", sat i system.
- **"Ignorer totaler, subtotaler, marginer og beregnede felter"** — en instruktion, ikke kode. Medlemmets fil har "Subtotal Personale & konsulentydelser" direkte under de tre poster den summerer. Modellen gætter. Nogle gange tager den subtotalen i stedet for detaljerne.

Prompten nævner ikke parenteser, tusindtalsseparatorer, decimaltvetydighed, bindestreg-som-nul, procenttegn eller valutategn.

### Tre ting der forstærker det

**Kategori-enummet har 29 faste værdier** (`index.ts:170-202`). Medlemmets budget har omkring 90 linjer. Redigeringstabellen kan holde frie kategorier via `manual_`-nøgler — kun importen kan ikke.

**Dubletter summeres ved skrivning.** `confirmBudgetImport` (`budgetEngine.ts:709-721`) lægger rækker med samme kategori og periode sammen: `existingRow.budget_amount + row.budget_amount`. Tages både detaljelinjen og subtotalen, adderes de i stilhed. Samme klasse som `tech_software`-fejlen (PR #151).

**Slette-knappen er gated på et præfiks.** `HbBudgetEditTable.tsx:450` sætter `isManual = row.key.startsWith("manual_")`, og knappen renderes kun når den er sand (`:534`). Importerede rækker har enum-nøgler. Medlemmet kan ikke fjerne det AI'en fandt på.

### Rapport-siden har den modsatte fejl

Rapport-vejen har deterministiske parsere. Men `parseDanishNumber` (`_shared/pdfTextParser.ts:22-35`) antager dansk konvention absolut: punktum er tusindtal, komma er decimal.

Medlemmets `2,700,000` bliver til `2.700,000` og `parseFloat` giver **2,7**. To komma syv i stedet for to komma syv millioner, uden fejl og uden advarsel.

### Målt mod prod 2026-08-23

| Signal | Tal |
|---|---|
| Rapporter i alt | 193 fra 21 virksomheder |
| Hårde fejl (`status = error`) | 6 |
| Kræver manuel indtastning | 29, fordelt på **5 virksomheder** |
| `known_source_unsupported_variant` | 2 |
| Validering FAIL | 53 |
| **Rapporter med manuel override** | **54** |
| Uploads seneste 60 dage | 69, heraf 7 fejlede eller manuelle |
| Budgetter | 14 virksomheder, 84 distinkte kategorier |

**Hver fjerde virksomhed der har uploadet, har ramt muren.** Set pr. rapport er det 15%; set pr. virksomhed er det 24%. Den sidste vinkel er den der betyder noget.

**Flere rapporter er rettet i hånden (54) end systemet selv erkendte var problematiske (29).** Se §6.1 — det skal måles før parseren røres.

13 af 34 virksomheder har aldrig uploadet. En upload der aldrig blev til en række, kan ikke ses i data.

---

## 2. Principperne

**P1 — Der findes ingen afvisning. Kun grader af hjælp.**

Et medlem må aldrig ende i en død ende. Kan motoren læse filen deterministisk, gør den det. Kan den ikke, læser den så meget den kan og viser resten som rækker medlemmet kan bekræfte eller rette. Kan den intet, viser den filen som et gitter medlemmet kan arbejde i direkte.

Værste udfald er at medlemmet ser sine egne tal i en tabel og trykker godkend. Ikke en fejlbesked.

**P2 — Gitteret er rygraden, ikke plan B.**

Alle importer lander i samme redigerbare gitter, uanset om parseren fik det hele, halvdelen eller ingenting. Parseren udfylder bare mere eller mindre af det.

Det gør indsæt-fra-regneark — som medlemmet eksplicit bad om — til en egenskab ved arkitekturen frem for en ekstra funktion. Og det opfylder P1 ved konstruktion: man kan ikke ende i en død ende i et gitter der allerede indeholder ens egne tal.

**P3 — Linje-først, ikke kategori-først.**

Motoren bevarer hver linje som den er, med medlemmets egen etiket. Kategorisering er et efterfølgende, valgfrit trin.

En kategori-først-model har intet sted at lægge det ukendte. En linje-først-model lægger det i gitteret uden kategori og lader medlemmet bestemme. Det er den eneste model hvor P1 kan holdes.

**P4 — Tal-konvention detekteres, aldrig antages.**

`parseDanishNumber` antager dansk konvention. Filen fra Remm bruger amerikansk. Konventionen skal udledes af indholdet: har en streng både punktum og komma, er den højeste stilling decimaltegnet; har den kun ét separatortegn, afgøres det af grupperingsmønstret.

**P5 — Motoren er vokabularie-uafhængig.**

Motoren omdanner tekst til rækker med etiket og tal. Kategoritildeling er en separat funktion der kan skiftes ud uden at røre motoren.

Det gør det muligt at bygge motoren nu og koble den til canonical bagefter, uden dobbeltarbejde.

---

## 3. De tre lag

**Etiketten** er medlemmets eget navn. "Notion". Bevares ordret, altid. Kan aldrig gå tabt, uanset om noget kan klassificeres.

**Det kanoniske felt** er `admin_costs` — nøjagtig det felt rapporten også lander på. Må være tomt.

**Gruppen** udledes af det kanoniske felt og findes allerede i `budgetTemplates.ts:227-236`.

### Hvorfor canonical og ikke en kontoplan

Der findes ingen fælles dansk kontoplan. Kodens egne range-tabeller beviser det: Dinero har `2000-2999 = cogs` og `5000-5999 = facility_costs` (`dkDineroResultatopgoerelseCsvV1.ts:47-58`); e-conomic har `2200-2299 = loenninger` og `5000-5099 = anlaegsaktiver` (`dkEconomicSaldobalanceXlsxV1.ts:59-80`). Samme numre, forskellig betydning. Adskillelsen bæres af kilde-fingerprintet.

Men der findes allerede ét fælles vokabularium: `CanonicalMetrics` i `_shared/canonicalTypes.ts:27-60`, 32 felter, med filhovedet *"Single source of truth for all financial report normalization."*

Otte skabeloner med hvert sit lokale vokabularium normaliserer allerede ind i det sæt via `KF_TO_CANONICAL`, `SEMANTIC_TO_CANONICAL`, `CLASS_TO_CANONICAL` og fortegnsprofilerne. Budget er bare aldrig blevet koblet på.

Opgaven er derfor ikke at opfinde et vokabularium, men at give budget den samme oversættelse de otte skabeloner allerede har. Budget mod faktisk bliver eksakt ved konstruktion, fordi begge sider lander på samme felt — og `REPORT_FIELD_TO_BUDGET_KEYS` (`budgetEngine.ts:268-281`) med sine dokumenterede huller kan slettes frem for udbygges.

De 29 enum-nøgler og `generate-budget-from-accounts`' frie snake_case-nøgler dør begge.

---

## 4. Hvad motoren skal kunne

Ren funktion, ingen database, ingen AI. Testet før nogen flade bygges. Samme mønster som `canonicalEngine`, `budgetEngine`, `opgaveEngine`.

1. **Find tabelgrænser.** Hvor begynder datatabellen, hvor slutter den, og indeholder filen flere tabeller. Remm-filen har et KPI-resumé i linje 4-15 og en månedstabel fra linje 17.
2. **Detektér tal-konvention** pr. fil, ikke pr. celle (P4). Rapportér hvilken konvention der blev valgt, så det kan vises og overstyres.
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
| Periode-gaten, `extract-financial-data/index.ts:1561-1599` | Igangværende måned → `status: "error"` | Advarsel, ikke afvisning. Medlemmet må gerne uploade en delvis måned hvis de vil |
| Budget-enum, `import-budget-excel/index.ts:170-202` | 29 faste værdier, alt andet → `andet` | Fri etiket + valgfrit canonical-felt |
| `HbBudgetEditTable.tsx:450` | Slette-knap kun på `manual_`-rækker | Enhver række kan slettes |

AI-værnet på kendte kilder bevares. Bekymringen er rigtig: AI må ikke digte tal på formater vi burde kunne læse præcist. Ændringen er at fallbacken bliver et gitter i stedet for en blindgyde.

---

## 6. Åbne spørgsmål

**6.1 Hvorfor er 54 rapporter rettet i hånden, når kun 29 blev flaget?**

To læsninger. Enten fanger valideringen problemerne — 53 FAIL mod 54 overrides passer mistænkeligt godt — og medlemmerne retter det systemet selv markerede. Eller også siger systemet PASS, og medlemmerne opdager selv at tallene er forkerte.

Den første er acceptabel. Den anden betyder at et grønt flueben ikke kan stoles på, hvilket er værre end en tydelig fejl.

**Skal måles før parseren røres.** Overlap mellem `validation_status = 'FAIL'` og `manual_normalized_data is not null`.

**6.2 Hvad sker der med de 84 eksisterende kategorier hos 14 virksomheder?**

De skal mappes én gang til canonical. Om det sker automatisk eller med medlemmets bekræftelse, er ikke besluttet. Samme klasse som B9 i opgave-modellen.

**6.3 Hvordan matches budgetlinje mod rapportlinje ved nedboring?**

Rapportsiden gemmer allerede linjeniveau i `normalized_data.raw_lines`, som ingen læser (§7.2). Materialet findes. Men linjenavne matcher sjældent ordret på tværs af budget og bogføring, så matchningen bliver aldrig perfekt, og fladen skal sige det ærligt — samme dom som `budgetEngine.ts:266-267` allerede har truffet.

**6.4 Hvad med de 13 virksomheder der aldrig har uploadet?**

Kan ikke ses i data. Nogle af dem har måske prøvet og givet op før en række blev skrevet. Bør genbesøges når importen virker — de 15 aktiverings-sager i `RAEKKEFOELGE.md` er formentlig delvist blokerede frem for frafaldne.

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

---

## 8. Rækkefølge inden for sporet

**Spor 1 — motoren og de døde ender.** Vokabularie-uafhængigt. Motoren (§4), gitteret som fælles landingsflade (P2), slette-knappen, de fem døde ender (§5). Måling af 6.1 først.

**Spor 2 — canonical-koblingen.** Budget mapper til `CanonicalMetrics`. `REPORT_FIELD_TO_BUDGET_KEYS` slettes. De 84 eksisterende kategorier mappes.

**Spor 3 — nedboring.** Budgetlinje mod rapportlinje, når 6.3 er besvaret.

Motoren ved intet om kategorier, så spor 1 skal ikke laves om når spor 2 kommer.

---

## 9. Hvad der ikke er besluttet

Datamodel for etiket og canonical-felt på `budget_targets`, UI for gitteret, RLS. Dette dokument beslutter **principper og form**, ikke implementering.
