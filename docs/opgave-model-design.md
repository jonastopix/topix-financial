# Opgave-model — design

**Besluttet**: 2026-08-22
**Status**: Form besluttet. Datamodel, tabelnavne, RLS og UI er ikke besluttet.
**Grundlag**: `docs/opgave-model-kortlaegning.md` (kode-evidens) og måling mod prod 2026-08-22.
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

## 2. De fem beslutninger

**B1 — Medlemmet forpligter sig.**
Rådgiver og AI kan foreslå, men intet er en opgave før medlemmet har trykket ja. Et ubesvaret forslag er et signal, ikke en fejl.

**B2 — Opgaver udløber på deres dato.**
Når datoen passerer, spørger systemet én gang: gjort / ikke gjort / ikke endnu. Ingen manuel oprydning. Stilhed bliver information frem for gæld.

**B3 — Ingen opgave uden dato.**
Datoen er obligatorisk, ikke et valgfrit felt. Den er det der udløser B2. Uden den har vi bygget milestones om igen, hvor 61 af 102 aldrig fik en.

**B4 — Én flad model.**
Intet mål/handling-hierarki. Et langsigtet mål er en opgave med lang horisont. Hierarki kan komme senere hvis det savnes; det omvendte er dyrere.

**B5 — Refleksioner er ikke opgaver — de er stedet hvor opgaver opstår.**
Refleksionen efter en rapportering skal pege på konkrete tal, huske hvad medlemmet skrev sidst, og munde ud i et forslag medlemmet kan sige ja til.

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

At kun AI-agenten sætter deadline automatisk forklarer hvorfor 61 af 102 mangler den.

**Medlemsflader:** `/milestones` (kun tilgængelig som underpunkt under "Dine tal", `HbMemberShell.tsx:60`), forsidens fokus-kort via `deriveFocus`, pulse-modalens progress-beregning, legat-dashboardet.

**Rådgiverflader:** `AdvisorDashboard.tsx:357-375` (aktive + nyligt fuldførte på company-kortet), `MemberDetail.tsx:412, 1351-1460`.

**Bemærk:** medlemmet ser ikke overskredne milestones som overskredne nogen steder — se §6.1.

### 3.2 `company_actions` — erstattes, men skemaet peger allerede rigtigt

Skemaet bærer allerede hele forpligtelses-maskineriet:

```sql
status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','parked','dismissed')),
completed_at, dismissed_at
```

Accept- og afvis-kontrollerne findes — men kun i død kode (`DashboardActionCenter.tsx:321, 335`). Den levende medlemsflade (`BoardroomView.tsx:1345-1358`) har **ingen mutation overhovedet**: alle 70 handlinger står permanent på `open`, og "ubesvaret" og "besvaret" er derfor samme tilstand i data.

**Konsekvens for B1:** modellen for foreslå → accepter findes allerede i skemaet. Det der mangler er en flade — og et datofelt. `company_actions` har `week_key`, `generated_at`, `completed_at` og `dismissed_at`, men **ingen forfaldsdato**. B3 kræver et nyt felt.

**Ingen rådgiverflade læser tabellen.** RLS giver rådgivere SELECT på alle rækker (`20260329190316…:85-87`), men adgangen er aldrig taget i brug.

### 3.3 `pulse_checkins` — erstattes ikke, men får en udgang

Felterne er `went_well`, `biggest_challenge`, `help_needed` (fritekst) og `milestone_progress` (auto-beregnet, ikke indtastet).

**Der findes intet næste-skridt-, forpligtelses- eller datofelt i tabellen.** Det er hele grunden til at refleksioner bliver løs snak: der er ingen udgang fra dem. B5 kræver at refleksionen kan munde ud i et forslag.

Én kanal når allerede rådgiveren: `help_needed` vises som banner i chatten (`CompanyChatPane.tsx:691-698`) og bygger rådgiverlistens `report_no_reflection`-tilstand.

### 3.4 `weekly_focus` — erstattes IKKE

Weekly focus er ikke et opgavelager. Det er en ugentlig sammenfatning med `headline`, `summary` og trigger-data, der blandt andet **producerer** `company_actions` (`generate-weekly-focus/index.ts:539-562`).

Den bliver stående som forslagskilde. Den skal ikke smeltes ind i opgave-modellen — den skal fodre den.

Rådgiveren ser i dag kun en boolean "har én denne uge" (`AdvisorDashboard.tsx:376-381`). Headline og summary vises ikke.

---

## 4. Åbne spørgsmål

**4.1 Hvor mange gange kan "ikke endnu" siges?**
B2 giver tre svar ved udløb. "Ikke endnu" skal kunne siges uden skam, men en opgave der kan udskydes uendeligt er milestones om igen. Grænsen er ikke besluttet.

**4.2 Hvem sætter datoen — den der foreslår, eller den der siger ja?**
B1 siger medlemmet forpligter sig; B3 siger datoen er obligatorisk. Hvis rådgiveren foreslår med dato, accepterer medlemmet så også datoen? Eller sætter medlemmet sin egen ved accept? Ikke besluttet.

**4.3 Udløber et ubesvaret forslag?**
B1 gør ubesvarede forslag til et signal. Men et forslag fra marts der stadig ligger i august er ikke et signal, det er skrald. Ikke besluttet.

**4.4 Kan rådgiveren se ubesvarede forslag?**
**Nej — verificeret.** Ingen rådgiverflade læser `company_actions`. Se §3.2. Dette skal løses i tilstandslaget (fase 2).

**4.5 Hvad sker der med de 102 eksisterende milestones?**
Migrationsplan er bevidst ikke besluttet i dette dokument. Bemærk at 8 er fuldførte (historik værd at bevare), 24 er overskredne og 61 mangler deadline — og B3 kræver dato, så de kan ikke migreres uændret.

**4.6 Hvad sker der med opgaver når en virksomhed forlader platformen?**
**Delvist svar fra kortlægningen:** der findes ingen offboarding-livscyklus, kun hard delete via `companyHardDelete.ts`. `pulse_checkins`, `company_actions` og `weekly_focus` har `ON DELETE CASCADE`; **`milestones.company_id` har ikke** (`20260224222456…:104`), hvilket blokerer en rå `DELETE FROM companies`. Fornyelsesbeslutningen (`company_fornyelse`) registrerer hensigt, men udløser ingen datahåndtering. Den nye model skal tage stilling til FK-adfærd fra dag ét.

---

## 5. Hvad der ikke er besluttet

Datamodel, tabelnavne, kolonner, RLS-politikker og UI. Dette dokument beslutter **form**, ikke implementering.

Motor-først-mønstret gælder: forpligtelses- og udløbslogikken udtrækkes og testes som ren motor før nogen flade bygges.

---

## 6. Fund fra kortlægningen der skal bogføres

**6.1 Månedsdigesten viser overskredne deadlines som kommende.**
`send-monthly-digest/index.ts:201-211` bruger `.lte("deadline", in30Days)` uden nedre grænse. Overskredne rækker medtages og renderes under overskriften "Milestones med deadline snart:" (`:267`) med den passerede dato printet som var den kommende. Cron den 22. kl. 08:00 (`20260810230000_cron_oprydning.sql:74-79`). **Dette er den eneste kanal hvor en overskredet milestone når et medlem — og den præsenterer den forkert.** Uafhængig af opgave-modellen; kan lukkes selvstændigt.

**6.2 `run-company-agent` skriver ugyldig `source_type`.**
`run-company-agent/index.ts:736-756` (`write_company_action`) skriver `source_type: "agent"`. CHECK-constrainten tillader kun `ai_weekly|milestone|handout|manual` (`20260329190316…:50`). Insertet må fejle. Ikke verificeret mod prod. Samme klasse fejl som `send-welcome-message` (se `BACKLOG.md`, P3).

**6.3 `AdvisorCompanyOverview.tsx` er død kode.**
Refereres ingen steder uden for sig selv. Blev vedligeholdt i PR #378 uden at nogen ser den. Skal slettes, ikke vedligeholdes.

**6.4 `AdvisorAlertsPanel.tsx` importeres men renderes aldrig.**
Import i `AdvisorDashboard.tsx:17` er eneste forekomst i filen. Panelet indeholder færdigbygget overdue- og stalled-alerting med snooze (`:104-131, 237-263`). Femte tilfælde af mønsteret "bygget færdigt, aldrig koblet til en flade" — se `BACKLOG.md`, P4 "Amputeret beregning".

**6.5 `milestones.company_id` mangler `ON DELETE CASCADE`.**
Afviger fra de tre øvrige tabeller. Se §4.6.

---

## Beslutningslog

| Dato | Beslutning |
|---|---|
| 2026-08-22 | B1-B5 truffet. Opgave-modellen bygges før tilstandslaget, fordi tilstandslaget uden aftaler kun kan rapportere stilhed og talfriskhed. |
| 2026-08-22 | `weekly_focus` erstattes ikke — den bliver stående som forslagskilde. |
