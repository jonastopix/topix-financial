# Dine mål — målmodellen, tal-målene og sporet (motor 1/10-2026)

**Status:** motoren er bygget (branch `feat/dine-maal-motor`), ingen flade. Migrationen
`20261001190000_maal_tal.sql` er IKKE kørt. Designpapiret (produkt og teknik) ligger
som udkast i hovedsessionens scratchpad (`maal-produkt.md` §2, `maal-teknik.md`) — dette
dokument er den del, motoren bygger på, bogført i repoet.

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
- **Ingen flade endnu.** Handoutets egen side står uændret; at fjerne de tre spørgsmål dér er en
  fladebeslutning.
