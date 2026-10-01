# Boardroom Score (0–1000) og tal-streak — design og motor

**Skrevet 30. september 2026.** Første gamification-skive for MEDLEMMERNE,
valgt af Jonas ud fra idélisten (`docs/analyser-30-09/gamification-analyse.md`):

> «Boardroom Score (0–1000): virksomhedens helbredstal ud fra likviditet,
> vækst, indtjening og disciplin — som en kreditvurdering, man kan jagte, og
> altid med hvad der løfter scoren mest lige nu» og «Tal-streak: godkendte
> månedstal før den 10. i måneden, en flammetæller, der ikke må gå ud.»

**Fristen er flyttet til den 20. (Jonas 30/9-2026 20:43):** «påmindelserne
med rapportering [kører] med deadline d. 20. i måneden efter. Mere hvis
Boardroom Score skal passe til det.» Scoren følger nu samme frist som
`send-report-reminder` (`REMINDER_DAYS = [7, 15, 20]`). Se §4.

**Opskaleringen er droppet (Jonas 1/10-2026 11:29: «drop opskaleringen»):**
en søjle uden data giver 0 point; scoren er Σ point over alle fire søjler.
Se §2.5 — den gamle regel står der, markeret som afløst.

Jonas' ramme: «Folk er konkurrencemennesker … noget at jagte … visuelt
overskueligt og spændende.» B2B-tone, aldrig barnlig. **Ingen rangliste
mellem navngivne virksomheder** (BACKLOG 13/8 står ved magt: scoren er
medlemmets egen, mod sig selv).

**Skiven er MOTOR FØR FLADE.** Denne PR bærer designet (dette dokument),
den rene motor `src/lib/boardroomScore/` med tests, én hook
`src/hooks/useBoardroomScore.ts`, der læser med medlemmets egen RLS, og ÉN
tilføjende migration (`20260930130000_maaned_foerste_godkendelse.sql`, §4a
— hukommelsen om første godkendelse). Ingen flade. §7 siger, hvad fladen
mangler.

**Rettet efter det tekniske råds dom «RET FØRST» (30/9-2026, otte fund):**
§4a (streaken straffede en rettelse), §2.4 (første tællende måned uden
kontraktstart), §2.0 (friskhed), §2.6 (`forrige`), §2.1 (kontantforbrug,
ikke afskrivninger), §4 (kontraktstart den 1.), §6 (uret i hooken) og
CLAUDE.md (afsnittet om motoren). Hvert fund står ved sit afsnit.

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
| Disciplin | `period_key`, `data_basis`, `created_at`, hukommelsen `maaned_foerste_godkendelse` (§4a); `budget_targets` (findes for året?), `kpi_targets` (findes mindst ét mål?) | Ja. |

**Alle omkostningssummer går gennem `src/lib/omkostningsnoegler.ts`**
(husets regel, 17/9): motoren har ingen lokal liste. Omkostninger er
positive; `sumOmkostninger` tager `|beløb|`.

**Tidspunkter.** `committed_at` er SENESTE godkendelse — `commit_report_facts`
overskriver den ved gen-godkendelse (migration `20260317200420`, linje 275;
`gamification-analyse.md` §1.4 pkt. 8) og læses aldrig. `created_at` er
rækkens fødsel — men rækken DØR ved en rettelse: «Erstat gammel data»
(`ReportReviewDialog.handleReplace`) soft-sletter den gamle rapport,
triggeren `cleanup_facts_on_report_delete` (migration `20260326142338`)
sletter facts-rækken, og `commit_report_facts` indsætter en NY med
`created_at = now()`; permanent sletning (`RapporteringView`, klient-DELETE
på facts) det samme. `created_at` alene gjorde derfor en rettet gammel måned
«for sen» (rådets fund 1). **Første godkendelse er nu hukommelsen
`maaned_foerste_godkendelse` (§4a), og rækkens `created_at` kun som fallback
— den tidligste af de to** (`streak.ts:tidligsteGodkendelse`). Den «kendte
unøjagtighed» fra første udkast (en række født som estimat og senere målt
fik estimatets fødsel som godkendelse) er lukket af samme migration:
triggeren skriver tidspunktet, når rækken BLIVER målt (`data_basis` →
`measured`), ikke når den fødes.

**Tid er dansk.** Måneden «nu», afsluttede måneder og fristerne regnes i
`Europe/Copenhagen` gennem `maanedsnoegle.ts` og `hverdage.ts` — ingen ny
tidszonelogik. Tiden gives ind som `nu` (husets mønster: «en periode, der
ikke er gået, er ikke en periode»).

---

## 2. Scoren — fire søjler á 250 point

### 2.0 Friskhed — en score «nu» regnes ikke på gamle tal

De tre tal-søjler (likviditet, indtjening, vækst) kræver, at deres seneste
måned ligger inden for **`FRISKHED_MAANEDER` = 6 måneder op til den seneste
måned med passeret frist** (§4) — ellers «ikke nok data» (rådets fund 3).
Regnestykke (`soejler.ts:aeldsteFriskeMaaned`):

```
aeldsteFrisk = senesteMaanedMedPasseretFrist(nu) − (FRISKHED_MAANEDER − 1)
30/9-2026: august er seneste passerede frist → marts er ældste friske måned
```

For likviditet gælder reglen BÅDE banktallet (`bankKey`) og den seneste
omkostningsmåned; for indtjening den seneste måned med omsætning og resultat;
for vækst vinduets seneste måned. Grunden i dommen nævner måneden («Det
seneste banktal er fra 2026-02 — ældre end 6 måneder»). Uden reglen ville et
medlem, der stoppede med at rapportere for et år siden, stå med en pæn score
på tal, der ikke længere siger noget — og disciplinsøjlen alene ville bære
fraværet.

| Søjle | Max | Måler | Vindue |
|---|---|---|---|
| Likviditet | 250 | Måneders runway: bank ÷ gennemsnitligt månedligt kontantforbrug | Bank = seneste målte række med `cash`; kontantforbrug = de seneste 3 målte afsluttede måneder med kontantforbrug — begge friske (§2.0) |
| Indtjening | 250 | Resultatmargin: Σ resultat ÷ Σ omsætning | De seneste 3 målte afsluttede måneder (mindst 2), seneste frisk (§2.0) |
| Vækst | 250 | Omsætningsvækst: Σ seneste 3 mod Σ samme 3 måneder året før (sæsonrobust); ellers mod de 3 måneder før (mærket) | Kræver 3 målte i vinduet (seneste frisk, §2.0) og 3 målte i sammenligningen |
| Disciplin | 250 | Rytme (150) + rettidighed (50) + budget for året (25) + mindst ét mål (25) | De seneste 6 måneder, hvis frist (§4) er passeret — dog tidligst den første tællende måned (§2.4) |

**Ligevægt er et valg, ikke en måling.** Der findes ingen kalibrering
(hvilken vægt forudsiger hvad); lige vægte er det eneste, der ikke påstår
noget. Vægtene er konstanter (`SOEJLE_MAX`) og kan flyttes af Jonas.

**Alle kurver er stykkevis lineære gennem knæk** (`kurve.ts:interpoler`),
mættet i begge ender — et ekstremt tal giver aldrig mere end 250 eller
mindre end 0, og en outlier kan ikke vælte scoren.

### 2.1 Likviditet

```
kontantforbrug(måned) = Σ|vareforbrug + drift| (omfanget «vareforbrug_og_drift» i omkostningsnoegler.ts) + |finansielle omkostninger| (CANONICAL.finans)
runway = bank / gennemsnit(kontantforbrug pr. måned over de seneste ≤ 3 målte afsluttede måneder med kontantforbrug)
```

**Afskrivninger tæller IKKE** (rådets fund 5): runway er «hvor mange måneder
kan banken betale», og en afskrivning er en regnskabspost, ikke penge ud.
Vareforbrug, drift og renter er det. Nøglerne kommer stadig fra
`omkostningsnoegler.ts` (`soejler.ts:kontantforbrug` — ingen lokal liste).

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
måned»s bankRow) — men aldrig ældre end friskhedsgrænsen (§2.0); dommen
bærer `bankKey`, så fladen kan sige «bank pr. juli».

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
kan godkendes til tiden, tæller hverken for eller imod — afgrænset af den
**første tællende måned** (`streak.ts:foersteTaellendeMaaned`):

- Med `companies.contract_start_date`: den første HELE måned som medlem —
  startmåneden selv, når starten er den 1. (rådets fund 6: en kontrakt fra
  1/6 gør juni hel), ellers måneden efter (et medlem, der kom 25/9, dømmes
  ikke på september).
- Uden kontraktstart (rådets fund 2): **måneden efter den tidligste første
  godkendelse** blandt de målte måneder, i dansk tid — den første måned, der
  er afsluttet, mens medlemmet beviseligt var med. Et medlem, hvis tidligste
  godkendelse er 5/6 (majs tal), tælles fra juli; maj og juni tæller hverken
  for eller imod. Uden nogen godkendelse: ingen afgrænsning (fraværet er
  adfærden, og der er intet at afgrænse fra).

Samme grænse fryser streaken bagud (§4). Kontraktstart vinder altid over
godkendelserne — sæt den, hvor den mangler, så dommen ikke skal gætte.

```
rytme        = 150 × (målte måneder i vinduet / måneder i vinduet)
rettidighed  =  50 × (målte måneder godkendt senest fristen / målte måneder i vinduet)   — 0 når ingen målt
budget       =  25 hvis budget_targets har mindst én værdirække i base-scenariet for indeværende år (period «YYYY-base-idx»)
maal         =  25 hvis kpi_targets har mindst én række
```

«Ikke nok data» når vinduet er tomt (starten så ny, at ingen hel måneds
frist er passeret).

### 2.5 Samlet score

**Gældende regel (1/10-2026, Jonas 11:29: «drop opskaleringen»):**

```
score    = round( Σ point(søjler med data) / Σ max(ALLE fire søjler) × 1000 )
         = round( Σ point(søjler med data) )        fordi Σ max = 4 × 250 = 1000
daekning = Σ max(søjler med data) / 1000
```

En søjle uden data giver **0 point**. Færre end 2 søjler med data →
**scoren er null** («ikke nok data»), og dommen siger, hvad der mangler.
`daekning` står uændret, men betyder nu «X søjler kan give point»; fladens
linje hedder derfor «X af 4 søjler giver point endnu» (rettet 1/10 efter
rådets fund — «Bygget på X af 4 søjler» lød som den gamle opskalering). De
øvrige står på kortet som «—», og deres handling siger «Låser en søjle op».

**Målt i drift 1/10 — Brilleværk:** indtjening 250/250, disciplin 150/250,
likviditet uden banktal, vækst uden sammenligning.

```
gammel regel: (250 + 150) / (250 + 250) × 1000 = 400 / 500 × 1000 = 800
ny regel:      250 + 150 + 0 + 0                                   = 400
```

**Begrundelsen.** Opskaleringen belønnede huller og straffede ærlighed:
lagde Brilleværk banktallet ind, og gav likviditeten fx 100 point, faldt
scoren fra 800 til (250 + 150 + 100) / 750 × 1000 = 667. En score, der
falder, fordi man giver os flere tal, lærer medlemmet at holde tal tilbage.
Med den nye regel går en søjle fra 0 til ≥ 0 point, når den får data, så
**mere data kan kun løfte tallet** (prøvet udtømmende i
`score.test.ts`, «egenskab: at lægge en søjle til kan aldrig sænke
scoren»). Prisen: et nyt medlem med to søjler står lavt (højst 500), indtil
de øvrige tal er der — det er sandt, og kortet siger hvorfor («2 af 4
søjler giver point endnu» + søjlerne med «—»).

**`MIN_SOEJLER_MED_DATA` = 2 bevares** (ikke ændret). Uden opskalering er
den ikke længere et værn mod et oppustet tal, men den værner stadig mod et
tal, der ikke er et helbredstal: med én søjle ville scoren for et nyt
medlem typisk være disciplin alene (0–250, ofte 0 — «0 af 1000» som første
indtryk er en anklage, ikke en måling, jf. §5 pkt. 7). Overgangen fra 1 til
2 søjler er null → tal, aldrig et fald, så reglen bryder ikke «mere data kan
kun løfte».

**`forrige`** regnes med samme `samlet()` og dermed samme regel; intet er
gemt, så retningen sammenligner aldrig en ny score med en gammel,
opskaleret.

**Afløst regel (30/9-2026 → 1/10-2026), bevaret som historik:**

```
score = round( Σ point(søjler med data) / Σ max(søjler med data) × 1000 )
daekning = Σ max(søjler med data) / 1000
```

~~Færre end 2 søjler med data → scoren er null («ikke nok data»), og
dommen siger, hvad der mangler. Manglende data straffes aldrig; de
resterende søjler skaleres op, og `daekning` viser, hvor stor en del af
grundlaget scoren hviler på — fladen skal vise den (fx «bygget på 3 af 4
søjler»). En score på 750 med to søjler er ikke det samme som 750 med fire.~~

### 2.6 Stabilitet

- Alle tal er 3-måneders-summer eller -gennemsnit; én skæv måned flytter
  højst en tredjedel.
- Kurverne er mættede: over/under knækkene sker der intet.
- `forrige` = samme dom med `nu` flyttet én måned tilbage på de måneder,
  der DA var godkendt: `score.ts:grundlagPaa` beholder kun rækker med
  første godkendelse ≤ det tidligere tidspunkt (rådets fund 4; en række
  uden kendt godkendelse var der ikke). En måned godkendt 15/9 påvirker
  ikke «forrige» set 30/8 — retningen er den, medlemmet faktisk gik.
  Fladen kan sige «op fra 612» — uden at noget gemmes. **Begrænsning:**
  `budget_targets` og `kpi_targets` bærer intet tidspunkt i grundlaget
  (kun «findes der?»), så budget- og målpoint regnes som NU også i
  `forrige`; et budget lagt i går kan derfor ikke ses som en stigning. Og
  en erstattet måneds TAL er de nuværende, mens godkendelsen er den første
  (§4a) — rettelser bagud ser ud, som om de altid var der. Ingen glidende
  dæmpning derudover: en dæmpning uden lager ville være uærlig (den ville
  skulle gættes forfra ved hver indlæsning).

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
= null (kan ikke regnes). `loefterMest` vælger den kun, når ingen søjle med
data har en gevinst > 0; listen «Hvad løfter dit tal» (`loefterMitTal`)
lægger HØJST ÉN af dem bagest, når der er en ledig plads (se nedenfor). Gevinsten oversættes til samlet score gennem samme skalering
som §2.5 — efter 1/10 er det 1:1 (et point i en søjle er et point i
scoren).

**Efter 1/10 (ingen opskalering) har en handling, der låser en søjle op, en
REEL gevinst** (søjlen går fra 0 til sine point). Den regnes stadig ikke:
point afhænger af tal, vi ikke har (bankbeløbet, marginen, væksten), og
alle tre kurver starter i 0, så den eneste sande nedre grænse er 0 —
«mindst +0» siger intet. Gevinsten forbliver null, og fladen siger «Låser
en søjle op». **LØST 1/10 (rådets fund, grenen `fix/score-uden-opskalering`):**
`loefterMitTal` viste kun en oplåsende handling, når INGEN handling havde en
regnet gevinst > 0. Før 1/10 var det rigtigt (oplåsning kunne sænke scoren);
efter 1/10 skjulte det fx Brilleværks «Upload en rapport med banksaldo» (op
til 250 point) bag en disciplin-gevinst på +25. Reglen nu: de regnede først
(størst gevinst, højst 3), og er der en ledig plads, HØJST ÉN oplåsende
handling bagest — den første i motorens rækkefølge (én, fordi de alle peger
på den samme næste rapport). Første element er stadig `loefterMest`
(urørt). Prøvet i `loefter.test.ts` (Brilleværk-tilfældet mod motoren) og
`scoreKort.test.ts`.

---

## 4. Tal-streak — reglen præcist

**Én måned tæller som «godkendt til tiden», når:**

1. Perioden `P` (YYYY-MM) har en række med `data_basis = 'measured'`, og
2. månedens FØRSTE godkendelse (§4a: hukommelsen, ellers rækkens
   `created_at` — den tidligste) er ≤ `frist(P)`.

**Fristen** `frist(P)` = udgangen (23:59:59,999 dansk tid) af den **20.** i
måneden efter `P` — «senest den 20.», inklusiv. Falder den 20. på en lørdag,
søndag, dansk helligdag eller en af husets lukkedage
(`hverdage.ts:erHverdagDato`), rykkes fristen til udgangen af den næste
hverdag — aldrig den anden vej. Konstanten: `STREAK_FRIST_DAG = 20`
(`streak.ts`) — ÉN konstant bærer streaken, disciplin-søjlens rettidighed
(§2.4: `erGodkendtTilTiden` → `frist`), friskheden (§2.0:
`aeldsteFriskeMaaned` → `senesteMaanedMedPasseretFrist`) og løfterens
«Godkend <måned> senest <dato>» (§3: `fristDato`).

**Hvorfor den 20. (rettet 30/9-2026 aften):** skiven valgte først den 10.
(Jonas' idéliste: «før den 10.»). Men platformens påmindelser
(`send-report-reminder`, `REMINDER_DAYS = [7, 15, 20]`: venlig den 7.,
presserende den 15., kritisk den 20.) slutter den 20. — to frister for samme
handling er én for mange. Jonas 30/9 20:43: «deadline d. 20. i måneden
efter. Mere hvis Boardroom Score skal passe til det.» Ændres
påmindelsesdagene, ændres `STREAK_FRIST_DAG` i samme PR — kildeværnet
`boardroomScoreFlade.guard` dom 9 fælder, hvis det SIDSTE element i
`REMINDER_DAYS` ikke er lig `STREAK_FRIST_DAG`.

**Rettet (rådets gennemsyn af #1189):** en tidligere version af afsnittet
ovenfor påstod, at påmindelserne «har altid sagt den 20.». Det er forkert.
Målt i koden (`send-report-reminder/index.ts`, 30/9-2026): ingen af mailene
nævner en dato. Den 20. er blot den DAG, den sidste mail går, og den mail
kalder dagen **forsinket**: emne «Vigtigt: {{period}}-rapport er nu
forsinket», overskrift «Vigtigt: rapporten er forsinket», intro «vi mangler
fortsat din rapport for {{period}}. Upload den hurtigst muligt.»
(`urgencyLevel = "critical"` for `dayOfMonth >= 20`). Er DB-skabelonen
«Rapport-påmindelse (kritisk)» slået til, bruges dens emne og krop i stedet
— den tekst har jeg ikke målt. (Godkend- og manuel-varianten har ingen
forsinket-tekst; de bruger ikke DB-skabelonerne.)

**ÅBENT punkt til Jonas (30/9-2026):** mailen den 20. kalder dagen
«forsinket», mens kortet samme dag siger «senest i dag» («Næste frist:
september senest 20/10 (i dag)» — fristen er inklusiv, `hverdageTil = 0`). Et medlem, der godkender den 20.,
har holdt streaken — og har samme morgen fået at vide, at rapporten er
forsinket. Mailteksten er IKKE ændret i #1189; det kræver en beslutning:
(a) den kritiske mail siger «sidste frist i dag» den 20. og «forsinket» først
efter, eller (b) den sidste påmindelse flyttes, og `STREAK_FRIST_DAG` følger
med (dom 9). Den kritiske DB-skabelons tekst skal måles i prod før (a).

**Målt i prod 30/9-2026** (SELECT; målte måneder med passeret frist i
ikke-demo-kundevirksomheder; første godkendelse = tidligste af hukommelsen
og `created_at`; fristen rykket over weekend, IKKE over helligdage i
målingen): af **178** måneder i 19 virksomheder var **13 (7,3 %)** rettidige
med den 10. og **33 (18,5 %)** med den 20. Kun de **tællende** måneder
(efter måneden efter virksomhedens første godkendelse — historik uploadet
ved start tæller ikke, §2.4): **27** måneder i 7 virksomheder, **9 (33 %)**
med den 10., **17 (63 %)** med den 20.; median 15 dage efter periodens
udløb. De 178 er domineret af bagudfyldt historik, som aldrig kunne være
rettidig.

Regnestykker (2026):
- `frist(2026-09)`: 20/10-2026 er en **tirsdag** → fristen står: 20/10 kl.
  23:59:59,999 dansk tid (CEST) = `kbhTilUtc("2026-10-21", 0, 0) − 1 ms` =
  `2026-10-20T21:59:59.999Z`.
- `frist(2026-08)`: 20/9-2026 er en **søndag** → mandag 21/9 →
  `2026-09-21T21:59:59.999Z`.
- `frist(2026-05)`: 20/6-2026 er en **lørdag** → mandag 22/6.
- `frist(2025-03)`: 20/4-2025 er påskedag, 21/4 2. påskedag → tirsdag 22/4.

**Streaken** tælles baglæns fra den seneste måned, hvis frist er passeret:

```
laengde = 0
for P fra seneste måned med passeret frist, bagud:
    hvis P < første tællende måned (§2.4): stop                  (frysning ved start)
    hvis P er godkendt til tiden: laengde += 1
    ellers: stop
hvis den ÅBNE måned (frist ikke passeret) allerede er godkendt til tiden: laengde += 1
```

Den åbne måned kan kun lægge til — den bryder aldrig. Streaken vokser
altså i det øjeblik, medlemmet godkender, og siger ikke «brudt» før
fristen er passeret.

**Status:** `aktiv` (laengde > 0 og seneste passerede frist holdt, eller
den åbne måned er godkendt), `brudt` (laengde 0, men der FINDES en målt
TÆLLENDE måned med passeret frist — `første tællende ≤ P ≤ seneste
passerede` — flammen gik ud) og `ingen` (ingen sådan måned: der er ikke
noget at bryde). **Rettet 30/9 (rådets fund 1):** før krævede `brudt` kun
«en målt måned findes» — et nyt medlem (start 20/8, august uploadet →
første tællende måned september, ingen tællende frist passeret) fik
«Streaken er brudt», fordi augusts række ligger FØR medlemskabet. En
frossen måned (§2.4) kan hverken tælle, bryde eller tænde en flamme, der
kan gå ud (test i `streak.test.ts`). Dommen bærer også den næste frist (måned + tidspunkt +
hverdage til fristen), og `bedste` (længste streak nogensinde i rækkerne),
så fladen kan vise «din bedste: 7».

**Gen-godkendelse:** ligegyldig — `committed_at` læses aldrig.
**Rettelse («Erstat gammel data») og permanent sletning:** ligegyldige for
en måned, der én gang var rettidig — hukommelsen (§4a) står. En måned, der
første gang blev målt FOR SENT, bliver ikke rettidig af en rettelse:
hukommelsen giver ingen nåde, kun sandheden om den første gang. Slettes en
måned permanent uden at blive erstattet, mangler den — og et hul bryder.

**Frysning:** kun ved den første tællende måned (§2.4: kontraktstart den 1.
= samme måned, ellers måneden efter; uden kontraktstart måneden efter den
tidligste godkendelse — måneder før tæller ikke og bryder ikke). Ingen
«frys-kort» eller købt nåde: en streak, der kan repareres, er ikke en
streak. Vil Jonas have en nåde (fx én glemt måned pr. år), er det ét knæk
i `streak.ts` og en test.

### 4a. Hukommelsen om første godkendelse — `maaned_foerste_godkendelse`

**Fundet (rådet, fund 1 — HØJ):** `created_at` overlever ikke en rettelse.
«Erstat gammel data» soft-sletter rapporten → `cleanup_facts_on_report_delete`
sletter facts-rækken → `commit_report_facts` indsætter en ny med
`created_at = now()`. Permanent sletning ligeså. En rettet gammel måned blev
«for sen», og streaken straffede den, der rettede en fejl.

**Reglen:** en måned, der én gang er talt rettidig, forbliver rettidig.

**Kilden:** migration `20260930130000_maaned_foerste_godkendelse.sql` — KUN
TILFØJENDE. Tabellen `maaned_foerste_godkendelse (company_id, period_key,
foerst_godkendt_at)`, én række pr. måned pr. virksomhed, skrevet af
triggeren `trigger_husk_foerste_godkendelse` (AFTER INSERT OR UPDATE OF
`data_basis` ON `financial_report_facts`), når en række BLIVER målt;
`ON CONFLICT DO NOTHING` — den første står. Ingen DELETE-trigger:
hukommelsen overlever facts-rækkens død. Ingen klient-skrivning (kun
SELECT-policies: medlemmet sin egen virksomhed, rådgivere alle); UPDATE
afvises for alle roller af `trigger_protect_maaned_foerste_godkendelse`.
Bagudfyldt med de målte rækkers `created_at` (for måneder rettet FØR
migrationen er den oprindelige dato tabt — fejlen går kun til medlemmets
ugunst dér, og hooken tager den tidligste af hukommelsen og `created_at`).
Ingen eksisterende SECURITY DEFINER-funktion er rørt; trigger-funktionen
`husk_foerste_godkendelse` er NY og SECURITY DEFINER (`search_path =
public`, EXECUTE trukket fra PUBLIC/anon/authenticated) af samme grund som
`cleanup_facts_on_report_delete`: en facts-skrivning må aldrig væltes af RLS
på hukommelsen. Den indsætter kun i denne ene tabel.

**Hvorfor ikke «tidligste rapport, også soft-slettede»:** `financial_reports`
har ingen `period_key` (nøglen udledes i `commit_report_facts` af
`manual_report_period_key` eller `parse_dk_report_period_key(report_period)`
— en SQL-funktion uden TypeScript-spejl), permanent sletning fjerner
rapportrækken (kilden dør med facts-rækken), og om medlemmets SELECT-policy
dækker soft-slettede rækker er IKKE målt i prod (papirkurven læses kun som
rådgiver). Hukommelsen er den kilde, der overlever begge veje.

**SQL, der måler om triggeren er i drift** (Lovable SQL editor, ét
resultatsæt):

```sql
SELECT 'trigger i drift' AS sektion,
       coalesce((SELECT tgenabled::text FROM pg_trigger
                  WHERE tgrelid = 'public.financial_report_facts'::regclass
                    AND tgname = 'trigger_husk_foerste_godkendelse'), 'MANGLER') AS svar
UNION ALL
SELECT 'protect-trigger',
       coalesce((SELECT tgenabled::text FROM pg_trigger
                  WHERE tgrelid = 'public.maaned_foerste_godkendelse'::regclass
                    AND tgname = 'trigger_protect_maaned_foerste_godkendelse'), 'MANGLER')
UNION ALL
SELECT 'maalte facts', (SELECT count(*) FROM public.financial_report_facts WHERE data_basis = 'measured')::text
UNION ALL
SELECT 'hukommelse rækker', coalesce((SELECT count(*)::text FROM public.maaned_foerste_godkendelse), 'null');
```

`tgenabled = O` («origin») = slået til; `MANGLER` = migrationen er ikke kørt.
**Beviset for driften er en kørsel, ikke kataloget:** godkend en måned, mål
rækken i hukommelsen (`SELECT period_key, foerst_godkendt_at FROM
public.maaned_foerste_godkendelse WHERE company_id = '<virksomhed>' ORDER BY
period_key DESC LIMIT 3;`), erstat samme måned, mål igen — `foerst_godkendt_at`
må ikke flytte sig, mens `financial_report_facts.created_at` er ny:

```sql
SELECT f.period_key, f.created_at, h.foerst_godkendt_at
FROM public.financial_report_facts f
JOIN public.maaned_foerste_godkendelse h USING (company_id, period_key)
WHERE f.company_id = '<virksomhed>' AND f.period_key = '<YYYY-MM>';
```

Testen «ERSTATTET EFTER FRISTEN» i `streak.test.ts` holder motorens side:
hukommelse 5/9 + ny række 20/9 → rettidig; uden hukommelsen → for sen.

**Rækkefølgen ved udrulning (CLAUDE.md «Nye migrations»):** migrationen KØRT
i prod og målt udefra (`GET /rest/v1/maaned_foerste_godkendelse?select=period_key&limit=0`
med anon-nøglen → 200) FØR nogen flade, der bruger hooken, får Update.
Hooken svarer `{ tilstand: "afventer_migration" }` på en manglende tabel
(PGRST205/42P01), og kortet står roligt «på vej» — ingen score regnet uden
hukommelsen. Enhver ANDEN fejl kaster `HentningsFejl` (en fejl er ikke «ingen tal»).

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
   den 20.: den første godkendelse står (§4a — og det er meningen: en
   rettelse må aldrig straffes). Modvægt: rettidighed er kun 50 af 1000, og
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
   vækst, og disciplinen starter ved den første tællende måned (§2.4).
   Vækst kræver 6 målte måneder (kvartal) eller 15 (år). Det er rigtigt
   frem for et opdigtet tal; fladen skal sige, hvad den næste rapport
   låser op. **Medlemmer, der er holdt op med at rapportere,** ser efter 6
   måneder «ikke nok data» på tal-søjlerne (§2.0) — scoren dør med tallene,
   frem for at leve videre på dem.
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
   **Rettet 1/10-2026:** en søjle uden data giver nu 0 point i den samlede
   score (§2.5) — fraværet koster point, men straffes ikke i SØJLEN (den
   viser «—», ikke 0/250), og mere data kan kun løfte tallet.

---

## 6. Motoren — filer og kontrakter

```
src/lib/boardroomScore/
  kurve.ts      interpoler(knaek, x) — stykkevis lineær, mættet
  soejler.ts    likviditet · indtjening · vaekst · disciplin — hver en ren dom; kontantforbrug · aeldsteFriskeMaaned
  streak.ts     frist(P) · streakDom(...) · tidligsteGodkendelse · foersteTaellendeMaaned
  score.ts      boardroomScore(grundlag, nu) — samlet + forrige (grundlagPaa) + loefterMest
  index.ts      re-eksport
  __tests__/    kurve · soejler · streak · score
src/hooks/useBoardroomScore.ts   læser facts + hukommelsen (§4a), kontraktstart, budget-år, mål — medlemmets RLS
supabase/migrations/20260930130000_maaned_foerste_godkendelse.sql   hukommelsen (§4a) — tilføjende
```

Inddata (`ScoreGrundlag`): `maaneder[]` (`key`, `basis`, `foersteGodkendtAt`
= tidligste af hukommelsen og `created_at`, `metrics` canonical),
`kontraktStart` (YYYY-MM-DD | null), `harBudgetForAaret`, `harMaal`. Alt
andet regnes.

**Uret i hooken (rådets fund 7):** dommen afhænger af `nu` (frister, den
åbne måned, friskhed). Grundlaget genhentes hvert 5. minut
(`refetchInterval`), og `nu` er en `useState`, der tikker hvert minut og
står i `useMemo`-afhængighederne — så status skifter hen over en frist
(21/10 kl. 00:00) uden genindlæsning.

Alle regnestykker står som kommentarer ved koden (husets regel: «regnestykker
skrives ud»).

---

## 7. Hvad der mangler til fladen (næste skive)

**Bygget 30/9-2026 (grenen `feat/boardroom-score-flade`, oven på denne):**
kortet på medlemmets forside — `components/hjemmebane/boardroom/ScoreKort.tsx`,
ordene i `lib/hjemmebane/scoreKort.ts`, «Hvad løfter dit tal» som den rene
dom `boardroomScore/loefter.ts:loefterMitTal` (1–3 handlinger med størst
REGNET gevinst, ved lige disciplin → likviditet → indtjening → vækst; på en
ledig plads højst én handling, der låser op, bagest (1/10, §3); første =
`loefterMest`).
Placeringen: egen sektion i fuld bredde under toppens grid og over «Din
plan» — toppens to kolonner (Jonas «A på alle», 17/9) er urørt. Hooken
svarer `afventer_migration` (roligt «på vej») i stedet for at kaste, når
`maaned_foerste_godkendelse` ikke findes (PGRST205/42P01,
`lib/manglendeTabel.ts`); enhver anden fejl kaster stadig. **Rådgiverens
tal på virksomhedskortet er IKKE bygget:** dette dokument placerer det
ikke — det kræver en beslutning.

**Rådets gennemsyn af fladen (30/9, motoren kørt på fem scenarier, rettet i
samme PR):** (1) `brudt` for et nyt medlem — rettet i DOMMEN (§4 ovenfor);
(2) «+400 point» under «Ikke nok tal endnu» → uden score siger en regnet
gevinst «Giver dig din første score» (`effektTekst`); (3) «Låser en søjle op»
kun, når søjlen mangler data — ellers «Tæller med i din score»; (4) tallet
blinkede endeligt → 0 → optælling — før første ramme vises 0; (5) uden
score vises disciplinens «0 af 6 måneder godkendt» ikke; (6) en løfter-linje
uden link (motorens «mere i banken/margin/omsætning») mærkes «Mål» —
rækkefølgen er stadig motorens størst-gevinst-først, så første linje =
`loefterMest` (at sortere links først ville sætte en mindre gevinst over en
større under «Hvad løfter dit tal»); (7) kortets egen «Din score» er fjernet
(sektionens eyebrow «Boardroom Score» står), og søjlernes detaljetekst vises
først fra `sm`. `udaekket`-linjen og klokken før fristen
er stadig åbne (herunder).

**Kompakt kort (30/9-2026 aften, grenen `feat/score-kompakt`; Jonas 20:43:
«Boardroom Score sektionen er meget stor på forsiden. Måske en smule mere
kompakt, og måske også lidt mere interessant at kigge på»; målt 669–760 px
høj på 1440 px):** ét kort i én række. Til venstre scoren som tal i en
tynd RING — en SVG-bue i skala 0–1000 (`scoreKort.ts:ringBue`: omkreds =
2π × 54, bue = omkreds × score/1000), som tæller op sammen med tallet og står
straks under `prefers-reduced-motion`; retning og dækning i små linjer under.
Til højre de fire søjler som små vandrette barer (navn + point/250, 2 × 2 på
mobil, 4 i række fra `lg`), streaken som ÉN linje med flammen («7 måneder i
træk · Næste frist: september senest 20/10 (14 hverdage)») og KUN den
øverste løfter (= `loefterMest`) som én linje med link. Resten — løfter nr.
2–3, søjlernes tal i ord, streakens status og bedste — ligger bag «Se hvad
der tæller» (lukket som standard, `aria-expanded` + `aria-controls`,
synlig fokusring). Forbeholdet står ved knappen. Uden score står ringen tom
(kun sporet) med «Ikke nok tal endnu» i samme ramme. Regnet højde på
desktop i hvile ≈ 260 px (p-6 48 + ringkolonnen ≈ 168 + bunden ≈ 48; den
højre kolonne ≈ 130 er lavere end ringen). Rådets krav fra #1178 står:
ingen «+N point» uden score, «Mål»-mærket, skærmlæserteksten — og den står
INDE i ringens `relative`-boks. Kildeværn `boardroomScoreFlade.guard` dom 7
(kun øverste løfter i hvile, knappen) og dom 8 (sr-only i positioneret
forfader, buen af `ringBue`).

- Et kort på medlemmets forside (mellem «Din måned» og planen): tallet,
  fire søjler som hairline-barer med point, `daekning`-linjen,
  «Løfter mest nu»-sætningen som handling (link til /reports, /budget,
  /kpis), streaken som tal med «næste frist: 20/10» — og retning mod
  `forrige` i ord (husets «Din måned»-mønster: ingen procent, ingen
  farve-skam).
- `udaekket`-linjen ved scoren, når seneste rapports kontrolsum er stor.
- En klokke/mail før fristen («Du har 3 hverdage til at holde din streak»)
  — «et signal, kun en browser kan vise, er ikke et signal». Kræver en
  Bucket B-cron og hverdags-reglen; kan bygge på `send-report-reminder`.
- Migrationen `20260930130000` KØRT i prod og målt (§4a) — FØR nogen flade
  får Update.
- `companies.contract_start_date` sat på alle aktive virksomheder, så
  «første tællende måned» ikke skal udledes af godkendelserne (§2.4).
- Måling FØR bygning af fladen (regel 4a): hvor mange virksomheder har
  `cash` i målte rækker (likviditetssøjlens dækning), og fordelingen af
  streak-længder — SQL i `docs/analyser-30-09/gamification-analyse.md`
  sektion 6 giver rytmen; `cash` skal måles særskilt.
- Beslutninger til Jonas: vægtene (lige nu 250 × 4), ~~fristen inklusiv den
  10.~~ **løst 30/9 20:43: den 20., som påmindelserne (§4)**, ingen nåde i streaken, negativ bank = 0, friskhed 6 måneder (§2.0),
  afskrivninger ude af runway (§2.1). **ÅBENT:** den kritiske påmindelse den
  20. siger «forsinket», mens kortet siger «senest i dag» (§4, «ÅBENT punkt
  til Jonas»).

**Rådets gennemsyn af #1189 (rettet i samme PR):** (1) uden streak (længde 0
— nyt medlem eller brudt) er streaklinjen statussen selv («Godkend dine tal
senest den 20. og start din streak» / «Streaken er brudt — næste frist
starter en ny») med næste frist, aldrig «0 måneder i træk» med grå flamme;
statussen gentages da ikke i detaljerne (`streakKortLinje` → `erStatus`).
(2) Kildeværnet dom 9: sidste `REMINDER_DAYS` = `STREAK_FRIST_DAG`.
(3) Skelettet har kortets opbygning (ringkolonne, fire barer, streaklinje,
løfter, bundlinje) i stedet for en fast `min-h-[200px]`. (4) §4's påstand om
påmindelsernes dato er rettet til det målte.

**Designgennemsynet efter drift (1/10-2026 ~02, kortet set live som medlem
via «Visning som», desktop 1440 og mobil 375; uafhængig design-/UX-agent):**
(1) Løfterens disciplintekst er «Upload og godkend {måned} …» — kortet bad
om at godkende en måned, der ikke var uploadet. (2) Statussen uden streak er
«Ingen streak endnu» (`STREAK_INGEN_TEKST`) — før sagde kortet «senest den
20.» tre gange på 60 px (status, fristlinje, løfter); fristen står i
fristlinjen, handlingen i løfteren. (3) Retningen («Op fra …/Ned fra … for en
måned siden») vises først fra 30/10-2026 (`RETNING_VISES_FRA`): `forrige`
regnes baglæns på data, ingen har set som tal, og «Op fra 0» (Brick Works:
alle fire søjler stod på 0 i marts) var et artefakt. (4) Disciplin med 0
godkendte måneder: «Ingen godkendte måneder i de seneste 6 endnu», ikke «0
af 6 … 0 til tiden». (5) Mobil: søjlenavnet «INDTJENING» blev afkortet —
mindre mellemrum og sporing under `sm`. Chattens «Formater:» i 9 px er fjernet
(under designsprogets mindste mikrolabel). **SENERE (ikke rettet):** løfteren
peger på den åbne måned, mens «Dit næste skridt» peger på den ældste manglende
— to handlinger på samme forside (fund 1, én stemme); grunden til en søjle på
0 står kun bag «Se hvad der tæller»; chatlisten er ikke bundforankret; mobilens
tomme avatar-cirkel. **Data:** Brick Works' april 2026 (godkendt 17/9) har løn
28.003 mod 475.373 i marts og resultat 1.258.469 på omsætning 1.349.013 — det
ligner en ufuldstændig rapport, og den bærer indtjeningssøjlens 188 point.

## Trofæer (1/10-2026)

**Hvad:** milepæle. IKKE et tal og IKKE Boardroom Score; kortet siger det i én linje (`TROFAE_FORKLARING`: «Milepæle, du har nået. Din Boardroom Score ovenfor er dit helbredstal lige nu.»). Dommen er «det tidligste tidspunkt, betingelsen var opfyldt» i de data, der står NU — intet gemmes, så et trofæ kan forsvinde, hvis data slettes (en tråd, et mål sat tilbage, budgettet slettet) eller medlemskabet udløber (RLS skjuler community). Derfor lover kortet ikke «for altid» (rådets fund M1, 1/10). Fejler hentningen, vises kortet slet ikke (M2: en fejl må ikke ligne nul trofæer).

**Jonas' regler (1/10):** intet trofæ giver fordel til størrelse — motoren læser kun TIDSPUNKTER og hvem der skrev hvad, aldrig omsætning, beløb eller antal ansatte (kildeværn). «Månedens point/sparring» bygges IKKE nu (Jonas taler med Morten) — ordene point, præmie og «månedens» må ikke stå i fladerne (kildeværn).

**Motoren:** `src/lib/gamification/trofaeer.ts` (ren). Otte trofæer:

| id | Titel | Opnået når | Kilde |
|---|---|---|---|
| `foerste_maaned` | Første måned på plads | tidligste første godkendelse af en MÅLT måned | scorens måneder (facts + `maaned_foerste_godkendelse`) |
| `tre_til_tiden` | Tre måneder i træk | tre sammenhængende tællende måneder godkendt til tiden; dato = den tredjes første godkendelse | streak-motorens `erGodkendtTilTiden`/`foersteTaellendeMaaned`/`naesteMaaned` — regner ikke selv en frist |
| `seks_til_tiden` | Et halvt år i træk | som ovenfor, seks | samme |
| `foerste_maal` | Første mål nået | tidligste `milestones.completed_at` med status `completed` | milestones (company-scoped RLS) |
| `foerste_budget` | Budgettet er lagt | tidligste `budget_targets.created_at` i et base-scenarie (`%-base-%`) | budget_targets (kun `created_at`/`period` læses) |
| `foerste_refleksion` | Første refleksion | tidligste `pulse_checkins.created_at` | pulse_checkins |
| `foerste_opslag` | Første opslag | tidligste aktive `community_traade` skrevet af virksomhedens egne brugere | community_traade |
| `hjalp_et_medlem` | Hjalp et andet medlem | tidligste aktive svar fra virksomhedens brugere i en tråd, hvis forfatter HVERKEN er virksomhedens egen bruger ELLER en rådgiver/tjenestekonto (`erHjaelpTilEtAndetMedlem`) | community_svar + trådens forfatter; rådgiverne = `get_all_advisor_profiles` ∪ `tjenestekonti` som ROLLE (står på `tjenestekonto.guard`s liste) |

**Ikke med:** «deltog i en live session» — `event_registrations` er tilmeldinger, ikke fremmøde; platformen har intet fremmøde for medlemmernes events (målt i `types.ts` 1/10). En tilmelding er ikke en deltagelse.

**Fladerne:** medlemmets «Dine trofæer» (`components/hjemmebane/boardroom/TrofaeKort.tsx`) lige under Score-kortet i samme sektion; 1 kolonne under sm, 2 fra sm, 4 fra md (to kolonner på 375 px brækkede trofænavne midt i ordet); /engagement er stablede kort under sm og tabel fra sm; fail-soft (fejl → kortet står roligt uden trofæer). Hentningen `hooks/trofaeer.ts:hentMedlemmetsTrofaeGrundlag` henter KUN egne data (virksomhedens id eller egne brugere — kildeværn) og genbruger scorens måneder. Rådgivernes `/engagement` (AdvisorRoute, menupunkt efter «Virksomheder»): én række pr. kundevirksomhed — score, streak, trofæer (antal, titler i `title`), seneste aktivitet — sorterbar, hentet i ét batch (`hentEngagement`, `hentAlleSider`, ingen kald pr. virksomhed). Universet: ikke slettet, ikke demo, ikke legat, ikke gæst (`vis_i_netvaerk = false`), aktiv/status-løs og `er_kunde`. **Ingen rangliste mellem virksomheder for medlemmerne** — sorteringen er rådgivernes arbejdsliste og vises aldrig til et medlem.

**Målene på /engagement** (1/10-2026, designpapiret om «Dine mål»; rettet samme dag efter det tekniske råds fund R1, R2, B3, B4, B5, K8, K9): to kolonner mere, sorterbare og på mobilens kort (2-kolonne-grid) — «Aktive mål» (antal, hvor `afgoerMilepael(...).aktiv`, samme regel som «Din plan»; det rigtige tal, ikke klemt til 3) og «Sidst rørt» (danske kalenderdage siden menneskets seneste bevægelse på et AKTIVT mål: max(`milestones.progress_updated_at`, `milestones.created_at`, skridtets `accepted_at` når sat, `closed_at` for skridt med status done/not_done/dropped, og `created_at` KUN for et skridt uden `accepted_at` med `source_type = 'manual'` og status ≠ proposed/dismissed); «i dag» / «for 1 dag siden» / «for N dage siden», «—» uden aktive mål). **R1-valget:** intet felt ud over `source_type` skiller sikkert medlemmets egne skridt fra forslag — `proposed_by` er også rådgiverens id (`foreslaa-opgave/index.ts:223`) og NULL for agent/ugens fokus (migration `20260822220000:64`); `'manual'` er medlemmets vej (`skridt-tilfoej/index.ts:184`), som også sætter `accepted_at` (`:188`), så created_at-grenen dækker kun ældre `'manual'`-rækker. Et taget forslag tæller på `accepted_at` (`opgave-accepter/index.ts:144`), aldrig på agentens `created_at`. **Hentningen:** `company_actions` kun med status active/done/not_done/dropped/expired (`STATUSSER_I_HENTNINGEN` — expired for accepten på en udløbet opgave); `milestones` kun for universets virksomheder (`company_id IN` i bidder á 200) — ikke et statusfilter, fordi PostgREST's `not.in` taber mål med status null. **Sorteringen** af «Sidst rørt»: aktive mål uden registreret bevægelse er de mest stagnerede (øverst ved faldende); «ingen aktive mål» (og hentefejl) står altid nederst, uanset retning (forklaret i kolonnens `title`). Ren dom i `lib/hjemmebane/engagementMaal.ts`, hentet i samme batch (`hentEngagement`, `hentAlleSider`) men fail-soft: fejler `milestones`/`company_actions` — eller er mållæsningen TOM (kundevirksomheder, 0 målrækker, ingen fejl: en tom læsning er ikke «0») — står kolonnerne med «—» og siden med én rolig linje («Prøv igen» 44 px).

**Værn:** `src/lib/gamification/__tests__/trofaeer.test.ts` (hvert trofæ opnås/opnås ikke; svar på en rådgivers opslag giver ikke «hjalp») og `trofaeer.guard.test.ts` (ingen størrelsesord i motoren, ingen point/præmie/«månedens» i fladerne, medlemmets hentning kun egne data).

**Umålt (1/10):** at `get_all_advisor_profiles` kan kaldes af et medlem i drift (funktionen har intet rolle-tjek i migrationen, og medlemmets «Dine rådgivere» bruger den — men der er ikke målt i prod); at rådgiverens SELECT dækker `kpi_targets`/`budget_targets`/`financial_report_facts` for alle virksomheder (policies ikke gennemgået for den læsning). Fejler en af dem, står `/engagement` med fejlteksten og medlemmets kort roligt uden trofæer.
