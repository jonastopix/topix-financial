# Boardroom Score (0–1000) og tal-streak — design og motor

**Skrevet 30. september 2026.** Første gamification-skive for MEDLEMMERNE,
valgt af Jonas ud fra idélisten (`docs/analyser-30-09/gamification-analyse.md`):

> «Boardroom Score (0–1000): virksomhedens helbredstal ud fra likviditet,
> vækst, indtjening og disciplin — som en kreditvurdering, man kan jagte, og
> altid med hvad der løfter scoren mest lige nu» og «Tal-streak: godkendte
> månedstal før den 10. i måneden, en flammetæller, der ikke må gå ud.»

Jonas' ramme: «Folk er konkurrencemennesker … noget at jagte … visuelt
overskueligt og spændende.» B2B-tone, aldrig barnlig. **Ingen rangliste
mellem navngivne virksomheder** (BACKLOG 13/8 står ved magt: scoren er
medlemmets egen, mod sig selv).

**Skiven er MOTOR FØR FLADE.** Denne PR bærer designet (dette dokument),
den rene motor `src/lib/boardroomScore/` med tests, og én hook
`src/hooks/useBoardroomScore.ts`, der læser eksisterende tabeller med
medlemmets egen RLS. Ingen migration, ingen flade. §7 siger, hvad fladen
mangler.

---

## 1. Grundlaget — hvad vi HAR at regne på

Alt regnes på `financial_report_facts` (én række pr. virksomhed pr.
`period_key`, canonical-nøgler i `metrics`), og KUN på rækker med
`data_basis = 'measured'`. Estimater (årsregnskabet delt på 12, baseline)
er pr. data-basis-kontrakten ikke måneder og indgår aldrig — hverken i
tallene eller i disciplinen (`docs/data-basis-kontrakt.md`).

| Søjle | Nøgler (canonical) | Findes de i månedstal? |
|---|---|---|
| Likviditet | `cash` (bank), omkostningerne via `omkostningerIAlt(CANONICAL)` | `cash` kun når rapporten bærer balancen — mange saldobalancer gør; PDF-resultatopgørelser gør ikke. **Ikke målt i prod** hvor mange rækker der har `cash`; motoren siger «ikke nok data» når den mangler. |
| Indtjening | `revenue`, `ebt` (ellers `ebtRegnet(gross_profit, m, CANONICAL)`) | Ja — omsætning og resultat er kernen i hver rapport. |
| Vækst | `revenue` over 12+ måneder | Ja, når historikken er der. |
| Disciplin | `period_key`, `data_basis`, `created_at`, `committed_at`; `budget_targets` (findes for året?), `kpi_targets` (findes mindst ét mål?) | Ja. |

**Alle omkostningssummer går gennem `src/lib/omkostningsnoegler.ts`**
(husets regel, 17/9): motoren har ingen lokal liste. Omkostninger er
positive; `sumOmkostninger` tager `|beløb|`.

**Tidspunkter.** `committed_at` er SENESTE godkendelse — `commit_report_facts`
overskriver den ved gen-godkendelse (migration `20260317200420`, linje 275;
`gamification-analyse.md` §1.4 pkt. 8). `created_at` er rækkens fødsel og
bevæger sig aldrig. Streaken bruger derfor `created_at` som «første
godkendelse» (§4). Kendt unøjagtighed, sagt højt: er rækken født som
estimat (årsrapport /12) og senere erstattet af en målt rapport (kun muligt
når den gamle rapport er slettet — kollisionsværnet i `commit_report_facts`),
er `created_at` estimatets fødsel og dermed for TIDLIG. Fejlen går kun til
medlemmets fordel (en måned tæller som rettidig, som måske ikke var det) og
kan ikke tabe en streak. Skal den lukkes, kræver det en kolonne
`foerst_maalt_at` sat i `commit_report_facts` — en migration af en
SECURITY DEFINER-funktion (FORBIDDEN uden grønt lys), derfor ikke i denne
skive.

**Tid er dansk.** Måneden «nu», afsluttede måneder og fristerne regnes i
`Europe/Copenhagen` gennem `maanedsnoegle.ts` og `hverdage.ts` — ingen ny
tidszonelogik. Tiden gives ind som `nu` (husets mønster: «en periode, der
ikke er gået, er ikke en periode»).

---

## 2. Scoren — fire søjler á 250 point

| Søjle | Max | Måler | Vindue |
|---|---|---|---|
| Likviditet | 250 | Måneders runway: bank ÷ gennemsnitlig månedlig omkostning | Bank = seneste målte række med `cash`; omkostninger = de seneste 3 målte afsluttede måneder med omkostninger |
| Indtjening | 250 | Resultatmargin: Σ resultat ÷ Σ omsætning | De seneste 3 målte afsluttede måneder (mindst 2) |
| Vækst | 250 | Omsætningsvækst: Σ seneste 3 mod Σ samme 3 måneder året før (sæsonrobust); ellers mod de 3 måneder før (mærket) | Kræver 3 målte i vinduet og 3 målte i sammenligningen |
| Disciplin | 250 | Rytme (150) + rettidighed (50) + budget for året (25) + mindst ét mål (25) | De seneste 6 måneder, hvis frist (§4) er passeret — dog tidligst første hele måned efter kontraktstart |

**Ligevægt er et valg, ikke en måling.** Der findes ingen kalibrering
(hvilken vægt forudsiger hvad); lige vægte er det eneste, der ikke påstår
noget. Vægtene er konstanter (`SOEJLE_MAX`) og kan flyttes af Jonas.

**Alle kurver er stykkevis lineære gennem knæk** (`kurve.ts:interpoler`),
mættet i begge ender — et ekstremt tal giver aldrig mere end 250 eller
mindre end 0, og en outlier kan ikke vælte scoren.

### 2.1 Likviditet

```
runway = bank / gennemsnit(omkostningerIAlt pr. måned over de seneste ≤ 3 målte afsluttede måneder med omkostninger)
```

Knæk (måneder → point): 0 → 0 · 1 → 50 · 3 → 150 · 6 → 225 · 9 → 250.
Begrundelse: under én måneds omkostninger i banken er en virksomhed én
dårlig måned fra problemer; tre måneder er den klassiske tommelfingerregel
for en SMV; over ni måneder er der ikke mere likviditetstryghed at hente,
og pengene bør arbejde. Negativ bank (kassekredit trukket) → 0 point —
det er stadig 0 måneders runway, uanset om der findes en kreditramme (vi
kender ikke rammen).

«Ikke nok data» når: ingen målt række har `cash`; ingen af de tre måneder
har en omkostningspost (`fundet = 0`); eller gennemsnittet er 0.

Bankrækken må være ÆLDRE end omkostningsvinduet (samme regel som «Din
måned»s bankRow); dommen bærer `bankKey`, så fladen kan sige «bank pr.
juli».

### 2.2 Indtjening

```
margin = Σ resultat / Σ omsætning   over de seneste ≤ 3 målte afsluttede måneder med begge tal (mindst 2)
resultat = ebt hvis målt, ellers ebtRegnet(gross_profit, metrics, CANONICAL)
```

Summer, ikke gennemsnit af marginer: en måned med lille omsætning og stort
udsving skal ikke veje som en normal måned. Knæk (margin → point):
−20 % → 0 · 0 % → 100 · 5 % → 160 · 10 % → 200 · 20 % → 250. Nulpunktet
(break-even) giver 100, ikke 0: en virksomhed, der løber rundt, er ikke
i bund. «Ikke nok data» når Σ omsætning ≤ 0 eller færre end 2 måneder.

### 2.3 Vækst

```
nu   = Σ omsætning, de seneste 3 målte afsluttede måneder (alle tre skal være målt)
før  = Σ omsætning, samme tre måneder året før (alle tre målt)          ← «aar_til_aar»
       ellers Σ de tre måneder umiddelbart før vinduet (alle tre målt)  ← «kvartal_til_kvartal», mærket
vaekst = (nu − før) / før
```

Knæk (vækst → point): −20 % → 0 · 0 % → 125 · +10 % → 190 · +25 % → 250.
«Ikke nok data» når vinduet eller sammenligningen ikke er komplet (tre
målte), eller `før < VAEKST_MIN_GRUNDLAG_KR` (10.000 kr. over tre
måneder — fra en lille base bliver enhver ændring en procentbombe).
Kvartal-mod-kvartal er sæsonfølsom; dommen bærer `sammenligning`, så
fladen kan sige «mod forrige kvartal (sæson kan spille ind)».

### 2.4 Disciplin

Den ENESTE søjle, hvor fravær tæller — fordi fraværet ER adfærden. Vinduet
er de seneste 6 måneder, hvis FRIST er passeret (§4) — en måned, der stadig
kan godkendes til tiden, tæller hverken for eller imod — afgrænset af
kontraktstarten: første tællende måned er den første HELE måned efter
`companies.contract_start_date` (et medlem, der kom 25/9, dømmes ikke på
september). Uden kontraktstart: ingen afgrænsning.

```
rytme        = 150 × (målte måneder i vinduet / måneder i vinduet)
rettidighed  =  50 × (målte måneder godkendt senest fristen / målte måneder i vinduet)   — 0 når ingen målt
budget       =  25 hvis budget_targets har mindst én værdirække i base-scenariet for indeværende år (period «YYYY-base-idx»)
maal         =  25 hvis kpi_targets har mindst én række
```

«Ikke nok data» når vinduet er tomt (kontraktstart så ny, at ingen hel
måneds frist er passeret).

### 2.5 Samlet score

```
score = round( Σ point(søjler med data) / Σ max(søjler med data) × 1000 )
daekning = Σ max(søjler med data) / 1000
```

Færre end 2 søjler med data → **scoren er null** («ikke nok data»), og
dommen siger, hvad der mangler. Manglende data straffes aldrig; de
resterende søjler skaleres op, og `daekning` viser, hvor stor en del af
grundlaget scoren hviler på — fladen skal vise den (fx «bygget på 3 af 4
søjler»). En score på 750 med to søjler er ikke det samme som 750 med fire.

### 2.6 Stabilitet

- Alle tal er 3-måneders-summer eller -gennemsnit; én skæv måned flytter
  højst en tredjedel.
- Kurverne er mættede: over/under knækkene sker der intet.
- `forrige` = samme dom med `nu` flyttet én måned tilbage på de samme
  rækker (kun rækker med `key` før den måned). Fladen kan sige «op fra
  612» — uden at noget gemmes. Ingen glidende dæmpning derudover: en
  dæmpning uden lager ville være uærlig (den ville skulle gættes forfra
  ved hver indlæsning).

---

## 3. «Hvad løfter mest nu» — marginal effekt → én handling

Dommen regner for hver søjle ÉN konkret, opnåelig handling og dens
pointgevinst (`handlinger`), og vælger den største som `loefterMest`
(lige på: disciplin først — det er adfærd, medlemmet kan gøre i dag, så
likviditet, indtjening, vækst).

| Søjle | Handling | Point regnes som |
|---|---|---|
| Disciplin | «Godkend {åben måned} senest {frist}» når den åbne måned mangler; ellers «Godkend {måned} — måneden mangler» for den seneste med passeret frist; ellers «Læg et budget for {år}» / «Sæt dit første mål» | Dommen kørt igen med handlingen simuleret (måneden målt og rettidig; budget/mål = true) − dommen uden. For den åbne måned regnes begge sider ved fristens udløb, så gevinsten er det, der står på spil. Kun disciplinsøjlen simuleres; de tre tal-søjler holdes som nu. Simuleringen, ikke en tabel: så tallet er sandt, når vinduet flytter. null når scoren ikke findes på nogen af siderne. |
| Likviditet | «Én måneds omkostninger mere i banken ({beløb})» | point(runway + 1) − point(runway) |
| Indtjening | «Ét procentpoint mere i resultatmargin» | point(margin + 0,01) − point(margin) |
| Vækst | «Fem procent mere omsætning end sammenligningen» | point(vækst + 0,05) − point(vækst) |

Søjler uden data får handlingen «Upload en rapport med bank/…» med gevinst
= null (kan ikke regnes), og vælges kun, når ingen søjle med data har en
gevinst > 0. Gevinsten oversættes til samlet score gennem samme skalering
som §2.5.

---

## 4. Tal-streak — reglen præcist

**Én måned tæller som «godkendt til tiden», når:**

1. Perioden `P` (YYYY-MM) har en række med `data_basis = 'measured'`, og
2. rækkens `created_at` (første godkendelse, §1) er ≤ `frist(P)`.

**Fristen** `frist(P)` = udgangen (23:59:59,999 dansk tid) af den 10. i
måneden efter `P` — «senest den 10.» (Jonas' ord «før den 10.» tolkes
inklusivt; en frist kl. 00:00 den 10. ville ingen forstå). Falder den 10.
på en lørdag, søndag, dansk helligdag eller en af husets lukkedage
(`hverdage.ts:erHverdagDato`), rykkes fristen til udgangen af den næste
hverdag — aldrig den anden vej. Konstanterne: `STREAK_FRIST_DAG = 10`.

Regnestykke: `frist(2026-09)` = 10/10-2026 er en lørdag → næste hverdag er
mandag 12/10 → fristen er 12/10-2026 kl. 23:59:59,999 dansk tid =
`kbhTilUtc("2026-10-13", 0, 0) − 1 ms`.

**Streaken** tælles baglæns fra den seneste måned, hvis frist er passeret:

```
laengde = 0
for P fra seneste måned med passeret frist, bagud:
    hvis P < første tællende måned (kontraktstart): stop         (frysning ved start)
    hvis P er godkendt til tiden: laengde += 1
    ellers: stop
hvis den ÅBNE måned (frist ikke passeret) allerede er godkendt til tiden: laengde += 1
```

Den åbne måned kan kun lægge til — den bryder aldrig. Streaken vokser
altså i det øjeblik, medlemmet godkender, og siger ikke «brudt» før
fristen er passeret.

**Status:** `aktiv` (laengde > 0 og seneste passerede frist holdt, eller
den åbne måned er godkendt), `brudt` (laengde 0, men der FINDES en målt
måned — flammen gik ud) og `ingen` (aldrig en målt måned: der er ikke
noget at bryde). Dommen bærer også den næste frist (måned + tidspunkt +
hverdage til fristen), og `bedste` (længste streak nogensinde i rækkerne),
så fladen kan vise «din bedste: 7».

**Gen-godkendelse:** ligegyldig — kun `created_at` læses. En rapport, der
erstattes («Erstat gammel data»), beholder rækken og dermed datoen.

**Frysning:** kun ved kontraktstart (måneder før første hele måned efter
start tæller ikke og bryder ikke). Ingen «frys-kort» eller købt nåde: en
streak, der kan repareres, er ikke en streak. Vil Jonas have en nåde (fx
én glemt måned pr. år), er det ét knæk i `streak.ts` og en test.

---

## 5. Risici — sagt højt

1. **Tallene kan være forkerte.** Rimelighedstjekket (`rimelighed.ts`)
   kører ved godkendelsen og ved manuel rettelse, og kontrolsummen
   (`udaekket`) siger, når omkostningsbilledet er ufuldstændigt — men
   begge kan overtrumfes («Ja, tallene er rigtige — godkend alligevel»).
   Scoren stoler på de godkendte tal. En ufuldstændig omkostningsliste
   giver for HØJ runway og for HØJ margin; et manglende `cash` giver
   «ikke nok data», ikke en forkert score. Fladen bør vise `udaekket`-linjen
   ved scoren, når den findes (motoren tager ikke quality_signals ind i
   denne skive — det er en flade-beslutning, §7).
2. **Scoren må ikke belønne forkerte ting.** Disciplin belønner
   HANDLINGEN godkend, ikke uploadet — men ikke kvaliteten. Rettidighed
   kan opnås ved at godkende en halvfærdig rapport den 9. og rette den
   den 20.: `created_at` står. Modvægt: rettidighed er kun 50 af 1000, og
   rytmen (150) kræver, at måneden findes overhovedet. Vækst belønner
   omsætning, ikke lønsom omsætning — derfor vejer indtjening lige så
   meget. Likviditet belønner en stor bank, som kan være lånt — vi ser
   ikke gælden månedligt (`debt_total` er sjælden). Sagt højt i fladen:
   «Scoren er et helbredstal, ikke en kreditvurdering» (ordet fra idélisten
   er en metafor).
3. **Følsomhed.** Én måned flytter højst ⅓ af en 3-måneders-sum; knækkene
   er mættede. Størst følsomhed: vækst fra lille base (loft
   `VAEKST_MIN_GRUNDLAG_KR`) og runway, når omkostningerne er små (en
   holdingvirksomhed med 2.000 kr. i omkostninger og 200.000 i banken har
   100 måneders runway → 250, korrekt men intetsigende; fladen bør vise
   tallet bag).
4. **Nye medlemmer** ser «ikke nok data» i 2–3 måneder på indtjening/
   vækst, og disciplinen starter ved første hele måned. Vækst kræver 6
   målte måneder (kvartal) eller 15 (år). Det er rigtigt frem for et
   opdigtet tal; fladen skal sige, hvad den næste rapport låser op.
5. **Sæson.** År-mod-år er sæsonrobust; kvartal-mod-kvartal er det ikke og
   mærkes. Indtjening og likviditet regnes over 3 måneder og er
   sæsonpåvirkede — et ferieselskab i november scorer lavt på indtjening.
   Accepteret: scoren er «nu», og `forrige` viser retningen.
6. **Ingen sammenligning med andre.** Medlemmet kan ikke se andres facts
   (RLS), og motoren kender ingen. Et anonymt «dig mod huset» kræver en ny
   sikkerhedsflade (gamification-analyse M4) og er bevidst IKKE med.
7. **Fravær som straf, kun i disciplin.** Alle andre søjler siger «ikke nok
   data». En medlem, der aldrig har uploadet, får disciplin 0 (hvis
   vinduet findes) og score null — og handlingen «Godkend august».

---

## 6. Motoren — filer og kontrakter

```
src/lib/boardroomScore/
  kurve.ts      interpoler(knaek, x) — stykkevis lineær, mættet
  soejler.ts    likviditet · indtjening · vaekst · disciplin — hver en ren dom
  streak.ts     frist(P) · streakDom(...)
  score.ts      boardroomScore(grundlag, nu) — samlet + forrige + loefterMest
  index.ts      re-eksport
  __tests__/    kurve · soejler · streak · score
src/hooks/useBoardroomScore.ts   læser facts, kontraktstart, budget-år, mål — medlemmets RLS
```

Inddata (`ScoreGrundlag`): `maaneder[]` (`key`, `basis`, `foersteGodkendtAt`,
`metrics` canonical), `kontraktStart` (YYYY-MM-DD | null),
`harBudgetForAaret`, `harMaal`. Alt andet regnes.

Alle regnestykker står som kommentarer ved koden (husets regel: «regnestykker
skrives ud»).

---

## 7. Hvad der mangler til fladen (næste skive)

- Et kort på medlemmets forside (mellem «Din måned» og planen): tallet,
  fire søjler som hairline-barer med point, `daekning`-linjen,
  «Løfter mest nu»-sætningen som handling (link til /reports, /budget,
  /kpis), streaken som tal med «næste frist: 12/10» — og retning mod
  `forrige` i ord (husets «Din måned»-mønster: ingen procent, ingen
  farve-skam).
- `udaekket`-linjen ved scoren, når seneste rapports kontrolsum er stor.
- En klokke/mail før fristen («Du har 3 hverdage til at holde din streak»)
  — «et signal, kun en browser kan vise, er ikke et signal». Kræver en
  Bucket B-cron og hverdags-reglen; kan bygge på `send-report-reminder`.
- Måling FØR bygning af fladen (regel 4a): hvor mange virksomheder har
  `cash` i målte rækker (likviditetssøjlens dækning), og fordelingen af
  streak-længder — SQL i `docs/analyser-30-09/gamification-analyse.md`
  sektion 6 giver rytmen; `cash` skal måles særskilt.
- Beslutninger til Jonas: vægtene (lige nu 250 × 4), fristen inklusiv den
  10., ingen nåde i streaken, negativ bank = 0.
