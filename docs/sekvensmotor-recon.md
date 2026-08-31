# Recon: én sekvensmotor til legat (14 dage) og onboarding (30 dage)
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27, main. Hovedfund først: **det meste af
infrastrukturen findes og virker allerede** — kø, udbyder, log, dedup,
opt-out, unsubscribe-tokens og et pg_cron-mønster med seks levende jobs.
Og præmissen skal korrigeres på ét punkt: **intro-reminder-cron er
allerede genoplivet** (13/8) med HTTP-indgang og tørkørsel som default —
den mangler kun en pg_cron-plan. legat-reminder-cron er fortsat død.

---

## 1. Hvad findes der allerede?

**legat-reminder-cron** (`supabase/functions/legat-reminder-cron/index.ts`)
— DØD som målt: kun `Deno.cron("legat-momentum-reminder", "0 9 * * *", …)`
(linje 6), ingen `Deno.serve`, kører aldrig på Supabase edge runtime.
Hvad den VILLE have gjort: for aktive `legat_enrollments` med
`momentumkald_booked = false` (12-16), mindst 2 dage efter start (37-39),
indsætte ÉN chatbesked (ikke en mail) i medlemmets samtale:
"Har du husket at booke dit Momentumkald? … theboardroom.dk/momentumkald"
(76), med dedup via `message_type = "legat-momentum-reminder"` (54-64).
Én besked i alt — ikke en 14-dages sekvens; sekvensen skal designes fra
bunden.

**intro-reminder-cron** (`intro-reminder-cron/index.ts`) — GENOPLIVET
13/8, og dens headerkommentar (5-12) er selve dokumentationen af
Deno.cron-fejlen: "Deno.cron eksekveres ALDRIG på Supabases edge-runtime,
så den havde aldrig kørt". Nu: `Deno.serve` + `authenticateServiceRole`
(Bucket B, 243-247), **tørkørsel som default** (253-257), og en færdig
sekvens-mekanik: målgruppe = aktiv kontrakt + `intro_session_used_at`
null + sidste påmindelse >30 dage siden (109-114), første mail 2 dage
efter start (130-137), opt-out via
`profiles.notification_email_prefs.intro_reminders` (176-180), send-vej
= `email_send_log` pending → `enqueue_email` (194-217), kadence-styring
via `companies.intro_reminder_last_sent_at` kun ved succes (226-230).
**Ingen migration planlægger den** — grep over migrations finder hverken
intro-reminder eller legat-reminder i nogen cron.schedule.

**Andre halvfærdige/beslægtede:**
- `run-weekly-agent/index.ts:7` — TREDJE Deno.cron-only-funktion, samme
  dødsårsag, ingen HTTP-indgang.
- `send-report-reminder` — en LEVENDE tretrinssekvens (dag 7/15/20 i
  måneden, gentle/urgent/critical, index.ts:110-111) — det nærmeste
  eksisterende forbillede for "sekvens med eskalering".
- `send-pulse-reminder` (cron pensioneret 12/6), `nudge-report-no-
  reflection` (levende, dry_run-mønsteret), `event-reminders` (levende,
  dedup_key-idempotent), `send-monthly-digest` (levende, dag 22).
- Indholds-dryp: `src/lib/hjemmebane/drip.ts` — dag-baseret oplåsning
  ankret i `company_members.created_at`, ren logik. En 30-dages
  onboarding ville genbruge præcis det anker.

## 2. Mailinfrastrukturen

Kø-arkitektur, ikke direkte send: afsendere kalder RPC'en
`enqueue_email(queue_name, payload)` (migration 20260319090407_email_infra.sql:131,
EXECUTE kun service_role, 195-196) → pgmq-kø `transactional_emails` →
**process-email-queue** (pg_cron hvert 5. sekund, migration
20260402084424) afvikler med `sendLovableEmail` fra
`npm:@lovable.dev/email-js@0.0.4` — udbyderen er **Lovables
email-gateway**, med 429/403-håndtering, retries (MAX_RETRIES 5) og DLQ.
Afsender: `noreply@boardroom.topix.dk` ("Morten fra The Boardroom").

Skabeloner er **inline HTML pr. funktion** (fx
`buildIntroReminderHtml`, intro-reminder-cron:33-61) med delte hjælpere i
`_shared/emailButtonHelpers.ts` (bulletproofButton, fallbackLinkBlock).
Ingen central skabelontabel.

Email-log: **`email_send_log`** (email_infra.sql:27-35): message_id,
template_name, recipient_email, status
(pending/sent/suppressed/failed/bounced/complained/dlq), error_message,
metadata, created_at. Service-role-only RLS (42-58).

## 3. Dedup og idempotens

Tre lag, alle i drift:

1. **`notifications_dedup_unique UNIQUE (user_id, dedup_key)`**
   (migration 20260323112326:26) — fx `event_reminder:{event_id}:{a|b}`;
   cron-oprydningsmigrationen kalder eksplicit genkørsel "HARMLØS" pga.
   dette (20260810230000:36-40).
2. **`idempotency_key` i kø-payloaden** (= message_id, fx
   intro-reminder-cron:206) + `email_send_log.message_id`.
3. **Kadence-felter på entiteten**: `companies.intro_reminder_last_sent_at`
   (skrives KUN ved succesfuld enqueue, intro-reminder-cron:220-230 —
   fejl ⇒ nyt forsøg i morgen, ikke om en måned). Legat-varianten brugte
   message_type-opslag i messages (54-64).

Mønstret til en sekvensmotor ligger altså klar: dedup_key pr.
(bruger, sekvens, trin) er den etablerede form.

## 4. pg_cron-mønsteret

"Agentens ugekort" = `generate-weekly-focus`, planlagt i migration
20260329192545 (`'0 6 * * 1'`). MEN: det KANONISKE mønster er
oprydningsmigrationen **20260810230000_cron_oprydning.sql**, som
dokumenterer at vault-opslaget `'supabase_url'` ALDRIG har virket
(secretten findes ikke — jobs med den kørte aldrig) og omlagde alle
levende jobs til hårdkodet URL + vault-nøglen
`email_queue_service_role_key`:

```sql
SELECT cron.schedule(
  'daily-reflection-nudge',
  '0 9 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/nudge-report-no-reflection',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"dry_run": false}'::jsonb
  ) AS request_id;
  $job$
);
```

En ny tidsplan = én migration i den form (+ idempotent unschedule-værn,
se 20260825233000:82-88) — husk at pg_cron kører UTC, at
migrationen deployes MANUELT i Lovable SQL editor, og at
slot-valget er bevidst (kommentaren 25-33 fravælger 06:00 og 09:00 UTC).

## 5. Livscyklusdata om et medlem

| Data | Hvor | Pålidelighed |
|---|---|---|
| Oprettelse | `companies.created_at`, `company_members.created_at` (drip-ankeret), `companies.contract_start_date` | God; intro-cron bruger `contract_start_date ?? created_at` |
| Sidste login | **Findes**: `auth.users.last_sign_in_at` via RPC `get_users_last_login(user_ids)` (migration 20260507120000 — SECURITY DEFINER, advisor-only i body, returnerer også email_confirmed_at). Dertil `user_login_log` (migration 20260302213733; NOT NULL-værn jf. hukommelse) | RPC'en er advisor-gated; en service-role-sekvensmotor kan læse auth.users direkte |
| Uploadet/committet | `financial_reports` (rækken skrives FØR udtræk — nævneren er ikke selvvalgt, jf. aktiveringsmålingen §1), `financial_report_facts` med `data_basis` | God |
| Community/indhold | `member_progress` (self-only + advisor write), drip via `company_members.created_at` | Findes |
| Tier | `companies.contract_end_date` → membershipTier full/subscriber/expired (`src/lib/membershipTier.ts`) | Brugt af intro-cron som filter |
| Refleksion | `pulse_checkins` | Findes |

## 6. Findes "hvor er medlemmet i sit forløb" allerede?

Delvist — som AFLEDNING, ikke som felt:

- **`Members.tsx:1055-1071` (onboardingFunnel)** er den reelle
  tilstandsmaskine i dag: notInvited → invitedPending →
  activatedNoReport → reportedNotCommitted → fullyOnboarded, udledt af
  members/invitationStatus/reportCount/committedCount. Vises i
  `MembersOnboardingFunnel`. Ren klient-afledning.
- `profiles.onboarded_at` + `tour_completed_at` (bruger-niveau, sat af
  onboarding-flowet; useAuth `needsOnboarding`).
- Legat: `legat_enrollments.status/start_date/momentumkald_booked` — en
  ægte lille tilstandsmaskine for netop det forløb.
- Intet felt på companies siger "dag N i onboarding" — det skal udledes
  (og KAN udledes: alle input findes, jf. §5). Funnel-logikken i
  Members.tsx er den oplagte kandidat at flytte server-side.

## 7. Opt-out, framelding og loven

Tre mekanismer findes:

1. **Granulære præferencer**: `profiles.notification_email_prefs`
   (Settings.tsx:137-143 + 1225-1231): action_required, important,
   report_reminders, monthly_digest, pulse_reminders — og
   intro-cron tjekker sin egen nøgle `intro_reminders` (176-180), som
   dog IKKE er i Settings-UI'et endnu (kan kun sættes ad anden vej).
   Sekvensmotoren skal have sin(e) egen/egne nøgler + UI-rækker.
2. **Unsubscribe-tokens**: tabellen `email_unsubscribe_tokens` (email,
   token, used_at — email_infra.sql) med token-generering i
   process-email-queue (260-290) og i create-legat-enrollment (257-273).
   `email_send_log.status` kender 'suppressed'.
3. Footer-linket "Administrer notifikationer" → `/settings` (kræver
   login) i mail-skabelonerne.

**Lov-vurdering som fund, ikke jura**: repoet skelner allerede
`purpose: "transactional"` i kø-payloaden (alle målte afsendere bruger
transactional). Onboarding-/legat-påmindelser til EKSISTERENDE, betalende
medlemmer om ydelser de allerede har købt, ligner service-/
kundeforholds-kommunikation, som huset i forvejen sender (rapport-
påmindelser, digest). Får sekvensen MARKEDSFØRENDE indhold (mersalg,
"videre samarbejde" à la legat-beskeden), kræver spam-reglerne
(markedsføringslovens §10) samtykke eller den snævre
eksisterende-kunde-undtagelse med nem framelding i HVER henvendelse —
token-infrastrukturen findes til netop det, men bruges ikke af de
transaktionelle skabeloner i dag. Intet i repoet håndterer
samtykke-registrering. Afklar kategorien pr. mail før indhold skrives.

## 8. Hvad går i stykker hvis en sekvens sender i morgen?

1. **Backlog-eksplosion dag 1**: målgruppe-queries uden "kun nye
   medlemmer"-anker rammer HELE bestanden — fjorten virksomheder står
   på dag 100+, ikke dag 2. Intro-cron'ens 30-dages-kadence ville sende
   til alle kandidater straks. En sekvensmotor skal beslutte om
   eksisterende medlemmer enrolles midt i forløbet, forfra eller slet
   ikke.
2. **Udløbne medlemskaber**: filteret findes
   (`gt("contract_end_date", nowIso)`) men skal med i HVER
   målgruppe-query; docs har målt expired-tier i bestanden.
3. **Rådgivere og ejere**: intro-cron'ens historik viser fælden — dens
   rollefilter fejlklassificerede 8 af 12 kandidater (kommentar
   140-148); målgruppen vælges nu som ældste company_member. Rådgivere
   har typisk intet company_members-anker, men Topix' EGEN virksomhed
   har — se næste punkt.
4. **Testkonti**: Topix-selskabet ligner et rigtigt medlem i companies
   (51 uploads, 44 slettede testkørsler, jf. aktiveringsmålingen).
   `admin-cleanup-test-data`-funktionen findes, men ingen markering
   "dette er en testkonto" — sekvensen ville maile Topix. Ekskludér
   eksplicit.
5. **Dubletter**: kun hvis motoren fraviger de etablerede mønstre —
   dedup_key-constrainten, idempotency_key og last_sent-felter er der
   og skal bruges pr. trin.
6. **Emails der ikke findes/aldrig bekræftet**: fem af de fjorten
   loggede ind én gang på dag ét — `email_confirmed_at` er tilgængelig
   via get_users_last_login-formen; ubekræftede adresser bør springes
   over (handle_new_user's email-gren er allerede fail-closed på samme
   princip).
7. **Deploy-fælden**: planlægges jobbet med vault-'supabase_url'-formen
   fra de GAMLE migrationer, kører det aldrig (dokumenteret i
   20260810230000). Brug hårdkodet URL-mønsteret.
8. **Tørkørsel først**: intro-cron'ens dry_run-default og
   `ville_sende`-tælleren (63-101) er præcis den bane en ny sekvens skal
   igennem før første rigtige afsendelse.

**Genbrugskonklusion**: kø+log+dedup+opt-out+cron-mønster+tørkørsel
findes og er i drift. Det der SKAL bygges: sekvens-definitionen
(trin, dage, indhold), en per-(bruger, sekvens, trin)-dedup (mønstret
findes), server-side forløbstilstand (funnel-logikken fra Members.tsx
som udgangspunkt), enrollment-beslutningen for eksisterende medlemmer,
og prefs-nøgler + UI. legat-reminder-cron kan pensioneres eller
genfødes som sekvens nr. 2 oven på samme motor — dens nuværende indhold
er én chatbesked, ikke en sekvens.
