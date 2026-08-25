# Opgave-skrivevej — recon 2026-08-24 (sen aften)

Grundlag: docs/opgave-model-design.md (B1-B11), ~/Downloads/chat-recon-2.md §4,
koden på main pr. 7ad8838c (PR #422 merget). Rå observationer med fil:linje.
Ingen konklusioner, ingen forslag.

Prod-tilstand oplyst: 35 opgaver med status 'proposed' til 13 virksomheder,
skrevet af ai_weekly 2026-08-24 06:00 UTC. Synlige for medlemmerne siden PR #422.

---

## 1. FLADEN I DAG

Hele kæden fra hentning til pixel (src/components/hjemmebane/boardroom/):

1. **Hentning** — BoardroomView.tsx:1349-1362 (`actionsQuery`):
   `select("id, title, context, priority, status, created_at")`,
   `.eq("company_id", …).in("status", ["open","proposed"]).order("created_at",
   desc).limit(10)`, klientside-sortering high → medium → low, dernæst ældste
   (:1354-1357). staleTime 3 min.
2. **Mapping** — BoardroomView.tsx:1477-1481: `openActions = actionsQuery.data
   .map(a => ({ id, title, priority, context }))`. `status` læses IKKE videre.
   Går ind i `deriveFocus` sammen med de øvrige kilder (:1464-1482).
3. **Dommen** — nextStep.ts:222-236, slot (f): hvert element bliver et
   FocusItem med `kind: "company-action"`, `priority: 6` (efter rapport,
   godkendelse, beskeder, ugefokus og milestone-deadlines), `title` =
   opgavens titel, `description` = `context` eller fallback-teksten
   "Åben handling fra din handlingsplan." (:231), `ctaLabel: "Se handlinger"`,
   **`ctaHref: "/"`** (:232-233 — forsiden selv, med kommentaren "Href er
   forsiden selv indtil handlings-visningen ejes af fokus-laget").
4. **Rendering** — FocusCard, BoardroomView.tsx:954-1075, kaldt :1572-1578
   under "Dit næste skridt". `displayed = items.slice(0, 4)` (:969) — kun de
   fire højest prioriterede fokus-punkter vises overhovedet; #1 stort, #2-4
   som stille linjer.
   - Som **primærpunkt**: titel (:993-995), beskrivelse (:997). CTA-knappen
     renderes KUN når `ctaHref !== "/"` (:1002-1005) — en company-action har
     "/" og får derfor **ingen knap**.
   - Som **stille linje**: rækker med `ctaHref === "/"` renderes som en
     fold-ud-knap (:1028-1039) der toggler `expandedKey`; udfoldet vises kun
     `description` som tekst (:1043-1046). Ingen navigation.

**Hvad medlemmet kan klikke på**: fold-ud-chevronen (læse beskrivelsen) —
ellers intet. Der findes ingen accept-, afvis-, udskyd- eller fuldfør-handling
nogen steder i fladen. Ingen kode i BoardroomView muterer company_actions
(grep: tabellen forekommer kun i actionsQuery :1352). Accept/afvis-kontroller
findes kun i død kode (DashboardActionCenter — design-dokumentets §3.2:
"kun i død kode (DashboardActionCenter.tsx:321, 335)"; komponenten importeres
ingen steder, verificeret ved grep).

**Afledt af slice(0,4) + limit(10)**: en virksomhed med flere forslag end der
er ledige fokus-pladser (fx uge med manglende rapport + ulæste beskeder +
ugefokus) får aldrig vist sine forslag — de ligger på priority 6 og skæres af
:969. Der findes ingen anden medlemsflade der viser company_actions
(kortlægningen §2 + grep: BoardroomView er eneste levende læser).

---

## 2. HVAD DESIGNET KRÆVER

Handlinger udledt af docs/opgave-model-design.md, med motorens kontrakt
(src/lib/opgaveEngine.ts). Motorens tilstandsmaskine (OVERGANGE, :80-93):
`proposed → active | dismissed | expired`; `active → done | not_done |
dropped | active` (active→active er udskydelsen); alle sluttilstande og
open/parked har tom overgangsliste.

| # | Handling | Beslutning | Felter der ændres | Motor-funktion + lovlighed |
|---|---|---|---|---|
| 1 | **Acceptér forslag** (medlem siger ja + vælger dato) | B1, B3, B6 | status proposed→active, `accepted_at = nu`, `due_date = valgt dato` | `accepter` (:118-129): kun fra 'proposed'; dato i fortiden afvises. CHECK-constraint: active kræver due_date (design §7 :226) |
| 2 | **Afvis forslag** (aktivt nej) | B1 (design :215 'dismissed' = "Afvist som forslag, aktivt valg") | status proposed→dismissed, `closed_at = nu` | `luk(opgave, "dismissed", nu)` (:172-177): dismissed er kun lovlig fra proposed |
| 3 | **Udløb forslag** (tavshed, cron) | B8, B10 | status proposed→expired, `closed_at = nu` | `luk(opgave, "expired", nu)`; `erUdloebet` (:187-189) afgør hvornår (expires_at-tidspunkt passeret). opgoerTilstand :196-197 forudser vinduet "proposed hvor expires_at er passeret men cron endnu ikke har lukket rækken" |
| 4 | **Forfalds-spørgsmålet** (systemet spørger én gang: gjort / ikke gjort / ikke endnu) | B2 | ingen felter i sig selv — udløser handling 5/6/7 | `erForfalden` (:181-183): active + due_date-kalenderdag passeret (frist i dag = ikke forfalden) |
| 5 | **Fuldfør / nåede det ikke** | B2 (design :212-213: done, not_done) | status active→done eller active→not_done, `closed_at = nu` | `luk` — begge kun lovlige fra active |
| 6 | **Drop** (ikke relevant længere, aktivt valg — "lige så pænt svar som gjort") | B7 (design :69) | status active→dropped, `closed_at = nu` | `luk` — kun fra active |
| 7 | **Udskyd** ("ikke endnu") | B7, B11 | `due_date` = nu+14 (1. gang, nyDato ignoreres) eller valgt dato (2. gang), `deferral_count` +1, status forbliver active | `udskyd` (:136-167): kun active, kun når forfalden, `deferral_count >= 2` afvises ("tredje udskydelse er ikke tilladt — opgaven skal lukkes"), 2. gang kræver dato ≥ i dag |
| 8 | **Opret forslag (rådgiver)** | B10 (advisor = 30 dage), §7 (`proposed_by` = rådgiverens id) | ny række: status 'proposed', source_type 'advisor', `expires_at = beregnUdloeb("advisor", nu)`, proposed_by, INGEN due_date | `beregnUdloeb` (:112-114). Ingen opret-funktion i motoren — oprettelse er ren insert |
| 9 | **Refleksionens udgang** (pulse → forslag) | B5, B10 (reflection = 21 dage) | ny række: status 'proposed', source_type 'reflection', expires_at | Ingen kode; pulse_checkins har intet næste-skridt-felt (design §3.3 :138) |
| 10 | **Medlemmets egen opgave** (accept-trin springes over) | B1 (design :43: "De har forpligtet sig ved at skrive den") | ny række — designet specificerer ikke felterne eksplicit; B3 kræver dato | Ingen motor-funktion for direkte oprettelse som active; `accepter` kræver 'proposed' som udgangspunkt |
| 11 | **B9-migreringen** (aktive milestones → forslag) | B9, B8 (design :78-83: migrations-forslag udløber som alle andre) | nye rækker pr. aktiv milestone; ja+dato → handling 1; nej → "arkiveret" (design :79 — 'arkiveret' er IKKE en af §7's syv tilstande) | source_type 'milestone' findes i CHECK'en og i motorens OpgaveSourceType (:29) — ingen kode skriver den i dag |

Tværgående motor-kontrakt: alle mutationsfunktioner er rene — muterer aldrig
input, kaster aldrig, returnerer `{ ok } | { ok:false, grund }` (:1-7); "nu"
er altid en parameter. RLS-kontrakten (migration 20260822224100:34-35,
tabel-kommentar): "Skrivning sker UDELUKKENDE gennem edge functions med
service role, saa opgaveEngine er den ene sandhed for tilstandsovergange."
B10-tabellen findes nu i to runtime-spejle: src/lib/opgaveEngine.ts:105-110 og
supabase/functions/_shared/opgaveUdloeb.ts (paritet håndhævet af 22 tests,
PR #422).

---

## 3. EDGE FUNCTION-MØNSTRET

### Forbilledet: notify-community-svar (Bucket A med verify_jwt = true)

supabase/functions/notify-community-svar/index.ts (119 linjer). Rækkefølgen
står i fil-headeren (:4-11) og kroppen:

1. CORS-preflight (:33).
2. `authenticateUser(req)` — FØR enhver service-role-konstruktion (:36-38).
   Returnerer `{ callerId, authHeader, callerClient }` eller en 401-Response.
3. Input-validering, 400 ved ugyldig body (:41-52).
4. Target-opslag med **KALDERENS klient** (`callerClient`) — RLS gater
   læsningen (:59-63). Manglende/uautoriseret række → `{ notificeret: false }`
   med 200 (bevidst valg i den funktion; :54-58-kommentaren).
5. FØRST derefter adminClient (service role) til selve skrivningen (:7
   "FØRST derefter adminClient + writeNotification").

### Auth-helperen

supabase/functions/_shared/edgeFunctionAuth.ts:

- `authenticateUser` (:81-117): kræver Bearer, validerer via
  `authClient.auth.getClaims(token)` (IKKE getUser — :77-78), udleder
  `callerId` fra sub-claim, bygger `callerClient` med kalderens JWT i
  Authorization-headeren (:111-114) så alle opslag gennem den er RLS-gatet.
- `authenticateServiceRole` (:146-172, Bucket B/cron): kræver Bearer med
  role-claim 'service_role' via `parseJwtClaims` (uverificeret parsing —
  må KUN bruges bag verify_jwt = true, invariant :19-23, håndhævet af
  scripts/check-verify-jwt-invariant.ts). 401 = intet/ugyldigt token,
  403 = forkert rolle (:140-143, bevidst adskillelse).

### config.toml-opsætningen

supabase/config.toml — standardkommentaren for nye Bucket A-functions med
true (:74-91, gentaget "Samme begrundelse som get-community-billed-url"):

```toml
  # verify_jwt = true: funktionen læser JWT-claims via authenticateUser, og
  # gatewayen bærer signaturtjekket — samme invariant som CI-værnet
  # scripts/check-verify-jwt-invariant.ts håndhæver. Bevist 10. august
  # (PR #267): med true afviser gatewayen forfalskede signaturer før koden
  # ...
  [functions.get-community-billed-url]
    verify_jwt = true
```

35 ældre functions står med `verify_jwt = false` (arv, [P2]-migreringsliste
jf. hukommelses-notatet bucket-a-verify-jwt-default); nye Bucket A-functions
fødes med true-blok. Cron-modtagere med true: generate-weekly-focus (:100-101),
send-monthly-digest (:102-103), event-reminders (:104-105) m.fl.

### Medlems-afgrænsningen ("kun sine egne opgaver")

RLS-politikkerne på company_actions efter stramningen (20260822224100:27
"tre politikker tilbage (service role ALL, to SELECT)"; oprindeligt defineret
i 20260329190316:69-88):

- "Members can view own company actions": SELECT USING
  `company_id = user_company_id(auth.uid())` — **company-scoped, ikke
  user-scoped**.
- "Advisors can view all company actions": SELECT USING `has_role(…,'advisor')`.
- "Service role can manage company actions": ALL.

Kalder-tjek i mønstret: callerClient-opslag af target-rækken beviser at
kalderen må SE den (company-medlemskab) — men fordi SELECT er company-scoped,
skelner RLS ikke mellem to brugere i samme virksomhed. Rækkeniveauets ejerskab
er `user_id` ("medlemmet der ejer opgaven", design §7 :233), og B1 taler om
"medlemmet". Design §4.3 (RLS på de nye kolonner) står som åbent spørgsmål i
dokumentet (:160-161) og blev delvist lukket af beslutning A (al skrivning via
service role) — afgrænsningen user_id-ejer vs. company-medlem er ikke
adresseret i noget dokument. Observeret, ikke vurderet.

---

## 4. DE GAMLE RÆKKER

### SELECT (køres i Lovable SQL editor; kolonnenavne verificeret mod
src/integrations/supabase/types.ts:639-662)

```sql
-- 4.1 Bestanden fordelt på status × source_type + datofelternes tilstand
select
  status,
  source_type,
  count(*) as antal,
  count(*) filter (where due_date is null)   as uden_due_date,
  count(*) filter (where expires_at is null) as uden_expires_at,
  count(*) filter (where accepted_at is not null) as med_accepted_at,
  min(created_at)::date as aeldste,
  max(created_at)::date as nyeste
from public.company_actions
group by status, source_type
order by status, source_type;

-- 4.2 Den gamle form specifikt: open/parked uden datofelter
select id, company_id, user_id, source_type, status, priority,
       week_key, created_at
from public.company_actions
where status in ('open', 'parked')
  and due_date is null
  and expires_at is null
order by created_at;
```

Kendt fra målingerne: 70 rækker på 10 virksomheder, alle status 'open', pr.
2026-08-22 (design §1 :26) + run-company-agents eventuelle 'open'-rækker
skrevet FØR PR #422 (agenten skrev 'open' indtil be218dc1) + de 35 'proposed'
fra i morges. 4.1 giver den faktiske fordeling.

### Hvad design-dokumentets §7 siger om migreringen

- design :220: "`open` og `parked` er overgangsværdier der fjernes i **spor 2
  efter datamigreringen af de 70 eksisterende rækker**."
- design :235: "`completed_at` og `dismissed_at` er overflødiggjort af
  `closed_at`. De bliver liggende urørte og droppes i et senere spor med bevis."
- Motoren tager ikke stilling til open/parked: tom overgangsliste
  (opgaveEngine.ts:93-95 "motoren tager ikke stilling til dem før
  datamigreringen i spor 2 har oversat dem") og opgoerTilstand tæller dem
  bevidst ikke (:236 "open/parked tælles bevidst ikke med").
- HVAD de 70 skal oversættes TIL står ingen steder i dokumentet — §7 siger kun
  at værdierne fjernes efter migreringen.

---

## 5. MILESTONES

### Bestand (målt 2026-08-22, design §1 :21-25)

102 i alt · 8 fuldført (8 %) · 24 aktive med overskredet deadline · 61 uden
deadline · nyeste oprettet 2026-06-30 ("ingen ny i 53 dage" pr. måledatoen).

```sql
-- 5.1 Aktuel tilstand (kolonner verificeret mod types.ts:2159-2179)
select
  status,
  count(*) as antal,
  count(*) filter (where deadline is null) as uden_deadline,
  count(*) filter (where deadline::date < current_date) as deadline_passeret,
  count(*) filter (where progress = 0)   as nul_fremdrift,
  count(*) filter (where progress >= 100) as fuld_fremdrift,
  min(created_at)::date as aeldste,
  max(created_at)::date as nyeste
from public.milestones
group by status
order by antal desc;

-- 5.2 B9-bestanden: det der skal præsenteres som forslag (aktive)
select m.company_id, co.name, count(*) as aktive_milestones,
       count(*) filter (where m.deadline is null) as uden_deadline
from public.milestones m
left join public.companies co on co.id = m.company_id
where m.status = 'active'
group by m.company_id, co.name
order by aktive_milestones desc;
```

(5.2's antal pr. virksomhed er direkte input til design §4.1's åbne spørgsmål:
"En virksomhed med tolv aktive milestones møder tolv spørgsmål. Alt på én
gang, eller fordelt over tid? Ikke besluttet.")

### Milestone-tilstanden i skemaet

milestones.status er fri tekst i types (types.ts:2173); kendte værdier fra
koden: 'active', 'completed' (run-company-agent/index.ts:718: progress >= 100
→ "completed"), 'parked' (nextStep.ts:199 filtrerer `status !== "parked"`).
Felter: progress 0-100, deadline (nullable — 61 af 102 mangler),
target_value/current_value/unit/baseline, source (design §3.1: manual,
handout, agent, legat).

### Sammenhængen milestones ↔ company_actions i dag

- **Ingen relation i data**: ingen FK mellem tabellerne; `company_actions.
  source_id` skrives af INGEN kode (grep over src/ + supabase/functions/ =
  nul skrivende forekomster), og `source_type = 'milestone'` er tilladt i
  CHECK-constrainten (kortlægning :50, motoren :29) men skrives heller ikke
  af nogen — værdien står reserveret uden brug.
- **Fire oprettelseskilder for milestones** (design §3.1 :113-118 /
  kortlægning :22-25): Milestones.tsx:99-112 (manual), handoutEngine.ts:163-185
  (handout, via join-tabellen handout_lever_milestones — types.ts:1686-1707),
  run-company-agent create_milestone-toolet (agent; deadline = i dag +
  `deadline_days ?? 30`), create-legat-enrollment (legat).
- **run-company-agent har BEGGE veje åbne i dag**: create_milestone
  (gammel model) OG write_company_action (ny model, 'proposed' siden PR #422)
  — to tools i samme agent, to tabeller.
- **B9-relevant**: `milestones.company_id` mangler ON DELETE CASCADE
  (design §6.5/§4.2 :158 — afviger fra de tre andre tabeller og blokerer rå
  `DELETE FROM companies`).
- Medlemmet ser ikke overskredne milestones som overskredne nogen steder
  (kortlægning §5 :124-142, verificeret med testreference nextStep.test.ts:58-70);
  rådgiveren gør (AdvisorDashboard.tsx:260-264, MemberDetail.tsx:799-808 m.fl.).

---

## 6. HVAD BRYDER NÅR NYE STATUSSER TAGES I BRUG

Læserne fra chat-recon-2 §4, efterprøvet mod main i aften:

**A. BoardroomView.tsx:1352-1353** — `.in("status", ["open","proposed"])`.
- 'active': **forsvinder fra fladen i samme øjeblik medlemmet accepterer.**
  Der findes ingen anden medlemsflade der viser company_actions (kortlægning
  §2, grep bekræftet i aften), så en accepteret opgave er usynlig overalt
  indtil en opgaveflade findes (RAEKKEFOELGE :54 "Medlemmets opgaveflade" er
  netop fase 1-punktet der mangler).
- 'done'/'not_done'/'dropped'/'dismissed'/'expired': falder ud af
  forsidelisten. Ingen kode knækker — rækkerne bliver bare væk.
- Fold-ud-teksten for et forslag uden context er "Åben handling fra din
  handlingsplan." (nextStep.ts:231) — gælder allerede 'proposed' i dag efter
  PR #422; teksten skelner ikke forslag fra accepteret opgave.

**B. DashboardActionCenter.tsx:195-196** — `.eq("status","open")`. Død kode
(nul imports). Dens mutationer (:207 update, :214 insert) ville fejle mod
RLS'en fra 20260822224100 uanset status-værdier. Går ikke "i stykker" mere
end den allerede er.

**C. nextStep.ts:222-236 (slot f)** — ingen status-logik; behandler alt den
får som "åbne handlinger". Bryder ikke, men skelner heller ikke: hvis
kalderen en dag leverer både proposed og active, præsenteres de ens.

**D. opgaveEngine.opgoerTilstand (:206-240)** — designet til hele
tilstandsrummet: active/forfalden, proposed/udløbet, alle fem sluttilstande;
open/parked ignoreres bevidst. Bryder ikke.

**E. supabase/functions/_shared/companyHardDelete.ts:66** — DELETE pr.
company_id, status-agnostisk. Bryder ikke.

**F. Skriverne** — generate-weekly-focus (proposed, index.ts:553-566) og
run-company-agent (proposed, index.ts:726-751 efter PR #422) er allerede på
den nye form. Ingen kode skriver 'active' eller sluttilstande i dag.

**G. CHECK-constraints i databasen** (migration 20260822220000): status-CHECK
tillader alle ni værdier; `status <> 'active' or due_date is not null`
(design §7 :226) betyder at enhver vej til 'active' SKAL sætte due_date i
samme UPDATE — ellers afvises den af databasen.

Ingen advisor-flade læser company_actions (AdvisorDashboard: nul forekomster;
design :168: rådgiveren kan ikke se ubesvarede forslag — planlagt til fase 2
via B8).

---

## 7. CRON

### Mønstret i dag: pg_cron i databasen → net.http_post → Bucket B-function

Eksempel (migration 20260810230000_cron_oprydning.sql:58-70):

```sql
SELECT cron.schedule(
  'daily-reflection-nudge',
  '0 9 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/nudge-report-no-reflection',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
                                     WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"dry_run": false}'::jsonb
  ) AS request_id;
  $job$
);
```

Kendetegn:
- **URL hårdkodes** (cron_oprydning :18-21: vault indeholder KUN
  `email_queue_service_role_key`; nøglen 'supabase_url' findes ikke — jobs
  der slog den op, har aldrig kørt).
- **Bearer = service-role-nøglen fra vault**; modtager-funktionen er Bucket B
  (`authenticateServiceRole` — role-claim, gatewayen bærer signaturtjekket)
  og SKAL stå med `verify_jwt = true` i config.toml (invariant,
  edgeFunctionAuth.ts:19-23; håndhævet af scripts/check-verify-jwt-invariant.ts).
- **pg_cron kører i UTC** (cron_oprydning :25-28).
- **Slot-valg er en beslutning** (cron_oprydning :31-35): 06:00 UTC er optaget
  af generate-weekly-focus mandage (tung AI-kørsel over alle virksomheder),
  09:00 UTC af daily-report-reminder + daily-reflection-nudge, 07:00 UTC blev
  valgt til event-reminders fordi det var ledigt.
- **Idempotens via dedup_key** fremhæves som det der gør genkørsel harmløs
  (cron_oprydning :37-41).
- Migrationer køres manuelt i Lovable SQL editor (CLAUDE.md) — cron.schedule
  er en DB-handling, ikke en deploy.

Aktive jobs i repo-historikken: generate-weekly-focus '0 6 * * 1'
(20260329192545), daily-reflection-nudge '0 9 * * *', send-monthly-digest
'0 8 22 * *', event-reminders '0 7 * * *' (alle 20260810230000), plus ældre
(daily-report-reminder m.fl. i 2026-03/04-migrationerne).

**Uoverensstemmelse observeret**: repo-migrationen for generate-weekly-focus
(20260329192545:10) bygger URL'en af vault-nøglen 'supabase_url' — som
cron_oprydning :18-21 fastslår ikke findes. Jobbet kørte alligevel i morges
(35 rækker skrevet 06:00 UTC). Prod-jobbets faktiske definition afviger altså
fra repo-migrationens tekst (rettet direkte i DB eller ad anden vej).
Efterprøvning:

```sql
select jobid, jobname, schedule, active, command
from cron.job
order by jobid;
```

### Deno.cron: virker ikke — bogført lærdom

Tre funktioner bruger `Deno.cron` (grep): legat-reminder-cron,
intro-reminder-cron, run-weekly-agent. RAEKKEFOELGE.md:41: "Deno.cron — tre
funktioner har aldrig kørt" (tempo 2-punkt). BACKLOG's deploy-re-baseline
(2026-08-06): de svarer 500 ved HTTP-kald fordi de er "Deno.cron-only uden
HTTP-handler — runtime-500 før nogen kodelinje, ingen sideeffekter".
config.toml :106-111 bærer noten om at intro-reminder-cron fik verify_jwt=true
"hvis pg_cron-job med vault-nøglen beviseligt passerer gaten i prod" — dvs.
sporet for at flytte dem til pg_cron-mønstret er påbegyndt i config, men
funktionerne selv står stadig med Deno.cron.

### Modtager-endens gate (cron-funktion der også kan kaldes af admin)

generate-weekly-focus/index.ts:31-52 viser dobbelt-gaten: service_role-claim
via parseJwtClaims ELLER autentificeret bruger med admin-rolle (getClaims →
user_roles-opslag med service-klient). Bruges når samme funktion skal kunne
trigges både af cron og manuelt fra en admin-flade.
