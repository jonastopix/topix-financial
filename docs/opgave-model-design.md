# Opgave-model — design

**Besluttet**: 2026-08-22
**Status**: Form besluttet (B1-B11). Datamodel implementeret. UI og RLS er ikke besluttet.
**Grundlag**: `docs/opgave-model-kortlaegning.md` (kode-evidens) og måling mod prod 2026-08-22.
**Migration**: `supabase/migrations/20260822220000_opgave_model_kolonner.sql` (PR #382)
**Placering**: Fase 1 i chat-epicet. Se `BACKLOG.md` → "Chat-epic — fund fra recon 2026-08-21".

---

## 1. Baggrund

Intet i platformen registrerer i dag en **aftale** mellem rådgiver og medlem. Alt er enten systemets forslag eller medlemmets egne noter. Når en rådgiver og en virksomhed bliver enige om noget i chatten, findes det bagefter kun som tekst i tråden. Ingen kan spørge systemet hvad der blev aftalt — heller ikke rådgiveren selv, tre uger senere.

Det er den direkte årsag til at en rådgiver ikke kan se hvor en relation står uden at læse hele samtalen igennem.

### Målt mod prod 2026-08-22

| Signal | Tal | Vurdering |
|---|---|---|
| `milestones` i alt | 102 | |
| — fuldført | 8 (8%) | Lukkes stort set aldrig |
| — aktive med overskredet deadline | 24 | Ingen rydder op |
| — uden deadline overhovedet | 61 | Datoen er valgfri i dag |
| — nyeste oprettet | 2026-06-30 | Ingen ny i 53 dage |
| `company_actions` | 70 på 10 virksomheder | AI-genererede forslag, alle `status = 'open'` |
| `weekly_focus` | 110 | AI-genereret, ugentligt |
| Handout-løftestænger udfyldt | 28 af 38 (74%) | Højeste engagement i platformen |
| Virksomheder med finansrapport | 22 af 34 | |
| — med rapport nyere end 60 dage | 11 af 34 | To tredjedele har ikke friske tal |

De 74% på handout-løftestænger er afgørende: medlemmerne skriver gerne ned hvad de selv vil gøre. Det er ikke motivation der mangler — det er et sted hvor det bliver til noget.

---

## 2. Beslutningerne

### Grundform

**B1 — Medlemmet forpligter sig.**
Rådgiver og AI kan foreslå, men intet er en opgave før medlemmet har trykket ja. Et ubesvaret forslag er et signal, ikke en fejl.

Opretter medlemmet selv en opgave, springes accept-trinnet over. De har forpligtet sig ved at skrive den.

**B2 — Opgaver udløber på deres dato.**
Når datoen passerer, spørger systemet én gang: gjort / ikke gjort / ikke endnu. Ingen manuel oprydning. Stilhed bliver information frem for gæld.

**B3 — Ingen opgave uden dato.**
Datoen er obligatorisk, ikke et valgfrit felt. Den er det der udløser B2. Uden den har vi bygget milestones om igen, hvor 61 af 102 aldrig fik en.

**B4 — Én flad model.**
Intet mål/handling-hierarki. Et langsigtet mål er en opgave med lang horisont. Hierarki kan komme senere hvis det savnes; det omvendte er dyrere.

**B5 — Refleksioner er ikke opgaver — de er stedet hvor opgaver opstår.**
Refleksionen efter en rapportering skal pege på konkrete tal, huske hvad medlemmet skrev sidst, og munde ud i et forslag medlemmet kan sige ja til.

### Livscyklus

**B6 — Medlemmet sætter datoen ved accept.**
Et forslag kommer uden dato. Datoen vælges af den der forpligter sig, ikke af den der foreslår. Accept er dermed to handlinger: sig ja, og vælg hvornår.

> **Registreret indvending (Claude, 2026-08-22):** hver ekstra handling har historisk kostet næsten al adoption i denne platform — 8% fuldførte milestones, nul interne noter, nul kvitteringer. Alternativet var at forslaget bærer en foreslået dato medlemmet kan ændre (ét tryk ved accept). Jonas' modargument vejer tungere: en dato medlemmet ikke selv har valgt, er ikke en forpligtelse, den er et nik. Hele B1 hviler på at den er deres.
>
> **Skal observeres:** accept-raten. Er den lav, er den foreslåede-dato-variant den første justering at prøve.

**B7 — "Ikke endnu" er aftagende, ikke ubegrænset.**
Første udskydelse er gratis. Anden gang spørger systemet om opgaven stadig er relevant, med "drop den" som ligeværdigt valg. Tredje gang lukkes den.

Det vigtige er ikke tallet, men at **"drop den" skal være et lige så pænt svar som "gjort"**. Er fuldførelse den eneste værdige udgang, udskyder folk i stedet for at erkende — og så er vi tilbage ved 94 evigt aktive milestones. En bevidst droppet opgave er et sundt udfald.

**B8 — Ubesvarede forslag udløber for medlemmet, men tælles for rådgiveren.**
Et forslag forsvinder fra medlemmets liste når `expires_at` passerer. Kendsgerningen om at det lå ubesvaret bliver i data og fodrer tilstandslaget i fase 2 — "otte forslag ubesvaret siden maj" bliver en anledning på virksomhedskortet.

Uden en udgang vokser bunken med cirka 150 om året pr. aktiv virksomhed (op til 3 AI-forslag hver mandag).

> **Bevidst konsekvens:** medlem og rådgiver ser forskellige ting om samme forslag. Rådgiveren ved noget medlemmet ikke kan se på sin egen skærm.

**B9 — Kun det levende migreres, og kun ved at medlemmet vælger det.**
Ved lancering præsenteres hver virksomheds aktive milestones som forslag: er det her stadig noget du vil? Ja plus dato bliver til en opgave. Nej bliver arkiveret. Fuldførte bevares som historik.

Det er ikke en migration, det er modellens første anvendelse. Medlemmet møder præcis den mekanik der gælder fremover, på materiale de selv har skabt.

**Migrations-forslag udløber som alle andre (B8).** Bestanden er død — 8% fuldførelse, ingen ny på 53 dage. Tager nogen ikke stilling til deres egne gamle mål, er det svaret. At holde dem kunstigt i live modsiger grunden til at modellen bygges om.

### Tal

**B10 — Udløbsfristen afhænger af kilden.**
Forslag er ikke lige meget værd, og skal ikke leve lige længe.

| Kilde | `source_type` | Frist |
|---|---|---|
| Rådgiverforslag | `advisor` | 30 dage |
| Født af en refleksion | `reflection` | 21 dage |
| Ugefokus, AI-genereret | `ai_weekly`, `agent` | 14 dage |

Rådgiverforslag lever længst: der er brugt tid på dem, og medlemmet bør have rimelig tid til at forholde sig. Ugefokus lever kortest: der kommer nye hver mandag, og et forslag fra tre uger siden er sjældent stadig det rigtige. De 14 dage svarer til to ugefokus, så et forslag ikke forsvinder før medlemmet har haft mindst to chancer for at se det.

**B11 — Udskydelse: fast interval første gang, valgt dato anden gang.**
Første "ikke endnu" flytter opgaven **14 dage** frem automatisk. Ét tryk, ingen datovælger.

Anden gang — hvor systemet alligevel spørger om opgaven stadig er relevant — vælger medlemmet selv den nye dato.

Det følger B7's optrapning: første gang er let, anden gang kræver stillingtagen. Datovælgeren bruges præcis der hvor den betyder noget.

---

## 3. Hvad der erstattes

### 3.1 `milestones` — erstattes

**Fire oprettelseskilder**, alle med `source`-felt:

| Kilde | Aktør | `source` | Sætter deadline |
|---|---|---|---|
| `src/pages/Milestones.tsx:99-112` | Manuel | `manual` | Valgfrit |
| `src/lib/handoutEngine.ts:163-185` | Medlem, løftestang→milestone | `handout` | Valgfrit |
| `supabase/functions/run-company-agent/index.ts:544-587` | AI-agent | `agent` | Ja, i dag + 30 dage |
| `supabase/functions/create-legat-enrollment/index.ts:169-179` | Legat-onboarding, auto | `legat` | — |

At kun AI-agenten sætter deadline automatisk forklarer hvorfor 61 af 102 mangler den. Bemærk at netop den automatik er det B6 afviser: en dato på i dag plus tredive dage betyder ingenting.

**Medlemsflader:** `/milestones` (kun tilgængelig som underpunkt under "Dine tal", `HbMemberShell.tsx:60`), forsidens fokus-kort via `deriveFocus`, pulse-modalens progress-beregning, legat-dashboardet.

**Rådgiverflader:** `AdvisorDashboard.tsx:357-375` (aktive + nyligt fuldførte på company-kortet), `MemberDetail.tsx:412, 1351-1460`.

**Bemærk:** medlemmet ser ikke overskredne milestones som overskredne nogen steder — se §6.1.

### 3.2 `company_actions` — bærer den nye model

Skemaet bar allerede halvdelen af forpligtelses-maskineriet: `status` med open/done/parked/dismissed, `completed_at`, `dismissed_at`, `source_id` og `context`. Accept- og afvis-kontrollerne fandtes — men kun i død kode (`DashboardActionCenter.tsx:321, 335`). Den levende medlemsflade (`BoardroomView.tsx:1345-1358`) havde **ingen mutation overhovedet**: alle 70 handlinger stod permanent på `open`.

Derfor blev tabellen udvidet frem for erstattet. Se §7.

### 3.3 `pulse_checkins` — erstattes ikke, men får en udgang

Felterne er `went_well`, `biggest_challenge`, `help_needed` (fritekst) og `milestone_progress` (auto-beregnet, ikke indtastet).

**Der findes intet næste-skridt-, forpligtelses- eller datofelt i tabellen.** Det er hele grunden til at refleksioner bliver løs snak: der er ingen udgang fra dem. B5 kræver at refleksionen kan munde ud i et forslag med `source_type = 'reflection'`.

Én kanal når allerede rådgiveren: `help_needed` vises som banner i chatten (`CompanyChatPane.tsx:691-698`) og bygger rådgiverlistens `report_no_reflection`-tilstand.

### 3.4 `weekly_focus` — erstattes IKKE

Weekly focus er ikke et opgavelager. Det er en ugentlig sammenfatning med `headline`, `summary` og trigger-data, der blandt andet **producerer** `company_actions` (`generate-weekly-focus/index.ts:539-562`).

Den bliver stående som forslagskilde. Den skal ikke smeltes ind i opgave-modellen — den skal fodre den.

Rådgiveren ser i dag kun en boolean "har én denne uge" (`AdvisorDashboard.tsx:376-381`). Headline og summary vises ikke.

---

## 4. Åbne spørgsmål

**4.1 Hvordan præsenteres migrationen i B9?**
En virksomhed med tolv aktive milestones møder tolv spørgsmål. Alt på én gang, eller fordelt over tid? Ikke besluttet.

**4.2 Hvad sker der med opgaver når en virksomhed forlader platformen?**
**Delvist svar fra kortlægningen:** der findes ingen offboarding-livscyklus, kun hard delete via `companyHardDelete.ts`. `company_actions` har `ON DELETE CASCADE` på `company_id`; **`milestones.company_id` har ikke** (`20260224222456…:104`), hvilket blokerer en rå `DELETE FROM companies`. Fornyelsesbeslutningen (`company_fornyelse`) registrerer hensigt, men udløser ingen datahåndtering.

**4.3 RLS på de nye kolonner.**
De eksisterende politikker på `company_actions` giver medlemmer read/insert/update på egen company og rådgivere SELECT på alle. B1 kræver at kun medlemmet kan sætte `accepted_at` og `due_date`; B8 kræver at rådgivere kan læse `expires_at` på udløbne forslag. Ikke besluttet.

### Lukket siden første udgave

- Hvor mange gange kan "ikke endnu" siges? → **B7**
- Hvem sætter datoen? → **B6**
- Udløber et ubesvaret forslag? → **B8**
- Kan rådgiveren se ubesvarede forslag? → Nej i dag, verificeret. Løses i fase 2 via **B8**
- Hvad sker der med de 102 eksisterende milestones? → **B9**
- Hvor længe ligger et forslag før det udløber? → **B10**
- Hvad sker der ved en udskydelse? → **B11**

---

## 5. Hvad der ikke er besluttet

UI og RLS-politikker. Datamodellen er implementeret (§7).

Motor-først-mønstret gælder: forpligtelses- og udløbslogikken (B2, B7, B8, B10, B11) udtrækkes og testes som ren motor før nogen flade bygges. Motoren skal kunne afgøre lovlige tilstandsovergange, beregne udløb ud fra kilde, håndtere forfald, håndtere udskydelse med tælleren, og udlede hvad en virksomhed skylder lige nu.

---

## 6. Fund fra kortlægningen der skal bogføres

**6.1 Månedsdigesten viser overskredne deadlines som kommende.**
`send-monthly-digest/index.ts:201-211` bruger `.lte("deadline", in30Days)` uden nedre grænse. Overskredne rækker medtages og renderes under overskriften "Milestones med deadline snart:" (`:267`) med den passerede dato printet som var den kommende. Cron den 22. kl. 08:00 (`20260810230000_cron_oprydning.sql:74-79`). **Dette er den eneste kanal hvor en overskredet milestone når et medlem — og den præsenterer den forkert.** Uafhængig af opgave-modellen; kan lukkes selvstændigt.

**6.2 `run-company-agent` skrev ugyldig `source_type`.**
`run-company-agent/index.ts:736-756` (`write_company_action`) skriver `source_type: "agent"`. CHECK-constrainten tillod kun `ai_weekly|milestone|handout|manual`. **Lukket i databasen 2026-08-22** — `agent` er nu en gyldig værdi (§7). Koden er ikke ændret.

**6.3 `AdvisorCompanyOverview.tsx` er død kode.**
Refereres ingen steder uden for sig selv. Blev vedligeholdt i PR #378 uden at nogen ser den. Skal slettes, ikke vedligeholdes.

**6.4 `AdvisorAlertsPanel.tsx` importeres men renderes aldrig.**
Import i `AdvisorDashboard.tsx:17` er eneste forekomst i filen. Panelet indeholder færdigbygget overdue- og stalled-alerting med snooze (`:104-131, 237-263`). Femte tilfælde af mønsteret "bygget færdigt, aldrig koblet til en flade" — se `BACKLOG.md`, P4 "Amputeret beregning".

**6.5 `milestones.company_id` mangler `ON DELETE CASCADE`.**
Afviger fra de tre øvrige tabeller. Se §4.2.

---

## 7. Datamodel (implementeret 2026-08-22)

Migration: `supabase/migrations/20260822220000_opgave_model_kolonner.sql`, PR #382. Kørt manuelt i Lovable SQL editor og verificeret via `pg_constraint`. Ingen data rørt.

### Tilstande

| Status | Betydning |
|---|---|
| `proposed` | Foreslået, ikke besvaret. Ingen dato endnu. |
| `active` | Accepteret af medlemmet, har dato. |
| `done` | Fuldført. |
| `not_done` | Nåede det ikke ved forfald. |
| `dropped` | Ikke relevant længere, aktivt valg. |
| `dismissed` | Afvist som forslag, aktivt valg. |
| `expired` | Forslag der aldrig blev besvaret. |

`dismissed` og `expired` skilles ad med vilje: det ene er et nej, det andet er tavshed. `not_done` og `dropped` ligeså: det ene handler om kapacitet, det andet om prioritet.

`open` og `parked` er overgangsværdier der fjernes i spor 2 efter datamigreringen af de 70 eksisterende rækker.

### Nye kolonner

| Kolonne | Type | Formål |
|---|---|---|
| `due_date` | `date` | B3/B6. Bundet af CHECK: `status <> 'active' or due_date is not null` |
| `accepted_at` | `timestamptz` | B1. Grundlag for accept-raten i B6 |
| `deferral_count` | `integer not null default 0` | B7/B11 |
| `expires_at` | `timestamptz` | B8/B10 |
| `closed_at` | `timestamptz` | Sluttilstand, uanset hvilken |
| `proposed_by` | `uuid → auth.users on delete set null` | NULL = system/AI. Ellers rådgiverens id |

`user_id` er altid **medlemmet der ejer opgaven**. `proposed_by` er **den der foreslog**. To forskellige mennesker, to kolonner.

`completed_at` og `dismissed_at` er overflødiggjort af `closed_at`. De bliver liggende urørte og droppes i et senere spor med bevis.

### Indeks

To partielle indeks til de kommende cron-job: `idx_company_actions_expiry` på `expires_at` hvor status er `proposed`, og `idx_company_actions_due` på `due_date` hvor status er `active`.

---

## Beslutningslog

| Dato | Beslutning |
|---|---|
| 2026-08-22 | B1-B5 truffet. Opgave-modellen bygges før tilstandslaget, fordi tilstandslaget uden aftaler kun kan rapportere stilhed og talfriskhed. |
| 2026-08-22 | `weekly_focus` erstattes ikke — den bliver stående som forslagskilde. |
| 2026-08-22 | B6 truffet: medlemmet sætter datoen ved accept. Claudes indvending registreret i B6; accept-raten skal observeres. |
| 2026-08-22 | B7 truffet: "ikke endnu" er aftagende over tre trin, med "drop den" som værdigt udfald. |
| 2026-08-22 | B8 truffet: ubesvarede forslag udløber for medlemmet, tælles for rådgiveren. Asymmetrien er bevidst. |
| 2026-08-22 | B9 truffet: kun aktive milestones migreres, og kun ved medlemmets valg. Migrations-forslag udløber som alle andre. |
| 2026-08-22 | `company_actions` udvides frem for erstattes. Et upræcist tabelnavn er en mindre pris end en unødig migration af levende produktionsdata. |
| 2026-08-22 | B10 truffet: udløbsfrist pr. kilde — 30 dage for rådgiver, 21 for refleksion, 14 for ugefokus. |
| 2026-08-22 | B11 truffet: udskydelse er 14 dage automatisk første gang, valgt dato anden gang. |
