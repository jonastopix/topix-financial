# Dine mål — målmodellen, tal-målene og sporet (motor 1/10-2026)

**Status:** motoren er bygget (branch `feat/dine-maal-motor`, PR #1223); **fladen er bygget**
(branch `feat/dine-maal-flade`, §8) og afventer merge + Update. Migrationen
`20261001190000_maal_tal.sql` er KØRT i prod (målt FØR/EFTER, REST 200). Designpapiret
(produkt og teknik) ligger som udkast i hovedsessionens scratchpad (`maal-produkt.md` §2,
`maal-teknik.md`) — dette dokument er den del, motoren og fladen bygger på, bogført i repoet.

## Jonas' beslutninger 1/10-2026

- **20:13 — «Foreslå skridt» kræver IKKE et mål.** `maalId` er fortsat valgfrit i chatten
  (designpapiret §4 havde foreslået at skærpe det; det er afvist). Motoren her rører det ikke.
- **21:04 — ja til det nye design af «Dine mål» (/milestones):** ét kort pr. mål (højst tre),
  målet som én sætning, TALLET som det store («1,58 mio. kr. pr. august (godkendt)»), en bane fra
  udgangspunkt til mål med en streg for «hvor I burde være nu», status «På sporet / Bagud /
  Foran» UDLEDT AF TALLENE (aldrig tastet), frist-nedtælling, ÉT næste skridt pr. mål med
  «Gjort», guidet oprettelse i tre trin (hvilket tal/begivenhed → hvor meget og hvornår, med
  «det kræver X pr. måned» → første skridt) og en 12-måneders tidslinje. Skyderen og den blandede
  procent forsvinder (i fladen — motoren her rører ikke den gamle). **«Nået» er fortsat KUN et
  menneskes klik** (`status = 'completed'`, `milepaelDom.erMarkeretNaaet`).
- Målt i prod 1/10 (hovedsessionen): 36 aktive mål hos 14 af 30 kunder, **0 med både måltal og dato.**
- **22:37 — ja til «Jeres retning»:** handoutet «Målsætning 12 mdr.» (`handoutConfig.ts`, modul
  `overordnet`) flytter ind i toppen af Dine mål som TRE spørgsmål (§7).
- **Aften — det tekniske råds fund 1–18 rettet** (commit på `feat/dine-maal-motor`); hvert fund står
  ved sit afsnit herunder med «(fund N)».

## 1. Målmodellen

Et mål er én sætning, ét tal og én dato. To arter (`milestones.art`):

| art | Fremdrift | Krævet ved oprettelse (`doemNytMaal`) |
|---|---|---|
| `tal` | **læses** af godkendte måneder (husets nøgler) — eller tastes (`andet_tal`) | titel · nøgle · måltal · udgangspunkt (≠ måltal) · frist efter i dag; `andet_tal` også en enhed |
| `begivenhed` | skridtene («ansat den første») | titel · frist efter i dag; måltal = 1, udgangspunkt = 0 |
| `NULL` | — | et mål fra før designet: kortets eneste handling er «Gør målet skarpt» |

Kolonnerne (migration `20261001190000`, kun tilføjende): `art`, `maal_noegle`, `udgangspunkt`,
`udgangspunkt_dato` — alle nullable, CHECK på de to ordforråd. Ingen eksisterende række ændres.

## 2. Nøglerne og regnestykkerne (`nuvaerendeTal`)

Kilden er de SAMME målte, afsluttede måneder som Boardroom Score (`data_basis = 'measured'`,
måneden afsluttet i dansk tid; estimater er ikke måneder) — `boardroomScore/soejler.ts:maalteAfsluttede`.
Omkostninger går gennem `omkostningsnoegler.ts`; ingen lokale lister.

| Nøgle | Regnestykke | Enhed |
|---|---|---|
| `omsaetning_aarstakt` | (Σ `revenue` over de seneste 3 målte måneder med omsætning ÷ 3) × 12 | kr. |
| `resultat_aarstakt` | (Σ resultat ÷ 3) × 12; resultat = `ebt`, ellers `ebtRegnet` (Score's `resultatAf`) | kr. |
| `likviditet_mdr` | Score's likviditetssøjle uændret: bank ÷ gennemsnitligt kontantforbrug (vareforbrug + drift + finans, ≤ 3 mdr.; aldrig afskrivninger) | mdr. |
| `db_grad` | 100 × Σ `gross_profit` ÷ Σ `revenue` over de seneste 3 målte måneder med begge — husets definition (`financialUtils.calcDbMargin`: dækningsbidrag ÷ omsætning), vægtet Σ/Σ som Score's indtjening | % |
| `andet_tal` | rækkens eget `current_value` (tastet) | rækkens `unit` |

- **Under 3 målte måneder:** «For få godkendte måneder — tallet kræver 3, der er N.» (likviditeten
  følger Score og kræver én måned med omkostninger).
- **Friskhed:** den seneste måned bag tallet skal være ≥ `aeldsteFriskeMaaned(nu)` (Score: 6
  måneder op til seneste passerede frist). Ellers «mangler» med grunden.
- **Tre SAMMENHÆNGENDE måneder (fund 2):** årstakterne og DB-graden kræver, at de tre seneste
  måneder med tallet er tre kalendermåneder i træk (`erSammenhaengende`, Score's
  `naesteMaaned`-mønster fra væksten). Ellers «mangler» med grunden «De seneste tre måneder hænger
  ikke sammen». Før gav juni + juli + september (august mangler) «gennemsnittet × 12», som lod tre
  spredte måneder ligne et kvartal — og januar 2025 + august + september 2026 ligeså.
  `periodeTekst` forudsætter sammenhæng («juli – september 2026»).
- Tallet bærer `prMaaned` (seneste måned bag tallet) → «pr. august (godkendt)».

## 3. Sporet (`sporet`)

```
start          = udgangspunkt_dato ?? created_at som DANSK dato
slut           = deadline
taltDato       = sidste dag i tallets måned (prMaaned) for et LÆST tal; i dag for et tastet (andet_tal)
forventetAndel = clamp((taltDato − start) ÷ (slut − start), 0, 1)     — danske kalenderdage
andelAfVejen   = (tal − udgangspunkt) ÷ (måltal − udgangspunkt)       — rå, kan være < 0 eller > 1
```

**Datoen bag tallet (fund 1):** tallet og forventningen skal gælde SAMME dag. Et læst tal er
«pr. august» — at holde det op mod, hvor langt vi burde være I DAG, straffer målet for, at
september ikke er godkendt endnu. Eksempel (prøvet i `maalTal.test.ts`): mål oprettet 1/10-2026
med udgangspunkt = årstakten pr. august, frist 1/1-2027 (92 dage); i dag 31/10, tallet stadig pr.
august:

```
med i dag:     forventet = (31/10 − 1/10) ÷ 92 = 30/92 ≈ 0,33; andel 0 → Bagud   (forkert)
med taltDato:  forventet = clamp((31/8 − 1/10) ÷ 92) = clamp(−31/92) = 0; andel 0 → På sporet
```

`SporDom.forventetPr` bærer datoen, så fladen kan sige «hvor I burde være pr. august».

Samme formel for et mål, der SÆNKER et tal (måltal < udgangspunkt): tæller og nævner er begge
negative, når tallet bevæger sig rigtigt. Fra 60 mod 30, tal 45 → (45 − 60) ÷ (30 − 60) = 0,5.

| Status | Regel |
|---|---|
| `kan_ikke_afgoeres` | gammelt mål, begivenhed, intet tal, intet udgangspunkt, intet måltal, ingen frist, udgangspunkt = måltal, slut ≤ start (grunden står i `grund`) |
| `naaet_i_tal` | andelAfVejen ≥ 1 — et SIGNAL («Måltallet er nået. Overvej at markere målet som nået.»), aldrig et lukket mål |
| `foran` | andelAfVejen ≥ forventetAndel + 0,15 |
| `paa_sporet` | andelAfVejen ≥ forventetAndel − 0,10 |
| `bagud` | ellers |

`kraeverPrMaaned = (måltal − tal) ÷ (dageTilbage ÷ 30,4375)` — null når fristen er nået/passeret,
uden tal/måltal/frist, eller når måltallet er nået. For årstakterne betyder det: så meget skal
ÅRSTAKTEN stige pr. måned. Negativ = tallet skal ned.

Eksempel (prøvet i `maalTal.test.ts`): udgangspunkt 1 mio. 1/4-2026, mål 2 mio. 1/4-2027, tallet
pr. september (taltDato 30/9-2026) → forventet 182/365 ≈ 0,499. Årstakt 1,44 mio. → 0,44 af vejen ≥
0,399 → **På sporet**.

**«Måltallet er nået» (fund 16):** `naaet_i_tal` OPFORDRER kun mennesket til at overveje «Markér som
nået» (`MAAL_ORD.maaltalNaaetSpoergsmaal`). Det lukker intet og skriver intet; «nået» er stadig
KUN `status = 'completed'` ved et klik.

**Kendt begrænsning — sæson (fund 16):** årstakten er de tre seneste måneder × 12. En virksomhed med
sæson (julehandel, sommerturisme) ser årstakten svinge med kvartalet, og sporet kan sige «Foran» i
højsæsonen og «Bagud» i lavsæsonen, selv om året går som planlagt. Motoren korrigerer IKKE for
sæson (det kræver et år bagud pr. måned, som de fleste medlemmer ikke har godkendt). Fladen bør
forklare årstakten som «de seneste tre måneder gange 12» (`forklaring`), og et sæsonmål sættes
bedst som `andet_tal` eller med en frist på et helt år.

## 4. Næste skridt, kortet, guiden, tidslinjen

- **`naesteSkridt`:** det aktive skridt med nærmeste frist (også et forfaldent); ellers det
  nyeste ventende forslag; plus antal øvrige åbne og gjorte. Grupperne er `planen.grupperSkridt`.
- **`maalKort`:** alt ét kort tegner — titel, art, tal i ord (`vaerdiTekst`: «1,58 mio. kr.»,
  «620.000 kr.», «4,2 mdr.», «36 %»), «pr. …»-teksten, måltal, udgangspunkt, sporet, statusordet,
  frist-teksten («om 6 mdr.», «om 2 uger», «i morgen», «overskredet for 3 dage siden») og næste
  skridt. Ordene står ét sted: `MAAL_ORD`.
- **`nytMaalForslag`:** udgangspunkt = nuværende tal, udgangspunkt_dato = i dag (dansk), frist
  foreslået 12 måneder frem, «kræver X pr. måned» for et givet måltal. **`doemNytMaal`** dømmer
  guidens input fail-closed (fund 15): frist efter i dag og højst 36 måneder frem (dansk dato,
  inklusive); DB-grad 0–100 %; likviditet ≥ 0 mdr.; for en HUSNØGLE er udgangspunktet det
  nuværende tal (`nuvaerendeTal`, regnet af kalderen af samme måneder som kortet) — mangler tallet,
  afvises målet, og et medsendt udgangspunkt, der afviger, afvises. `unit` gemmes ALDRIG for en
  husnøgle (fund 5): enheden udledes af nøglen ved læsning (`enhedFor`).
- **`skarptForslag` (fund 4):** «Gør målet skarpt» nulstiller ikke de gamle tal — guiden får
  `target_value`/`current_value`/`unit` som forslag (måltal/udgangspunkt/enhed), og
  `current_value` bevares i databasen.
- **`naesteSkridt` (fund 6):** et forslag med `expires_at` før `nu` er ikke åbent
  (`forsidePlan.erUdloebetForslag`, samme dom som forsiden) — hverken vist eller talt.
- **`tidslinje`:** 12 måneder fra start med kvartalsmarkører (+3, +6, +9), gjorte skridt
  (`closed_at`, dansk dato) og målenes frister (ikke parkerede). **Start = medlemskabets start**
  (`companies.contract_start_date`, rullet frem i hele år til det indeværende medlemsår) —
  fordi 12-måneders-rytmen (intro-session = måned 0, kvartalstjek 3/6/9, årsbrevet 11–12) tæller
  fra medlemskabet, og Score-grundlaget henter feltet i forvejen. Uden kontraktstart: det
  tidligste ikke-parkerede måls start, rullet frem i hele år PÅ SAMME MÅDE (fund 11); ellers i dag.

## 5. Hentning og skrivning (`src/hooks/dineMaalGrundlag.ts`)

- Månederne og `kontraktStart` deles med Boardroom Score (samme queryKey og `hentScoreGrundlag`)
  — én facts-hentning på forsiden. Står Score `afventer_migration`, ELLER FEJLER Score-hentningen
  (fund 7), er månederne null og tal-målene siger «Tallet kan ikke læses endnu» (`tallenFejlede`).
  KUN en fejl i mål- eller skridt-hentningen er en sidefejl (`isError`).
- Skridtene hentes under de AKTUELLE mål-id'er (`.in("maal_id", …)` i bidder á 200 — fund 12), med
  `created_at` og `expires_at`.
- Målene læses med de nye kolonner; svarer databasen 42703/PGRST204
  (`manglendeTabel.erManglendeKolonne`), læses de gamle, de nye felter er null, og
  `afventerMigration` er sand. Enhver anden fejl kaster.
- Skrivning: medlemmets klientvej (`opretMaalMedTal`, `goerMaalSkarpt`) — RLS uændret (politikkerne
  dømmer rækken, ikke kolonnen; se migrationens filhoved). Bogført i `maalSkriv.guard` dom 3.
- **`goerMaalSkarpt` (fund 3 og 4):** kræver `status = 'active'` og `art IS NULL`; dømmer den nye
  frist mod målets åbne (active/proposed) skridt med `doemMaalFristModSkridt` FØR skrivningen
  (samme dom som medlemmets flade og `maal-skriv` «rediger»); UPDATE guardet på
  `.is("art", null).eq("status", "active")` — nul rækker er en tydelig fejl, aldrig en stille
  overskrivning. Skriver aldrig `current_value` (`skarpPayload`). Værn: `maalSkridt.guard` dom 6.
- **Invalidering (fund 17):** `["dine-maal"]`, `["virksomhed", companyId]` (useVirksomhed) og
  `["pulse-milestones", companyId]` (PulseCheckinModal). `useMilestones` har ingen react-query-nøgle
  (useState + genhent) — fladen giver dens genhent som `efter`.
- **Gamle læsere i klienten (fund 5):** `HbMaalRaekke`, `MilestoneDialoger` og `useMilestones`'
  `saetNuvaerendeVaerdi` viser og skriver «X af Y enhed» KUN for mål med `art IS NULL`
  (`maalTal.gammelTalvisning`) — current ÷ target er forkert for et tal-mål (fremdriften er
  andelen af vejen fra udgangspunktet).

## 6. Åbne punkter

1. **Rådgiverens vej:** `maal-skriv` kender ikke de nye felter. En udvidelse er en ændring i en
   edge function og kræver eksplicit udrulning — ikke gjort.
2. Migrationen skal KØRES og MÅLES (`GET /rest/v1/milestones?select=art,maal_noegle,udgangspunkt,udgangspunkt_dato&limit=0` → 200), før en flade skriver felterne.
3. **pg_policy på milestones er ikke målt** — RLS-fundet i migrationens filhoved er kodelæst.
4. Score's disciplinpoint for «mål» læser stadig `kpi_targets` (designpapiret §2 foreslår at
   flytte dem til «aktivt mål med tal og dato») — ikke en del af motoren.
5. Hvilken af 42703/PGRST204 Lovables PostgREST giver for en ukendt kolonne er ikke målt — begge
   genkendes.
6. **Gamle læsere i edge-laget — KENDT, IKKE RØRT (fund 5):** `ai-data-chat` (index.ts:59–78) og
   `generate-weekly-focus` (index.ts:249–283) læser `target_value`/`current_value`/`unit` og viser
   «current/target unit» for ethvert mål med måltal og enhed. Et tal-mål med en husnøgle har ingen
   `unit` (fund 5) og vises derfor kun med `progress`; et `andet_tal`-mål har `unit` og vises med
   current/target — som i dag, men uden udgangspunktet. En rettelse kræver eksplicit udrulning af
   begge functions og er ikke en del af motoren.
7. **SECURITY_BASELINE fund 6 (milestones WITH CHECK):** forberedt SEPARAT i
   `20261002090000_milestones_with_check.sql` — KRÆVER Jonas' grønne lys (RLS-stramning).
   Politiknavnene er kodelæste og SKAL måles i `pg_policy` før kørsel (filens FØR-SQL).
8. **Sæson** — se §3 («Kendt begrænsning»).

## 7. «Jeres retning» (Jonas 1/10-2026 kl. 22:37)

Handoutet «Målsætning 12 mdr.» flytter ind i toppen af Dine mål som TRE spørgsmål. Svarene BOR
stadig i handouts-rækken — ingen migration, ingen ny tabel; handoutet og Dine mål læser og skriver
de SAMME nøgler (`src/lib/hjemmebane/maalRetning.ts`, testet i `maalRetning.test.ts`, der også
holder nøglerne i takt med `handoutConfigs.overordnet`):

| Nøgle | Spørgsmålet på Dine mål |
|---|---|
| `lykkedes_12mdr` | «Om 12 måneder er vi lykkedes, hvis…» |
| `anderledes_hverdag` | «Hvad skal være anderledes i hverdagen?» (hjælpetekst: også arbejdstiden) |
| `konsekvenser_ingen_aendring` | «Hvad koster det, hvis intet ændrer sig?» |

- **Hentning** (`hentRetning`, egen query under `["dine-maal", "retning", companyId]`): virksomhedens
  rækker med `module = 'overordnet'`; den NYESTE (`updated_at`) vælges (`vaelgRetningsRaekke`), og
  `retningFraHandout` læser de tre svar (kun tekst; alt andet er tomt). En fejl giver
  `retningFejlede` — ikke en sidefejl.
- **RLS — KODELÆST, IKKE MÅLT i pg_policy:** SELECT «Users can view own handouts» (`auth.uid() =
  user_id`, 20260224071122) og «Advisors can view all handouts»; virksomhedspolitikkerne fra
  20260224222456 blev DROPPET i 20260310194637 (Security Patch 7), som også gav INSERT/UPDATE en
  WITH CHECK på `user_id = auth.uid() AND company_id = user_company_id(auth.uid())` og lagde
  UNIQUE (user_id, module). **Følge:** et MEDLEM ser kun sin EGEN række — har en medejer udfyldt
  handoutet, ser medlemmet tomme svar og opretter sin egen række ved første skrivning. En RÅDGIVER
  ser alle virksomhedens rækker og får den nyeste.
- **Skrivning** (`gemRetning`, medlemmets egen række, samme tabel/RLS/klient som handoutet):
  dommen `retningTilResponses` (kun de tre nøgler; handoutets øvrige svar bevares ordret) → findes
  rækken: UPDATE af KUN `responses` (+ `status` 'not_started' → 'in_progress', `retningStatus`),
  guardet på id og user_id, nul rækker = ikke gemt; findes den ikke: INSERT i `saveHandout`'s form
  (module 'overordnet', checklist {}, levers []). `handoutEngine.saveHandout` bruges BEVIDST ikke til
  opdateringen: den skriver hele rækken og afleder status af indholdet, så et UDFYLDT handout ville
  blive genåbnet. Kendt: læs-flet-skriv uden lås — en samtidig autosave i handoutet kan overskrive
  (samme forbehold som handoutets egen autosave i to faner).
- **Fladen (§8):** `JeresRetning.tsx` øverst på Dine mål. Handoutets egen side står uændret; at
  fjerne de tre spørgsmål dér er stadig en åben fladebeslutning.

## 8. Fladen (1/10-2026 aften, branch `feat/dine-maal-flade`)

Jonas om den gamle side: «kedelig, intetsigende … grimt forvirrende design og dårlig UX og UI …
kommer til at være død fra medlemmerne». Standarden: «Enkelthed er et nøgleord … medlemmer føler
sig holdt i hånden og ikke er et sekund i tvivl». **Motoren regner alt; fladen tegner.** Fladens
egne ord og de små afledninger (hovedlinje, chips, banens andele som procenter, et begivenhedsmåls
skridt-fremdrift, guidens kort, tidslinjens positioner) står i `src/lib/hjemmebane/dineMaalFlade.ts`
(ren, `dineMaalFlade.test.ts`) — komponenterne under `components/hjemmebane/milestones/` regner intet.

### Siden oppefra (`DineMaalView.tsx`)

1. **Hovedet:** eyebrow «Dine mål · <måned år>» (dansk tid), serif-overskrift «Hvor I er på vej
   hen», én linje «N mål for de næste 12 måneder · M plads ledig» (`hovedLinje`; over grænsen siger
   linjen det i stedet for et negativt tal) og status-chips «1 på sporet», «1 bagud» …
   (`statusChips`: én pr. status blandt TAL-målene — begivenheder og gamle mål har ingen status at
   tælle; bagud først; rust for bagud, sage for resten, dæmpet for «kan ikke afgøres» — `chipTone`).
2. **«Jeres retning»** (`JeresRetning.tsx`): tre tilstande — henter (skelet), tom (ÉN invitation
   «Skriv jeres retning (3 spørgsmål, 5 minutter)», der åbner redigeringen med alle tre felter inline
   — valgt frem for ét felt ad gangen: de tre spørgsmål hører sammen, og tre felter på én skærm er
   færre klik), udfyldt (læsbar tekst, «Ret» diskret; et ubesvaret spørgsmål siger «Ikke svaret
   endnu»). Gemmes gennem `gemRetning` (§7); fejl står i feltet, «Fortryd» kasserer kladden.
3. **Målkortene** (`MaalKort.tsx`, gitter: 1 kolonne på mobil, 2 på md, 3 på xl): chip (motorens
   `statusOrd`) + `fristTekst` («om 6 mdr.»); titlen som serif-sætning; TALLET stort (`talTekst`)
   med «pr. august (godkendt)» eller «tastet» (`talUndertekst`); banen (`bane`: fyldt =
   `andelAfVejen` klippet 0–1, stregen = `forventetAndel`, med titlen «hvor I burde være pr. august»
   — `stregTekst`) og under den «start · mål + frist»; et begivenhedsmål viser «1 af 3 skridt gjort»
   (`skridtFremdrift`, ingen procent) i stedet for banen. Mangler tallet, står motorens grund i
   stedet. Nederst ÉT næste skridt (`naeste.skridt`) med «senest <dato> · foreslået af <jer selv /
   din rådgiver / AI>» (motorens `foreslaaetAf` — læst af `company_actions.source_type`,
   `maalTal.skridtKilde`; et navn kræver et profilopslag og er bevidst IKKE bygget) og «Gjort»
   (opgave-luk, som før); et ventende forslag får «Svar på forsiden». «N skridt mere · M gjort»
   (`flereSkridtTekst`) folder resten ud (planens `skridtLinjer`). Uden skridt: «Hvad er det første,
   I gør?» + «Tilføj skridt» (`TilfoejSkridtForm` fra `HbMaalRaekke.tsx` — SAMME formular som før og
   som forsiden). **«Foreslå et» er udeladt:** der findes ingen medlemsvej til `foreslaa-opgave`
   (kun chatten og Planen, rådgiverens). «…»-menuen: Redigér (`RedigerMaalDialog`), Parkér, Markér
   som nået, Slet (bekræftes i siden, `SletMilestoneDialog`). **Gammelt mål (art null):** titlen og
   ÉN handling «Gør målet skarpt» (guiden forudfyldt af `skarptForslag`); menuen har ikke Redigér.
4. **Den stiplede plads** (`TomPladsKort`): «Plads til ét mål mere» + «Hvad skal ske i jeres
   virksomhed det næste år?» + «Sæt et mål» — kun når `dineMaalDom.kanOprette` og ikke over grænsen.
5. **«Rejsen»** (`Rejsen.tsx`): motorens `tidslinje` som enkel SVG (linjen, kvartalsmærker,
   gjorte skridt som prikker under linjen, målenes frister som flag over — rust, evergreen når nået —
   og «i dag» som en lodret streg) med husets tokens gennem `currentColor`; aksens ord, «i dag» og
   forklaringen er HTML, så intet skaleres ulæseligt på 375 px; punkterne står også i ord (sr-only).
   Tom: «Tidslinjen fyldes, efterhånden som I gør skridt og sætter frister.»
6. **Nået og parkeret** står foldet nederst som før (`HbMaalRaekke`: Genåbn/Aktivér/Slet) — baren
   dér er læs-kun (`kanSaetteFremdrift` er false for begge), og teksten er «Nået»/«Parkeret», ikke en
   procent.

**Skyderen og den blandede procent er væk fra siden:** `MilestoneDetaljeDialog` (range-input,
«nuværende ÷ mål») og `OpretMilestoneDialog` er slettet fra `MilestoneDialoger.tsx` (kun slet står
tilbage); `useMilestones.saetFremgang`/`saetNuvaerendeVaerdi` kaldes ikke af fladen (de står i hooket
for forsiden/legat). Et TASTET tal (andet_tal) rettes i `RedigerMaalDialog` («Tallet nu») gennem
`useMilestones.opdaterFelt`, som nu tager `current_value` — KUN den kolonne, aldrig `progress`.

### Guiden «Sæt et mål» (`SaetMaalGuide.tsx`)

Tre trin i `HbDialog` (bred): **1. «Hvad vil I nå?»** — seks kort (`guideKort`: de fire læste
nøgler, «et andet tal», «noget der skal ske»); hvert læst kort viser det NUVÆRENDE tal med
«pr. august (godkendt)» (`nytMaalForslag` → `nuvaerendeTal`) eller «mangler: <grund>» og kan da
ikke vælges (dommen ville afvise det). «Hvad er et mål?» (`MAAL_FORKLARING_TEKST`, én kilde) står som
dialogens beskrivelse. **2. «Hvor meget og hvornår?»** — måltal (+ udgangspunkt og enhed for
andet_tal), frist (foreslået 12 mdr., `min` i dag, `max` 36 mdr.), den levende linje «Det kræver ca.
X pr. måned» / «Tallet skal ned med ca. …» (`kraeverTekst` af motorens `kraeverPrMaaned`, regnet
med dansk i dag og den valgte frist) og titlen, foreslået af motoren (`foreslaaTitel`:
«Omsætning på 2 mio. kr. i årstakt», «4 mdr. drift i banken», «12 kunder») — den følger tallet,
indtil medlemmet retter den. `doemNytMaal` kører ved «Videre» og viser grunden i titelfeltet.
**3. «Det første skridt»** — titel + frist (foreslået som `TilfoejSkridtForm`: i dag + 14 under
målets frist; `doemFrist` + `doemFristModMaal`, SAMME dom som skridt-tilfoej) eller «Spring over».
Gem: `useDineMaalSkrivning.opret` (→ `opretMaalMedTal`), derefter skridtet gennem skridt-tilfoej med
det nye måls id; fejler skridtet, siger dialogen det, og målet står. **«Gør målet skarpt»** er
samme guide i to trin (uden skridt), forudfyldt med `skarptForslag` (titel, måltal, udgangspunkt,
enhed) og gemt gennem `goerSkarpt`. «Højst tre aktive» er stadig databasens (trigger) og
oversættes af `maalFejlTekst` gennem `opretMaalMedTal`.

### Rollerne, tilstandene, værnene

- **Rådgiveren** ser siden for en virksomhed som før (`companyId` fra `useAuth`; uden valgt
  virksomhed `HbAdvisorCompanyPrompt`) og har de samme handlinger (klientvejen — uændret RLS).
- **Tilstande:** henter (tre kort-skeletter i kortets højde — intet spring); fejl i mål/skridt
  (`isError`: «Dine mål kunne ikke hentes.» + «Prøv igen» — invaliderer `["dine-maal"]`); Score
  fejlede/afventer (`tallenFejlede`: én rolig linje, kortene står med «Tallet kan ikke læses endnu»);
  migrationen ikke kørt (`afventerMigration`: én linje, alle mål som «Gør målet skarpt»).
- **Mobil 375 px:** gitteret falder til én kolonne, chips og hovedlinje ombrydes, banens
  «hvor I burde være» er titel på stregen (teksten kun fra sm), Rejsens ord er HTML.
- **Fokus synligt** på alle knapper (husets ring); menuen er `role="menu"` i `HbPopover` (Escape,
  klik udenfor); dialogerne er `HbDialog` (fokus fanges, Escape, fokus tilbage).
- **Bevægelse:** banens `transition-[width]` og chevronen respekterer `motion-reduce`.
- **Kildeværn rettet, fordi de bevidst fældede den gamle flade:** `dineMaal.guard` dom 4 (useMilestones'
  destructure uden skyderen og `opret`; `skriv.opret`/`skriv.goerSkarpt` som oprettelsesvej;
  `markerNaaetOgRyd`/`opdaterMaalFelt` som indpakning med invalidering; ingen direkte
  `.from("milestones")` i fladen), `maalSkriv.guard` dom 4 (opret-knappen → den stiplede plads
  `TomPladsKort` bag `dom.kanOprette`), `forsidePlan.guard` dom 6 («Hvad er et mål?» i guiden som
  dialogens beskrivelse i trin 1 — DIALOG peger på `SaetMaalGuide.tsx`; den tomme tilstand er
  blokken `data-dine-maal="tom"` før gitteret), `milepaelDom.guard` (`MilestoneDialoger.tsx` læser
  ingen dom længere — kun slet står tilbage). Ingen værn er slækket: hver regel er flyttet til den
  nye sandhed.
- **Tests:** `dineMaalFlade.test.ts` (ordene og afledningerne), `MaalKort.test.tsx` (på sporet,
  bagud, uden tal, gammelt mål, begivenhed, tom plads, menuen, Gjort), `SaetMaalGuide.test.tsx`
  (trin 1 med/uden måneder, trin 2 «det kræver» og titelforslaget, dommen, trin 3 med/uden skridt,
  begivenhed, gør skarpt), `JeresRetning.test.tsx` (tom/udfyldt/henter/fejl), `DineMaalView.test.tsx`
  (siden oppefra, tre aktive, ingen mål, henter/fejl); motoren fik `skridtKilde` og `foreslaaTitel`
  i `maalTal.test.ts`.

### Det tekniske råds fund på fladen (1/10-2026 sent, rettet på `feat/dine-maal-flade`)

- **(1) Ét mål pr. åbning:** guiden husker det oprettede id (`oprettetId`); fejler skridtet, gentager
  et nyt klik KUN skridtet, «Spring over» lukker, og «Tilbage» er låst (en rettelse i trin 2 ville
  ellers tabes stille). Dobbelt Enter/klik stoppes synkront af en ref (`gemmerRef`) — state'en er
  ikke synkron.
- **(2) Redigér nulstiller ikke under indtastning:** effekten afhænger af `[open, kort?.id]`, start-
  værdierne læses gennem en ref — kortet er et nyt objekt hvert minut (hookets ur) og ved genhentning.
- **(3) Rådgiveren retter ikke retningen:** `gemRetning` skriver på den indloggedes eget `user_id`,
  så rådgiverens «Ret» ville skrive i rådgiverens egen handout-række. `kanRette = !isAdvisor` —
  rådgiveren læser; den tomme tilstand siger «Virksomheden har ikke skrevet sin retning endnu».
- **(4) Dansk tal:** `dineMaalFlade.danskTal` (testet) — «1.500» = 1500, «1.500,5», «2.000.000»,
  «-200.000», «1,5»; det tvetydige «1.5» (ét punktum uden tre cifre efter) læses som 1,5. Guiden og
  Redigér bruger den.
- **(5) Fristen i Redigér:** for et mål med art dømmes den af `maalTal.doemMaalFrist` (udtrukket af
  `doemNytMaal`, samme dom): efter i dag, højst 36 mdr., aldrig tom. Et gammelt mål (art null) må
  stadig stå uden frist.
- **(6) Retningens egen hentning:** hooket giver `retningHenter`; fladen viser skelettet, til den er
  færdig. Fail-closed i to lag: fladen afviser tre tomme svar oven på svar (`RETNING_TOM_KLADDE_TEKST`),
  og `gemRetning` afviser det igen (`RETNING_TOM_OVER_SVAR_TEKST`) — tre tomme på en række UDEN svar
  må gerne gemmes.
- **(7)** Ved fejl i mål-hentningen vises hverken hovedlinje eller chips.
- **(8)** «Gør målet skarpt» forudfylder målets EGEN frist (`GuideTilstand.frist`), når den er sat og
  efter i dag; ellers forslaget.
- **(9)** Dommens grund står i ÉN synlig `role="alert"`-linje nederst i trinnet (`data-guide-fejl`).
- **(10)** «hvor I burde være pr. …» står synligt på alle bredder (egen linje på mobil).
- **(11) Rejsen er HTML:** linjen en div, mærkerne elementer med `left: x %` — prikker er runde på
  375 px; listen i ord er synlig på mobil og sr-only fra sm.
- **(12)** Et kort, dommen ikke kender, får ALLE handlinger false (`INGEN_HANDLINGER`).
- **(13)** `useMilestones.opdaterFelt` svarer `{ok} | {ok:false, grund}`, SELECT'er id og dømmer nul
  rækker som fejl (`OPDATER_NUL_RAEKKER_TEKST`); Redigér holder sig åben ved nej.
- **(14)** «Skrevet af en anden i virksomheden», når `retning.userId !== user.id` (åbent punkt 12).
- **(16)** `nu` er hookets tikkende ur (`DineMaalSvar.nu`); guiden får sit ÅBNINGSTIDSPUNKT, så dens
  nulstilling (deps `[open, tilstand, nu]`, fund 20, uden eslint-disable) ikke tikker.
- **(17)** Et begivenhedsmåls «N af M skridt gjort» står kun i chippen. **(18)** `HbMaalRaekke`
  viser procentbaren kun for art null. **(19)** Eksemplerne («Fx: …», `maalEksemplerHjaelp`) står
  under kortene i guidens trin 1, og `forsidePlan.guard` dom 6 kræver dem. **(20)** `aria-pressed`
  fjernet fra kortene. **(21)** «Gør målet skarpt» er låst, når den rå række mangler.
- **Tests:** `RedigerMaalDialog.test.tsx`, `Rejsen.test.tsx`, guiden (dobbelt submit, skridt-fejl →
  prøv igen uden dobbelt mål, dansk tal, alert-linjen, egen frist), retningen (rådgiver ser ikke
  «Ret», tom kladde, skrevet af anden), `danskTal` og `doemMaalFrist`.

### Det tekniske råds runde 2 (1/10-2026 nat, rettet på `feat/dine-maal-flade`)

- **(1) Tal til og fra feltet — rundturen:** `String(2.125)` gav «2.125», som `danskTal` læste som
  2125; et UBERØRT talfelt i «Redigér» skrev `current_value` ×1000 ved Gem. Nu forudfylder
  `danskTalTilFelt` (komma som decimaltegn, ingen gruppering — `dineMaalFlade.ts`) overalt
  («Redigér», «Gør målet skarpt»), og rundturen `danskTal(danskTalTilFelt(v)) === v` er prøvet for
  2,125 · 0,001 · 1500 · −200000 · 1000000,25 · 12,5 · 1e21 · 1e-7. «Redigér» gemmer desuden KUN
  felter, hvis TEKST er en anden end ved åbningen (`start`) — et uberørt felt parses aldrig.
- **(2) Den rå rådgiverrolle:** `kanRetteRetning = !rawAdvisor` (useAuth's `isAdvisor`, som
  HbMemberShells hjerteslag) — i «Se som medlem» var `isAdvisor` falsk, og rådgiveren kunne gemme
  retningen i sin EGEN handout-række. Prøvet med `viewingAsMember: true`.
- **(3) Ja uden id:** svarer skriveren `{ ok: true, id: null }` (rækken kunne ikke læses tilbage
  efter insert), lukker guiden ikke stille: `MAALET_SAT_IKKE_LAEST_TEKST` står, og videre oprettelse
  er låst (`laast`, `data-guide-laast`) — et nyt klik ville ellers oprette målet igen.
- **(4) `try/finally` om `onGem`** i «Redigér»: et kast låser ikke «Gemmer…»; beskeden vises.
- **(5) Ingen tom menu:** «…» tegnes kun, når den har mindst ét punkt (`menuPunkter`).
- **(6) Suffikser:** `danskTalDom` fjerner «kr.», «kr», «%», «mdr.», «mdr»; «mio.»/«mio» ganger med
  1.000.000, KUN når tallet er entydigt (uden punktum — «1.500 mio.» og «1.5 mio.» afvises med
  `TAL_MIO_TVETYDIG`); unicode-minus «−» læses; anden tekst («100 kunder», «ca. 40») får
  `TAL_KUN_TALLET` («Skriv kun tallet — uden kr., % eller mio.»). `danskTal` er uændret i form
  (tallet eller null); dommen med grund bruges i guiden og «Redigér».
- **(7) Frossent `nu`:** guidens åbningstidspunkt (`guideNu`) gives videre til `opret`/`goerSkarpt`,
  så dommen ikke skifter ved midnat, mens guiden står åben (værnene `dineMaal.guard` dom 4 og
  `maalSkriv.guard` dom 4 pinner linjen).
- **(8) Gammelt mål, tastet frist:** også for art null afvises en TASTET frist før i dag
  (`FRIST_FOER_I_DAG`); en uændret gammel frist blokerer ikke en titelrettelse.
- **(9) `doemNytMaal`:** omsætningens måltal ≥ 0 — resultatet må stadig være negativt.
- **(10) Rejsen:** skridt- og fristmærker ved x ≈ 0/1 kant-justeres som «i dag» (`kant`).

### Åbne punkter efter fladen

9. «Foreslået af <navn>» viser rollen, ikke navnet — et navn kræver et profilopslag pr. skridt.
10. Kategori, beskrivelse og baseline på gamle mål vises ikke længere på fladen (data står).
11. Handoutets side bærer stadig de tre retningsspørgsmål (§7) — dobbelt indgang, samme række.
12. **Retning for flerbruger-virksomheder (rådets fund 14):** svarene BOR pr. bruger (UNIQUE
    (user_id, module)), og et medlem ser kun sin EGEN række (RLS, §7). Fladen siger «Skrevet af en
    anden i virksomheden», når rækken ikke er den indloggedes — det ses i praksis kun af rådgiveren
    (et medlem får aldrig en medejers række). Et NAVN kræver et profilopslag og er ikke bygget. Og
    to medejere, der hver skriver sin retning, giver to rækker — hvilken, der er «virksomhedens»,
    er ikke besluttet (rådgiveren får den nyeste, `vaelgRetningsRaekke`).
