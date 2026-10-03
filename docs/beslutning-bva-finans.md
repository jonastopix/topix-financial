# Beslutningsnotat: finans, ekstraordinære og sekundære poster i «Omk. total» og BVA

*3/10-2026, gren `fix/manuel-rettelse-noegler`, kort `g03-budget-finans-som-omkostning`. Kun målt og beskrevet: der er ingen kode i dette notat. Beslutningen er Jonas'.*

Alle tal er målt i prod 3/10 med SELECT (`financial_report_facts`, `budget_targets`). Hele kroner.

## 1. Hvad fladerne regner i dag (kodelæst 3/10, efter #1275)

| Flade | Realiseret omkostning | Budgetteret omkostning |
|---|---|---|
| Dine tal, «Omk. total» (`calcTotalExpenses` = `omkostningerIAlt(kf, DANSK)`) | vareforbrug + drift (8 nøgler) + afskrivninger. **Finans er ude**, fordi `DANSK.finans` er `null`. | — |
| BVA, månedsgrafen «EBITDA» (`HbBudgetBva.actualEbitda` / `computeEbitda`) | omsætning − (vareforbrug + drift − andre driftsindtægter). **Ingen afskrivninger og ingen finans.** | omsætning − Σ\|ALLE rækker uden for «indtaegter»\|: vareforbrug, drift, **afskrivninger, finansudgifter, finansindtægter, ekstraordinære udgifter og indtægter, sekundære udgifter og indtægter**. |
| BVA, kortene «Omkostninger» og «EBITDA» (`totalBudgetCosts`, `totalActualCosts`) | som grafen, summeret over de måneder, der HAR tal | Σ\|alle ikke-indtægtsrækker\| over **alle 12 måneder** |

Der er tre skævheder:
1. **Budgettets indtægter tælles som omkostning.** Linjer som `finansieringsindtaegter`, `ekstraordinaere_indtaegter` og `sekundaere_indtaegter` har ingen `__group__`-markør. De lander derfor i «variable» (`budgetEngine.ts`, extraCategories), og beregningen tager `Math.abs`.
2. **Budgettets «EBITDA» indeholder poster, som den realiserede side ikke har.** Det gælder afskrivninger, finans, ekstraordinære og sekundære poster.
3. **Kortene sammenligner budgettet for HELE året med de realiserede tal for året til dato.** Den skævhed er ikke en del af dette kort, men den er fundet her, og den gør kortenes «afvigelse» meningsløs før december. Den er ikke rettet.

## 2. Hvem det rammer (målt 3/10)

**Budgetlinjer uden for drift i et `-base-`-budget:**

| Virksomhed | Kategori | Kr./år |
|---|---|---:|
| Warburg (3a429199), 2026 | `finansieringsudgifter` | 61.596 |
| | `finansieringsindtaegter` | 8.232 |
| | `ekstraordinaere_udgifter` | 67.968 |
| | `ekstraordinaere_indtaegter` | 375.672 |
| | `sekundaere_udgifter` | 133.032 |
| | `sekundaere_indtaegter` | 14.280 |
| Topix.dk ApS (gæst), 2026 | `import_finansielle_poster_51` | 318 |

Ingen anden virksomhed har finans-, ekstraordinære eller sekundære budgetlinjer. `betalingsgebyrer` hos 3 virksomheder (45.000 kr.) og de importerede gebyrlinjer er drift og hører ikke under dette kort.

**Warburg 2026, regnestykket.** Budgettets årstal: omsætning 15.202.488 og alle ikke-indtægtsrækker 15.387.516. Heraf er 398.184 indtægter, 362.652 udgifter uden for drift (afskrivninger 100.056, ekstraordinære udgifter 67.968, finansudgifter 61.596, sekundære udgifter 133.032) og 14.626.680 vareforbrug og drift.

| Warburg 2026 | I dag | Kun vareforbrug + drift på begge sider |
|---|---:|---:|
| Kortet «Omkostninger», budget (12 mdr.) | 15.387.516 | 14.626.680 |
| Kortet «EBITDA», budget (12 mdr.) | **−185.028** | **575.808** |
| Grafen jan–aug, budget-EBITDA (Σ 8 mdr.) | −123.352 | 383.872 |
| Grafen jan–aug, realiseret EBITDA (Σ 8 mdr.) | 655.391 | 655.391 |
| Afvigelsen i grafen, jan–aug | +778.743 «bedre end budget» | +271.519 |

Regnestykket for jan–aug:
- **Budget i dag:** 10.134.992 − (9.751.120 + 66.704 + 41.064 + 5.488 + 45.312 + 250.448 + 88.688 + 9.520) = −123.352.
- **Budget, kun drift:** 10.134.992 − 9.751.120 = 383.872.
- **Realiseret:** 11.897.228 − (4.783.813 + 6.497.648 − 39.624) = 655.391. De 6.497.648 er Σ\|8 driftsnøgler\| over facts 2026-01…08, og 39.624 er andre driftsindtægter.

Forskellen på 760.836 kr./år mellem de to budget-EBITDA'er er 398.184 + 362.652: indtægter, der står som omkostning, plus udgifter uden for drift. Hvis indtægterne i stedet blev lagt TIL med fortegn, mens de ikke-drift-udgifter blev stående, ville budget-EBITDA være −185.028 + 2 × 398.184 = 611.340.

**Realiserede finansposter, der i dag er ude af «Omk. total» på Dine tal.** 443.171 kr. finansudgifter fordelt på 58 måneder hos 8 kundevirksomheder:

| Virksomhed | Måneder ≠ 0 | Finansudgifter | «Omk. total» i de måneder | Stigning |
|---|---:|---:|---:|---:|
| Brick Works | 21 | 275.079 | 18.330.015 | +1,5 % |
| Fjeldgaardshop | 8 | 79.744 | 1.466.402 | +5,4 % |
| Warburg | 10 | 59.427 | 14.275.802 | +0,4 % |
| Floren Engros | 8 | 20.190 | 3.045.598 | +0,7 % |
| Capture IT | 4 | 6.510 | 834.692 | +0,8 % |
| Nordic By Hand | 2 | 1.194 | 160.663 | +0,7 % |
| KJ AUTO | 1 | 1.021 | 1.264.516 | +0,1 % |
| Doggybed | 1 | 6 | 15.358 | +0,0 % |

Hertil kommer finansindtægter: Warburg 26.678, Floren 16.848, Topix 458 og Capture IT 220 kr. Tallene er fra facts, alle måneder, `measured`. Ekstraordinære poster i facts er 3 rækker hos Warburg (395.979 kr.), se `m17-ai-skema-grupper` fund 8.

## 3. Valget

**A. «Omk. total» = vareforbrug + drift + afskrivninger (som i dag).** Finans, ekstraordinære og sekundære poster står UNDER driftsresultatet. BVA sammenligner kun drift, og budgettets ikke-driftslinjer tages ud af «Omkostninger»/«EBITDA» eller vises i en egen række «Under driften», med fortegn: indtægt +, udgift −.
- For: EBITDA bliver EBITDA på begge sider. Det matcher Score (indtjening = resultat ÷ omsætning har sin egen vej) og budgetskabelonernes grupper.
- Imod: medlemmet ser ikke renterne i «Omk. total».

**B. «Omk. total» = alle omkostninger (kanonisk `omkostningerIAlt(CANONICAL)`: + finansudgifter).** Dine tal stiger med 0,1–5,4 % for 8 virksomheder (tabellen ovenfor). BVA skal så også have finans på den realiserede side, og budgettets indtægter skal stadig have fortegn.
- For: én definition overalt. Kontrolsummen og Score bruger allerede den kanoniske.
- Imod: «EBITDA» i BVA kan ikke længere hedde EBITDA. Ekstraordinære og sekundære poster har ingen realiseret nøgle (`extraordinary_items` er ikke i `CANONICAL`, fund 8), så sammenligningen bliver alligevel ufuldstændig.

**Uanset A eller B** (ikke en del af valget, men forudsætningen): budgettets **indtægtslinjer må aldrig tælles som omkostning**. Rettelsen er et fortegn pr. budgetkategori (indtægt/udgift) i afkodningen, ikke `Math.abs`. Den rammer i dag kun Warburg (398.184 kr./år).

**Anbefaling (teknisk arkitekt): A.** Begrundelsen: BVA's kort og graf hedder EBITDA, og budgetskabelonernes grupper er driftsgrupper. Finans, ekstraordinære og sekundære poster bør vises som én række under driften med fortegn, så Warburg ser sine 375.672 kr. ekstraordinære indtægter som indtægt. «Omk. total» på Dine tal forbliver drift + afskrivninger og får hjælpeteksten «før renter». Kortenes helårsbudget mod realiseret år til dato (skævhed 3) bør rettes i samme skive, så kortet sammenligner de samme måneder.

**Det, Jonas skal svare på:**
1. A eller B?
2. Skal budgettets ikke-driftslinjer vises som en egen række, eller skjules de i BVA?
3. Skal kortene sammenligne de samme måneder (budget år til dato), eller skal der stå «helår» på dem?
