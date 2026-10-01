# Dine mål — målmodellen, tal-målene og sporet (motor 1/10-2026)

**Status:** motoren er bygget (branch `feat/dine-maal-motor`), ingen flade. Migrationen
`20261001210000_maal_tal.sql` er IKKE kørt. Designpapiret (produkt og teknik) ligger
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

## 1. Målmodellen

Et mål er én sætning, ét tal og én dato. To arter (`milestones.art`):

| art | Fremdrift | Krævet ved oprettelse (`doemNytMaal`) |
|---|---|---|
| `tal` | **læses** af godkendte måneder (husets nøgler) — eller tastes (`andet_tal`) | titel · nøgle · måltal · udgangspunkt (≠ måltal) · frist efter i dag; `andet_tal` også en enhed |
| `begivenhed` | skridtene («ansat den første») | titel · frist efter i dag; måltal = 1, udgangspunkt = 0 |
| `NULL` | — | et mål fra før designet: kortets eneste handling er «Gør målet skarpt» |

Kolonnerne (migration `20261001210000`, kun tilføjende): `art`, `maal_noegle`, `udgangspunkt`,
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
- Tallet bærer `prMaaned` (seneste måned bag tallet) → «pr. august (godkendt)».

## 3. Sporet (`sporet`)

```
start          = udgangspunkt_dato ?? created_at som DANSK dato
slut           = deadline
forventetAndel = clamp((i dag − start) ÷ (slut − start), 0, 1)        — danske kalenderdage
andelAfVejen   = (tal − udgangspunkt) ÷ (måltal − udgangspunkt)       — rå, kan være < 0 eller > 1
```

Samme formel for et mål, der SÆNKER et tal (måltal < udgangspunkt): tæller og nævner er begge
negative, når tallet bevæger sig rigtigt. Fra 60 mod 30, tal 45 → (45 − 60) ÷ (30 − 60) = 0,5.

| Status | Regel |
|---|---|
| `kan_ikke_afgoeres` | gammelt mål, begivenhed, intet tal, intet udgangspunkt, intet måltal, ingen frist, udgangspunkt = måltal, slut ≤ start (grunden står i `grund`) |
| `naaet_i_tal` | andelAfVejen ≥ 1 — et SIGNAL («markér målet som nået, når I er i mål»), aldrig et lukket mål |
| `foran` | andelAfVejen ≥ forventetAndel + 0,15 |
| `paa_sporet` | andelAfVejen ≥ forventetAndel − 0,10 |
| `bagud` | ellers |

`kraeverPrMaaned = (måltal − tal) ÷ (dageTilbage ÷ 30,4375)` — null når fristen er nået/passeret,
uden tal/måltal/frist, eller når måltallet er nået. For årstakterne betyder det: så meget skal
ÅRSTAKTEN stige pr. måned. Negativ = tallet skal ned.

Eksempel (prøvet i `maalTal.test.ts`): udgangspunkt 1 mio. 1/4-2026, mål 2 mio. 1/4-2027, i dag
1/10-2026 → forventet 183/365 ≈ 0,501. Årstakt 1,44 mio. → 0,44 af vejen ≥ 0,401 → **På sporet**.

## 4. Næste skridt, kortet, guiden, tidslinjen

- **`naesteSkridt`:** det aktive skridt med nærmeste frist (også et forfaldent); ellers det
  nyeste ventende forslag; plus antal øvrige åbne og gjorte. Grupperne er `planen.grupperSkridt`.
- **`maalKort`:** alt ét kort tegner — titel, art, tal i ord (`vaerdiTekst`: «1,58 mio. kr.»,
  «620.000 kr.», «4,2 mdr.», «36 %»), «pr. …»-teksten, måltal, udgangspunkt, sporet, statusordet,
  frist-teksten («om 6 mdr.», «om 2 uger», «i morgen», «overskredet for 3 dage siden») og næste
  skridt. Ordene står ét sted: `MAAL_ORD`.
- **`nytMaalForslag`:** udgangspunkt = nuværende tal, udgangspunkt_dato = i dag (dansk), frist
  foreslået 12 måneder frem, «kræver X pr. måned» for et givet måltal. **`doemNytMaal`** dømmer
  guidens input fail-closed.
- **`tidslinje`:** 12 måneder fra start med kvartalsmarkører (+3, +6, +9), gjorte skridt
  (`closed_at`, dansk dato) og målenes frister (ikke parkerede). **Start = medlemskabets start**
  (`companies.contract_start_date`, rullet frem i hele år til det indeværende medlemsår) —
  fordi 12-måneders-rytmen (intro-session = måned 0, kvartalstjek 3/6/9, årsbrevet 11–12) tæller
  fra medlemskabet, og Score-grundlaget henter feltet i forvejen. Uden kontraktstart: det
  tidligste ikke-parkerede måls start; ellers i dag.

## 5. Hentning og skrivning (`src/hooks/dineMaalGrundlag.ts`)

- Månederne og `kontraktStart` deles med Boardroom Score (samme queryKey og `hentScoreGrundlag`)
  — én facts-hentning på forsiden. Står Score `afventer_migration`, er månederne null og
  tal-målene siger «Tallet kan ikke læses endnu».
- Målene læses med de nye kolonner; svarer databasen 42703/PGRST204
  (`manglendeTabel.erManglendeKolonne`), læses de gamle, de nye felter er null, og
  `afventerMigration` er sand. Enhver anden fejl kaster.
- Skrivning: medlemmets klientvej (`opretMaalMedTal`, `goerMaalSkarpt`) — RLS uændret (politikkerne
  dømmer rækken, ikke kolonnen; se migrationens filhoved). Bogført i `maalSkriv.guard` dom 3.

## 6. Åbne punkter

1. **Rådgiverens vej:** `maal-skriv` kender ikke de nye felter. En udvidelse er en ændring i en
   edge function og kræver eksplicit udrulning — ikke gjort.
2. Migrationen skal KØRES og MÅLES (`GET /rest/v1/milestones?select=art,maal_noegle,udgangspunkt,udgangspunkt_dato&limit=0` → 200), før en flade skriver felterne.
3. **pg_policy på milestones er ikke målt** — RLS-fundet i migrationens filhoved er kodelæst.
4. Score's disciplinpoint for «mål» læser stadig `kpi_targets` (designpapiret §2 foreslår at
   flytte dem til «aktivt mål med tal og dato») — ikke en del af motoren.
5. Hvilken af 42703/PGRST204 Lovables PostgREST giver for en ukendt kolonne er ikke målt — begge
   genkendes.
