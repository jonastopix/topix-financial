# Dine mål — målmodellen, tal-målene og sporet (motor 1/10-2026)

**Status:** motoren er bygget (#1223) og fladen (#1225); **skive 3 (bekræftelse, pejlemærker, kvartalstjek) er bygget** på `feat/dine-maal-skive3` — se sektionen «Skive 3» nederst (migration `20261002100000`, IKKE KØRT). Fladen (#1225, §8) er
merget. Migrationen
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
   `20261002210000_milestones_with_check.sql` — KRÆVER Jonas' grønne lys (RLS-stramning).
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
   hen», stedsætningen, ÉN linje «N mål for de næste 12 måneder · M plads ledig» (`hovedLinje`;
   rettet 2/10 — se «Hierarkiet 2/10» herunder) og status-chips «1 på sporet», «1 bagud» …
   (`statusChips`: én pr. status blandt TAL-målene — begivenheder og gamle mål har ingen status at
   tælle; bagud først; rust for bagud, sage for resten, dæmpet for «kan ikke afgøres» — `chipTone`).
2. **«Jeres retning»** (`JeresRetning.tsx`; FELTET tegnet om 2/10 — se «Hierarkiet 2/10»): tre
   tilstande — henter (skelet), tom (ÉN invitation «Skriv jeres retning (3 spørgsmål, 5 minutter)»,
   der åbner redigeringen med alle tre felter inline — valgt frem for ét felt ad gangen: de tre
   spørgsmål hører sammen, og tre felter på én skærm er færre klik), udfyldt (svar 1 som liste, de to
   andre som kort, «Ret» i meta-linjen; et ubesvaret spørgsmål siger «Ikke svaret endnu»). Gemmes
   gennem `gemRetning` (§7); fejl står i feltet, «Fortryd» kasserer kladden.
2a. **«Venter på jeres ja»** (`BekraeftMaalKort`, skive 3): forslag, gamle mål og kvartalstjek —
   UNDER retningen og over målene (flyttet 2/10; stod før over hovedet).
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
- **(14)** «Skrevet af en anden i virksomheden», når `retning.userId !== user.id` (åbent punkt 12) —
  og ALDRIG for rådgiveren (rettet 2/10, «Hierarkiet 2/10»).
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
    anden i virksomheden», når rækken ikke er den indloggedes — **kun for et medlem** (2/10: for
    rådgiveren er enhver række «en andens», og linjen sagde intet; den vises aldrig for den rå
    rådgiverrolle), hvilket i praksis kræver en medejers række, som RLS ikke giver — linjen er i dag
    et værn, ikke en tilstand, der ses. Et NAVN for en ANDEN kræver et profilopslag og er ikke bygget;
    EGET fornavn står i meta-linjen fra useAuth's profil (2/10, ingen ny RLS). Og to medejere, der
    hver skriver sin retning, giver to rækker — hvilken, der er «virksomhedens», er ikke besluttet
    (rådgiveren får den nyeste, `vaelgRetningsRaekke`).

### Hierarkiet 2/10 — «Jeres retning» som felt, én hovedlinje, «venter på jeres ja» under hovedet

Jonas 2/10-2026: «gør det øverste afsnit med Jeres retning under Dine mål lidt mere lækkert visuelt»
og «kør selv». Mockuppen (ia-forslag, `data-view="maal"`) er fulgt. Branch `feat/dine-maal-retning`.
Frontend alene — ingen migration, ingen function: **Update**.

**Hierarkiet på /milestones** (`DineMaalView.tsx`, værn `dineMaalRetning.guard` dom 1): eyebrow
«Dine mål · <måned>» → h1 → stedsætningen → ÉN hovedlinje (+ chips) → **Jeres retning** → **«venter
på jeres ja»** (`BekraeftMaalKort`: forslag, gamle mål, kvartalstjek — stod før ØVERST, over hovedet;
nu under retningen, før målene, så siden åbner med hvem I er og hvor I vil hen, ikke med et krav) →
«Jeres mål» → Rejsen → nået/parkeret foldet. Rendertesten `DineMaalView.test.tsx` «hierarkiet (2/10)»
måler kilderækkefølgen i DOM'en.

**Én hovedlinje** (dom 2): i drift (Rallysupport, 2/10) stod TO røde linjer oven på hinanden —
`hovedLinje`: «5 mål for de næste 12 måneder · 6 venter på jeres ja · flere end de 3, der er plads
til» OG `dom.graenseTekst`: «5 af 3 aktive mål · 6 venter på jeres ja — Svar på de mål …». Nu tegner
/milestones KUN `hovedLinje`, i neutral farve (status, ikke alarm), og `graenseTekst` tegnes ikke
dér (forsidens «Din plan» bærer den stadig). `hovedLinje` (`dineMaalFlade.ts`) over grænsen — flere
BEKRÆFTEDE end tre, mål fra før grænsen: «5 aktive mål · 6 venter på jeres ja — flere end de 3, der
er plads til. Parkér et for at få plads.» Fylder de ubekræftede pladserne op (bekræftede < 3), er
svaret vejen til plads (`TAG_STILLING_TEKST`); er de bekræftede tre, «ingen plads ledig», uanset hvor
mange der venter. **Aldrig «N af 3» med N > 3** — heller ikke i `graenseTekst` (`dineMaal.ts`), der
nu dømmer «flere bekræftede end tre» FØRST (før: «5 af 3 aktive mål …») og siger «det er det
højeste» med «· N venter på jeres ja», når de bekræftede er tre. Prøvet i `dineMaalFlade.test.ts`
og `dineMaal.test.ts` (regex mod «N af 3»).

**Feltet** (`JeresRetning.tsx`; afledningerne i `maalRetning.ts`, prøvet i `maalRetning.test.ts`):
et mørkegrønt felt (`bg-hb-evergreen`, tekst `text-hb-paper`/`text-hb-sage`; dekorativ ring i
`border-hb-sage/20`, `overflow-hidden`), eyebrow «Jeres retning» i **amber** — den nye token
`--hb-amber: 28 70% 66%` i `hjemmebane.css` + `hb.amber` i `tailwind.config.ts` (rust står for
mørkt på evergreen; ingen rå farver i komponenten, dom 5). Toppen bærer meta-linjen «Skrevet af
<fornavn> · <dato> · Ret» (`retningMeta`): fornavnet KUN fra useAuth's egen profil, når rækken er
den indloggedes (`fornavn(profile?.full_name)`, dom 4 — intet opslag, ingen ny RLS); ellers
«Skrevet <dato>» (`skridtForslag.danskDato` af `handouts.updated_at`); for et medlem med en medejers
række indskydes «Skrevet af en anden i virksomheden» — aldrig for rådgiveren (dom 3). Spørgsmål 1
«Om 12 måneder er vi lykkedes, hvis …» som stor serif (Fraunces, 28/36 px, `text-wrap: balance`) og
svaret som LISTE: `retningLinjer` splitter på linjeskift, fjerner tomme linjer og et indledende
punkttegn («- », «• », «1. »); amber-streg foran hver linje. De to andre svar som to kort i
`bg-hb-paper/10`: «Hverdagen, vi bygger» (`anderledes_hverdag`, eyebrow sage) og «Prisen, hvis intet
ændrer sig» (`konsekvenser_ingen_aendring`, eyebrow amber — advarslen er den eneste varme). Foden
«Jeres mål herunder er vejen derhen.» Ordene står i `RETNING_FELT_ORD` (dom 6). **Lange svar
klippes** ved LINJEGRÆNSEN (`klipRetning`: højst `RETNING_MAKS_LINJER` = 5 linjer og
`RETNING_MAKS_TEGN` = 420 tegn i alt — en linje tages ind, så længe antallet og summen holder;
kun en første linje, der alene er for lang, klippes ved et mellemrum + «…»), kortene ved
`RETNING_KORT_MAKS_TEGN` = 280 (`klipKortTekst`); «Læs alt» folder HELE feltet ud (én tilstand,
`data-retning-vis-alt`), «Vis mindre» folder igen. Tom tilstand: samme felt, spørgsmålet som
overskrift, introen og invitationen (ombrydelig knap — på 375 px efterlader feltet ~300 px);
rådgiverens tomme tilstand uændret i ord. Redigeringen: inline i et lyst kort (`bg-hb-surface`) inde
i feltet, uændret i dom. Mobil 375: alt stabler (`md:` for de to kolonner), `break-words` på
linjer og kort, intet vandret scroll.

Rendertests: `JeresRetning.test.tsx` «feltet (2/10)» (listen, kortene, meta-linjen, «Læs alt»/«Vis
mindre», tom tilstand) og `DineMaalView.test.tsx` (hierarkiet; over grænsen 5 + 6 → én neutral linje
uden «5 af 3»; eget fornavn; medejers række; rådgiveren uden «Skrevet af en anden»). Værnet
`dineMaalRetning.guard.test.ts` (seks domme, hver med mod-prøve). De gamle værn (`dineMaal.guard`,
`dineMaalSkive3.guard` dom 1 på `graenseTekst`-linjen i `dineMaal.ts`) står urørt.

## Skive 3 — Jonas' svar 1/10 (bygget 2/10-2026, branch `feat/dine-maal-skive3`)

Jonas' svar på aftenlisten 1/10 kl. 22:04–22:09 (ordret valg): **1** «Ja, ét klik» · **2** «Bekræft
eller slip ved næste login» · **3** «Kald dem pejlemærker, og flyt Score-pointet til Dine mål» ·
**4** «Medlemmet selv» + «rådgiverne skal have som en linje på forsiden, så vi kan følge op». Migration
`20261002100000_maal_bekraeft_kvartal.sql` (IKKE KØRT ved skrivning). Motor: `src/lib/hjemmebane/
maalBekraeft.ts` (ren, `maalBekraeft.test.ts`); hentning/skrivning: `src/hooks/dineMaalGrundlag.ts`;
flade: `components/hjemmebane/milestones/BekraeftMaalKort.tsx` (SAMME komponent på /milestones og
forsidens «Din plan»); rådgiverens forside: `hooks/kvartalstjekOverblik.ts` + `forside/KvartalstjekVenter.tsx`.
Værn: `dineMaalSkive3.guard.test.ts` (ti domme — 7: ankeret og INSERT-policyen = klientens dom; 8:
«Nået» guardet + fejret; 9: dommen med grund før INSERT; 10: Genåbn/Aktivér bekræfter, skillelinjen
udledt). **Rettet 2/10 efter det tekniske råds fund** (1–11, 13, 14 — bogført ved hvert punkt
herunder) **og efter rådets runde 2** (2/10 morgen, fund 1–10 — bogført som «runde 2, fund N»).

### 1. Bekræftelsen («Ja, ét klik»)

- **Kolonnerne** `milestones.bekraeftet_at timestamptz NULL` og `bekraeftet_af uuid NULL` (tilføjende).
  `null` = ubekræftet forslag; **`undefined` (kolonnen ikke læst — migrationen ikke kørt) = modellen slået
  fra, og målet tæller SOM I DAG** (`erBekraeftet`). Hentningen er fail-soft i tre lag (skive 3 → skive 2
  → de gamle; `hentMaalMedTal`, `bekraeftelseAfventer`); forsidens `milestonesQuery` og `useMilestones`
  (`select *`) bærer feltet, når det findes.
- **Ubekræftede tæller ikke:** kortene på Dine mål er kun de bekræftede aktive (`byggDineMaal`); «Din
  plan» og pladserne dømmer gennem `dineMaalDom.aktive` = de bekræftede (`ubekraeftede` for sig);
  forsidens fokus (`maalFokus`) læser kun bekræftede; Score (§3). Et mål, medlemmet selv sætter i
  guiden, er bekræftet fra fødslen (`opretMaalMedTal`: `bekraeftet_at = nu`, `bekraeftet_af` =
  medlemmet; falder tilbage uden felterne ved PGRST204).
- **Forslaget** (et ubekræftet mål oprettet på eller efter skillelinjen `GAMLE_MAAL_FOER` =
  2/10-2026): eget kort ØVERST på Dine mål og øverst i forsidens «Din plan» — overskriften efter
  `milestones.source` (`maalKilde`: 'advisor' → «Din rådgiver foreslår et mål», 'agent'/'ai' → «AI
  foreslog et mål», 'handout' → «Et mål fra jeres handout», 'legat' → «Et mål fra forløbet»; ukendt → «Et
  mål blev foreslået»; **aldrig et personnavn** — et navn kræver et profilopslag, bevidst ikke bygget, som
  «foreslået af»), «Det er vores mål» (`bekraeftMaal`: UPDATE guardet `.is("bekraeftet_at", null)
  .eq("status", "active")`, nul rækker = fejl) og «Ikke nu» (`slipMaal`: status 'parked' — SLET
  aldrig). Gennem den eksisterende RLS («Company members can update company milestones» dækker også et
  mål, en rådgiver skrev). Rådgiveren læser kortene (`kanKlikke = !rawAdvisor`, som retningen).
- **Pladserne og databasen:** triggeren `milestones_hoejst_tre_aktive` tæller stadig ALLE `status =
  'active'` — også ubekræftede (migrationen rører den ikke). `dineMaalDom.kanOprette` er derfor
  databasens tælling, og når de ubekræftede fylder triggerens tre, siger den stiplede plads «Plads til
  et mål mere, når I har taget stilling til forslagene ovenfor» (`pladsOptagetAfUbekraeftede`) — fladen
  lover aldrig en plads, databasen afviser. **Rådets fund 2 + 3 (2/10):** hovedlinjen og
  `graenseTekst` tæller DATABASENS aktive — «N mål for de næste 12 måneder · M venter på jeres ja ·
  pladsen», og er pladserne fyldt af forslag: «Tag stilling til forslagene for at få plads til jeres
  eget mål» (`dineMaalFlade.hovedLinje(bekraeftede, ubekraeftede)`, `TAG_STILLING_TEKST`) — aldrig
  «3 pladser ledige», som databasen ville afvise (målt 2/10: 3 virksomheder har 3 aktive, mest
  maskinskrevne). Forslagskortets tekst siger kun «tæller ikke i jeres score» — ikke «i pladserne»
  (`forslagTekst`), for det ville lyve. Se åbne punkter. **Runde 2, fund 4 (ordet):** ÉT ord for et
  ubekræftet mål overalt — **«venter på jeres ja»** (hovedlinjen «· M venter på jeres ja»,
  `TAG_STILLING_TEKST` «Svar på de mål, der venter på jeres ja, for at få plads til jeres eget»,
  `BEKRAEFT_ORD.pladsOptaget`, forsidens «Venter på jeres ja», forslagsoverskriften for `manual`);
  «forslagene» er ude, fordi det gamle kort hedder «Er det stadig jeres mål?». Hovedlinjen siger
  **«Ingen bekræftede mål endnu»** (ikke «Ingen mål endnu»), når der er ubekræftede — «Ingen mål endnu»
  ville lyve, når tre står og venter (`INGEN_BEKRAEFTEDE_MAAL_TEKST`). **Rejsen viser IKKE ubekræftede
  måls frister** (`maalTal.tidslinje`: `bekraeftet_at === null` springes over; undefined = som i dag).
  VALGT «vis ikke» frem for «mærk»: Rejsen er «de næste 12 måneder» for virksomhedens EGNE mål — et
  forslag, medlemmet ikke har sagt ja til, har ingen frist, der er lovet; det tæller heller ikke som
  kort, i Score eller i fokus, og én regel («ubekræftede tæller ikke») er lettere at holde end et
  mærke, der kun findes ét sted. **Runde 2, fund 5 (forsiden):** fokusmotoren har et slot (e3) «N mål
  venter på jeres ja» → `/milestones` (`BEKRAEFT_ORD.fokusTitel/fokusTekst/fokusCta`), ét punkt, på
  samme plads som kvartalstjekket (under hastende skridt, ellers før (f)) og efter det; forsiden giver
  `delBekraeftelser(milestones).forslag + gamle` ind som `ubekraeftedeMaal` (0/null = intet punkt).

### 2. De gamle mål («Bekræft eller slip ved næste login»)

- **Hvordan «skrevet af agent/AI/handout» kendes — MÅLT i koden og git-historikken 2/10:**
  `milestones.source` (text NOT NULL DEFAULT 'manual', 20260223155456; INGEN CHECK). Skrivere gennem
  historikken: `'manual'` = medlemmets klient (useMilestones.opret, opretMaalMedTal) · `'handout'` =
  handoutEngine (løftestang → mål) · `'legat'` = create-legat-enrollment («Book dit Momentumkald») ·
  `'advisor'` = maal-skriv (fra 16/9) · `'agent'` = run-company-agent `create_milestone` (fjernet i #939
  16/9) · `'ai'` = FileUploadZone/AIProgressWidget (slettet marts 2026). Prod-fordelingen er IKKE målt af
  denne session — migrationens FØR-SQL sektion 3 måler den (Jonas' tal 1/10: 29 af 36 aktive er
  agent/AI/handout).
- **Backfillen** (i migrationen, guardet `WHERE bekraeftet_at IS NULL`): `source = 'manual'` OG `user_id`
  er medlem af målets virksomhed (`company_members`) → `bekraeftet_at = created_at`, `bekraeftet_af =
  user_id` — alle statusser. «Medlem af virksomheden», fordi klientvejen også kan bruges af en rådgiver
  med sit eget `user_id` (RLS «Users can insert own milestones» dømmer kun `user_id`). Maskinskrevne
  forbliver ubekræftede.
- **Kortet** «Er det stadig jeres mål?» — ÉT samlet kort (på Dine mål og i «Din plan») med hvert gammelt
  mål (ubekræftet, aktivt, oprettet før skillelinjen), «skrevet af din rådgiver / AI / fra et handout»
  efter kilden, «Behold» (= `bekraeftMaal`) / «Slip» (= `slipMaal`, parkér). Samme to skrivninger som
  forslaget — kun ordene er forskellige. **Rådets fund 8:** et gammelt `manual`-mål, der er
  ubekræftet, er det, NETOP fordi backfillen kræver medlemskab — teksten dækker det: «skrevet gennem
  jeres konto af en, der ikke længere er medlem» (`skrevetAf.medlem`), og kortets tekst nævner «eller af
  en, der ikke længere er medlem». **Rådets fund 13:** «Aktivér» under Parkeret er også et klik — er
  målet ubekræftet, skriver `aktiverFelter` bekræftelsen i samme UPDATE som status (medlemmet; rådgiveren
  får kun status), og «slippet»-teksten siger det («aktiverer I det igen under «Parkeret», tæller det
  som jeres»). **Runde 2, fund 3:** «Genåbn» under Nået går SAMME vej (`aktiverFelter`) — et nået,
  ubekræftet mål fra før skive 3, der genåbnes, bekræftes ved medlemmets klik (værn dom 10).
  **Runde 2, fund 8:** `GAMLE_MAAL_FOER` udledes af `KVARTALSTJEK_FRA` (én kilde: dansk midnat 2/10 som
  UTC, `kbhTilUtc(KVARTALSTJEK_FRA, 0, 0)` = `2026-10-01T22:00:00.000Z`) — før stod datoen to steder, og
  skillelinjen var UTC-midnat, ikke dansk; værn dom 7 holder udledningen og at motoren kun bærer én dato.

### 3. Pejlemærker og Score-pointet

- **/kpis:** KPI-målene hedder «pejlemærker» i al synlig tekst (`lib/kpiMaal.PEJLEMAERKE_ORD`: eyebrow
  «Pejlemærker», «Sæt/Ret pejlemærker», «Ingen pejlemærker sat endnu. Jeres mål med tal og frist står
  under Dine mål.», «pejlemærke 80.000», panelet «Pejlemærker og benchmarks», felterne «· pejlemærke»,
  «Gem pejlemærker og benchmarks»; `StandardmaalMaerke` siger «Standardpejlemærke»). Tabel- og
  kolonnenavne (`kpi_targets`, `target`) er uændrede. Rådgiverens visninger af de samme tal
  (`VirksomhedView`, `CompanyChatPane` «· mål 80.000») er IKKE omdøbt — Jonas' valg gjaldt /kpis.
- **Score:** disciplinens 25 «mål»-point læses af Dine mål — `taellerSomScoreMaal`. **MÅLT I PROD
  2/10-2026 kl. ~03:45** (hovedsessionen): 43 kundevirksomheder (er_kunde, ikke demo, ikke slettet);
  KUN 3 har `kpi_targets`; 36 aktive mål: agent 15 · handout 9 · ai 5 · manual 7; 2 virksomheder har et
  aktivt manual-mål med frist; **0 manual-mål har `art`**; 6 aktive manual-mål er ældre end 3 måneder;
  3 virksomheder har 3 aktive mål. **Beslutning (rådets fund 4):** et mål tæller, når det er aktivt,
  bekræftet og har en FRIST; `art` kræves IKKE (gamle mål har art NULL — et krav ville tage pointet
  fra alle); et tal-mål (art 'tal') skal desuden have et måltal. Regnestykket: `25 × [∃ mål: active ∧
  bekraeftet_at ∧ deadline ∧ (art ≠ 'tal' ∨ target_value)]` — står i motorens filhoved og i
  `docs/boardroom-score.md` §2.4; fail-soft'en (kpi_targets, når kolonnen mangler) er uændret. Løfteren
  siger det sande: **«Sæt et mål med en frist.»** og peger på `/milestones`. Værnene flyttet, ikke
  svækket: `boardroomScoreFlade.guard` dom 4 (kilderne: milestones ind, kpi_targets kun bag
  `erManglendeKolonne`), `score.test` (stien og ordene), `kpiMaal.test` (ordene). **Runde 2, fund 1:**
  `hentHarMaal` svarer `{ harMaal, ubekraeftede }` (fail-soft: 0 i kpi_targets-tilbagefaldet), og fylder
  de ubekræftede databasens pladser (`ubekraeftedeMaal ≥ MAX_AKTIVE_MAAL`), siger løfteren **«Sig ja til
  et af jeres mål med en frist.»** (vejen er «Behold») — «Sæt et mål» ville databasen afvise.
  **Runde 2, fund 6 (tabet):** bogført i `docs/boardroom-score.md` §2.4 — et medlem med kpi_targets og
  uden bekræftet aktivt mål med frist går fra 25 til 0 mål-point efter migration + Update (højst 3
  virksomheder; de 2 med backfillet manual-mål med frist beholder pointet); `forrige` viser ingen nedgang.

### 4. Kvartalstjekket («Medlemmet selv» + rådgiverens linje)

- **Regnestykket** (`maalBekraeft.ts`, prøvet): `anker = max(bekraeftet_at som dansk dato,
  KVARTALSTJEK_FRA)`, **`KVARTALSTJEK_FRA = 2026-10-02`** (ét sted i motoren, ordret i migrationens
  policy — værn dom 7); `dato_k = laegMaanederTilDato(anker, 3·k)`, k = 1, 2, 3 (måned 3, 6, 9); `slut =
  anker + 12 måneder`. Et tjek k VENTER, når `dato_k ≤ i dag < slut`, målet er aktivt og bekræftet, og
  ingen registreret række har `kvartal ≥ k`; er flere forfaldne, venter kun det SENESTE (ét kort), og
  svaret dækker de tidligere (`UNIQUE (milestone_id, kvartal)`). Eks.: bekræftet 15/10-2026 → 15/1,
  15/4, 15/7-2027; i dag 20/4-2027 → kvartal 2 (måned 6). Bekræftet 31/8 → 30/11 (dagen klippes — som
  Postgres' `date + interval`). **Ankeret (beslutning 2/10, rådets fund 9):** backfillen sætter
  `bekraeftet_at = created_at` (beholdt — bekræftelsen er historik), og målt 2/10 er 6 aktive manual-mål
  ældre end 3 måneder: uden ankeret fik de et kvartalstjek på DAG 1, før nogen havde set modellen. Med
  ankeret er deres første tjek 2/10 + 3 mdr. = **2/1-2027**; et mål bekræftet efter 2/10 ankrer på sin
  egen dato. Jonas' «3/6/9 fra aktivt» gælder dermed fra den dag, modellen findes.
- **Tabellen** `maal_kvartalstjek` (milestone_id FK cascade, company_id FK cascade, kvartal 1|2|3,
  valg behold|justeret|parkeret|naaet, valgt_af default auth.uid(), valgt_at). RLS: medlem SELECT/INSERT
  company-scoped (+ `valgt_af = auth.uid()` + målet hører til virksomheden), rådgiver SELECT; ingen
  UPDATE/DELETE (append-only). Ordforrådet `KVARTALER`/`KVARTAL_VALG` står ORDRET i CHECK'ene (værn dom 4).
  **INSERT-policyen dømmer det samme som klienten (rådets fund 11):** målet er bekræftet, kvartalet er
  forfaldent (`greatest(bekraeftet_at dansk dato, date '2026-10-02') + 3·kvartal mdr. ≤ i dag < anker +
  12 mdr.`), ingen række med `kvartal ≥` det nye, og status passer til valget — `behold`/`justeret`
  kræver `active`; `parkeret` tillader `active`/`parked`; `naaet` `active`/`completed` — fordi klienten
  skriver handlingen FØR rækken. Klientens spejl er `maaRegistrereKvartalstjek` (prøvet), og
  `dineMaalSkive3.guard` dom 7 holder konstanten og udtrykkene ens. Et afvist INSERT (42501) viser
  klienten som «Valget er gemt, men kvartalstjekket blev ikke registreret».
- **Kortet** (Dine mål + «Din plan»): «Måned 6: Er målet stadig det rigtige?» med **Behold** (kun rækken) ·
  **Justér tal og dato** (på Dine mål: åbner `RedigerMaalDialog`, og rækken skrives som 'justeret' FØRST
  når dialogen har gemt — `kvartalEfterGem`; på forsiden: et link til `/milestones#kvartalstjek`) ·
  **Parkér** (`slipMaal` → række) · **Nået** (KUN ved klik — i BEGGE flader gennem den guardede
  `hooks/maalNaaetKlik.ts` (`skriv.markerNaaet`, ok/grund, status `active` → `completed`, nul rækker =
  fejl); rådets fund 1 (2/10): `useMilestones.markerNaaet` svarer void og sluger fejlen, så rækken ville
  blive skrevet efter en fejlet handling — nu registreres rækken KUN efter ok (værn dom 8). Målkortets
  eget «Markér som nået» går stadig gennem `useMilestones` med fejringen. **Runde 2, fund 7:** på Dine
  mål FEJRER kvartalstjekkets «Nået» efter ok med SAMME fejring (`useMilestones.fejr` — konfetti, toast,
  aktivitetsbesked, Slack), før rækken; forsidens kvartalstjek fejrer bevidst IKKE (ingen
  `useMilestones` på forsiden; fejringen hører /milestones til — som hidtil). **Runde 2, fund 9:** FØR
  INSERT'en kalder `registrerKvartalstjek` klientens spejl af policyen MED GRUND (`doemKvartalstjek`;
  `maaRegistrereKvartalstjek` er samme dom uden grund) på målet SOM DET STÅR efter handlingen
  (`statusEfterKvartalValg`) og de registrerede rækker — grunden («ikke forfaldent», «allerede
  besvaret», «kun et bekræftet mål …», «status passer ikke», «året er gået»; `KVARTALSTJEK_GRUND`) vises
  i stedet for policyens 42501; målet ukendt → ingen fordom, databasen dømmer (værn dom 9). **Runde 2,
  fund 2:** `kvartalEfterGem` nulstilles i `RedigerMaalDialog`s `onClose` (også ved Annuller og ved Gem
  uden ændringer), så en senere «Redigér» aldrig registrerer et tjek, der ikke blev taget (prøvet). `dineMaalGrundlag` skriver
  stadig aldrig 'completed' — `maalTal.guard` dom 7). **Handlingen FØR rækken:** fejler rækken, står
  kortet igen næste gang (harmløst); fejler handlingen, skrives ingen række. **Fejler hentningen af de
  registrerede tjek** (`kvartalstjekFejlede`, ikke «tabellen mangler»), tegnes INTET tjek i nogen af
  fladerne, og Dine mål siger det (`KVARTALSTJEK_FEJLEDE_TEKST`) — rådets fund 6: uden rækkerne ville
  et taget tjek stå igen.
- **Forsidens fokus:** `nextStep.ts` slot (e2) «Kvartalstjek, måned 6: <mål>» for det ældste forfaldne —
  SAMME plads som målets (2)/(3): under det sidste hastende skridt, ellers før (f); CTA «Tag
  kvartalstjekket» → `/milestones#kvartalstjek`. Input `kvartalstjek` (tom/null = intet punkt).
- **Rådgiverens forside** («I dag», under «Mangler at booke»): ÉN linje «N kvartalstjek venter hos
  medlemmerne», foldbar med virksomhederne (link + «2 tjek»); nul → «Ingen kvartalstjek venter.»;
  migrationen ikke kørt → «Kvartalstjekkene er på vej». Hentningen er rådgiverbred (milestones aktive +
  bekræftede, maal_kvartalstjek, companies for de ramte) side for side; **kun virksomheder i husets
  univers tæller** (`medlemsOverblik.iUniverset`: kunde, ikke demo, ikke legat, aktiv/status-løs — og
  `data_slettet_at IS NULL`), som «Mangler at booke» (rådets fund 5; `filtrerTilUniverset`, prøvet);
  fail-soft kun på migrationen, enhver anden fejl siges med `raadgiverHentefejlTekst` (kilden
  «kvartalstjekkene»).

### 5. Rækkefølgen

**Tørkørt 2/10-2026 kl. ~04:30 dansk** (migrationens filhoved «TØRKØRT»): kroppen kørt i prod i en
DO-blok, rullet tilbage med RAISE EXCEPTION — alle sætninger OK, backfill ville ramme 13 rækker (alle
statusser), 3 policies; efter: kolonnerne og tabellen findes ikke (målt).
1. Merge. 2. FØR-SQL (migrationens filhoved; sektion 3 = source-fordelingen, 5–6 = backfillens
størrelse). 3. KØR `20261002100000` i Lovable → SQL editor. 4. EFTER-SQL. 5. MÅL over REST:
`milestones?select=bekraeftet_at,bekraeftet_af&limit=0` → 200 og `maal_kvartalstjek?select=id&limit=0`
→ 200. Svarer målingen 42703/PGRST204/PGRST205, EFTER at EFTER-SQL'en viste kolonnerne: det er
PostgRESTs schema-cache — vent og mål igen; **klik ikke Update før 200** (rådets fund 10; i mellemtiden
ville `opretMaalMedTal` falde tilbage til en insert UDEN bekræftelsen, og medlemmets eget mål ville
«vente på jeres ja»). 5b. Manuel prøve: sæt et mål som et kundemedlem og se `bekraeftet_at`/`bekraeftet_af`
på rækken — beviset for, at REST tager imod INSERT med de nye kolonner (beskrevet i migrationens
filhoved, køres ikke som del af migrationen). 6. Update. Klienten er fail-soft i begge retninger (før
migrationen: som i dag; efter: modellen tændt), så rækkefølgen migration → Update er den sikre, ikke
den eneste.

### 6. Ikke bygget / åbne punkter (skive 3)

13. **Triggeren tæller ubekræftede.** `milestones_hoejst_tre_aktive` tæller alle aktive; en trigger, der
    kun tæller bekræftede (og tæller en bekræftelse som «bliver aktiv»), kræver en ændring af en
    trigger-funktion — kræver grønt lys. Fladen er ærlig imens (§1, «Plads, når I har taget stilling»).
14. **Rådgiverens vej** (`maal-skriv`) sætter ikke `bekraeftet_*` — rigtigt (rådgiverens mål ER et
    forslag), men den kender heller ikke skive 2's felter (åbent punkt 1).
15. **Ingen notifikation** til rådgiveren, når et medlem slipper eller bekræfter — linjen på forsiden
    dækker kvartalstjekkene; et «foreslået/bekræftet»-mærke på rådgiverens Planen er ikke bygget.
16. **Kvartalstjek pr. mål, ikke pr. virksomhed:** tre bekræftede mål med samme anker giver tre kort
    samme dag. Jonas bad om «pr. mål».
17. **Rådgiverens KPI-visninger** (`VirksomhedView`, `CompanyChatPane`) siger stadig «mål» om pejlemærkerne.
18. **`useMilestones.opret`** (den gamle oprettelsesvej) sætter ikke `bekraeftet_at` — et mål oprettet ad
    den vej ville stå som «Et mål venter på jeres ja» (kilde 'manual'). Målt 2/10: `useMilestones` kaldes
    kun af `DineMaalView`, som ikke destructurer `opret` — fladen opretter kun gennem `opretMaalMedTal`.
19. **pg_policy er ikke målt** for de politikker, bekræftelsen hviler på («Company members can update
    company milestones») — kodelæst (20260224222456:196), målt indirekte af EFTER-SQL'en i 20261001190000
    («10 politikker uændret»). Migrationens FØR-SQL sektion 7 måler dem igen.
20. **`opgave-accepter` kræver et AKTIVT mål — og et ubekræftet mål ER `status = 'active'`** (rådets
    fund 14, 2/10): et skridt foreslået under et forslag kan accepteres af medlemmet, før målet er
    bekræftet. Forsiden viser skridtene under «Venter på jeres ja» (rådets fund 7: `forsidePlan.venterPaaJa`
    — aldrig «Uden mål», og `ingenAktive` er først sand, når hverken bekræftede eller ubekræftede
    findes), men functionen dømmer ikke på bekræftelsen. Ikke rettet: det kræver, at `opgave-accepter`
    (og `skridt-tilfoej`) lærer `bekraeftet_at` at kende — en function-ændring med udrulning. Bogført
    som åbent punkt.
