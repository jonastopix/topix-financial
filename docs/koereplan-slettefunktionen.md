# Slettefunktionen i drift — migration, deploy, tørkørsel, cron (KØRT 8/9 kl. 11:57–12:01)

> **DETTE ER HISTORIK, IKKE EN PLAN.** Alle skridt nedenfor ER kørt i prod
> 8. september 2026 mellem kl. 11:57 og 12:01, i den rækkefølge planen
> foreskrev. Resultaterne står under hvert skridt som «KØRT». SQL'en er
> bevaret ordret, så kørslen kan efterprøves og gentages som kontrol.
>
> | kl. | skridt | målt |
> |---|---|---|
> | 11:57 | 2–3 Migration `20260908120000_data_slettet.sql` | tre kolonner oprettet (`data_slettet_at`, `data_slettet_vej` med CHECK på fire værdier, `data_slettet_raekker` jsonb); Alina stemplet `i_haanden` med 22 bogførte tabeller som JSON — 240 budgetmål, 198 loginposter og resten står nu på hendes række. Bevist: hun er ikke længere kandidat (3d = 0 rækker) |
> | 11:59 | 4 Deploy | `slet-medlemsdata-cron` udrullet fra commit `ff548d1e` sammen med `_shared/sletning.ts`; svarer **401** uden JWT, ikke 404 |
> | 12:00 | 5–7 Tørkørsel på rigtige data | `undersoegt 35 · fundet 0 · slettet 0 · fejlet 0`, tomme kandidatlister. Forventet og rigtigt: Alina er stemplet ude, og ingen med slutdato efter 10/9 er nået til dag 45. En tom rapport er beviset på at afgrænsningen holder |
> | 12:01 | 8 Cron | jobbet `slet-medlemsdata` planlagt, `0 12 * * *` UTC (14:00 dansk), aktivt, `dry_run: false`. Tolvte job, alene på klokkeslættet; lagt EFTER `fornyelsesvarsler` kl. 11, så en virksomhed der lige har fået sit varsel, ikke slettes i samme time |
>
> **Kæden er hel:** en anmodning bliver til en sletning efter syv dage,
> uden at nogen skal huske det. Alina ventede 103 dage fordi feltet ingen
> læste; nu er der en læser. Første rigtige kandidat kommer af sig selv
> (CARMA STUDIO, tidligst 26/10, hvis de ikke fornyer).
>
> **Udestår:** (1) cron-planlægningen er ikke bogført i en migrationsfil
> endnu (formen fra `20260901112000_prod_cron_bogfoert.sql`; kun
> `20260908120000_data_slettet.sql` nævner jobbet). (2) Kvitteringen til
> medlemmet siger stadig «Jonas kontakter dig inden for 2 hverdage»
> (`MembershipExpiredGate.tsx:142-143`, `:320-321`) — den skal sige en DATO.
> Se OVERLEVERING DEL 2 «Slettefunktionen».

Skrevet 8. september 2026 som plan (HEAD `ff548d1e`, #734); kørt samme dag
kl. 11:57–12:01 og omskrevet til historik bagefter. Teksten under
skridtene er planens ordlyd; «KØRT»-linjerne er det målte.

**Tilstanden før kørslen:** #734 var merget. Migrationen var IKKE kørt,
edge-funktionen IKKE bevist deployet, cron-jobbet IKKE planlagt. Al SQL
herunder er SELECT — undtagen migrationen (skridt 2), som blev kørt ÉN
gang, og cron-planlægningen (skridt 8), som blev kørt efter at skridt 6
var læst.

Rækkefølgen er bindende: **migration FØR deploy-bevis FØR tørkørsel FØR
cron.** Funktionen læser `data_slettet_at` i sin allerførste SELECT
(`index.ts:433-436`); køres den før migrationen, svarer den `ok: false`
med «column companies.data_slettet_at does not exist» — og intet andet.

---

## Skridt 1 — FØR-tilstand (Lovable → SQL editor, SELECT) — KØRT 8/9

**KØRT:** forudsætningen for skridt 2. 1c gav kun Alina — det følger også af tørkørslens `fundet 0` ad vej 1 (skridt 6).

```sql
-- 1a. Kolonnerne findes ikke endnu: forventet 0 rækker
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'companies'
  and column_name like 'data_slettet%';

-- 1b. Alinas række før stemplet: forventet 1 række med offboarding_requested_at = 2026-06-02 19:28 (+02)
select id, name, status, contract_end_date, offboarding_requested_at, er_kunde
from public.companies
where id = '778c7899-feff-4f8a-a11e-83dac1bd39f5';

-- 1c. Hvem har trykket «slet min data» overhovedet: forventet KUN Alina (målt 8/9, SQL 7d)
select name, status, contract_end_date, offboarding_requested_at
from public.companies
where offboarding_requested_at is not null
order by offboarding_requested_at;
```

Facit: 1a giver 0 rækker. 1b giver Alina med anmodningen 2/6. 1c giver
én række. Giver 1c flere, er der en ny anmodning siden 8/9 kl. 08:33 —
notér den, den bliver kandidat i skridt 6 hvis den er over syv dage.

---

## Skridt 2 — Migrationen (Lovable → SQL editor, HELE filen, én gang) — KØRT 8/9 kl. 11:57

**KØRT kl. 11:57:** hele filen i én kørsel. Tre kolonner oprettet, CHECK-constrainten på fire værdier, Alina stemplet `i_haanden` med 22 bogførte tabeller.

Kør HELE filen — ikke et uddrag (DEL 4: «Kør HELE migrationsfilen i SQL
editoren, ikke et uddrag»). Editoren kører den i én transaktion; fejler
UPDATE'en, ruller ALTER'en også tilbage. Filen ordret
(`supabase/migrations/20260908120000_data_slettet.sql`):

```sql
-- Sporet for en sletning af medlemsdata (Alina-sagen, OVERLEVERING DEL 2,
-- 8/9-2026): der fandtes ingen kolonne til at bogføre at en sletning var
-- sket. offboarding_requested_at bar anmodningen, ingenting bar udførelsen.
--
-- IKKE KØRT. Skrevet 8/9; køres MANUELT i Lovable -> SQL editor efter
-- merge (CLAUDE.md — migrationer auto-deployer aldrig). Bogfør kørslen
-- i OVERLEVERING når den er kørt.
--
-- HVORFOR KOLONNER OG IKKE EN TABEL: companies-rækken ER arkivsporet —
-- den tømmes, slettes aldrig (besluttet af Jonas 8/9). Alt om sletningen
-- hører på den række: hvornår bad de (offboarding_requested_at), hvornår
-- skete det (data_slettet_at), ad hvilken vej (data_slettet_vej), hvad
-- forsvandt (data_slettet_raekker — FØR-tallene pr. tabel og bucket, som
-- Alina-sagens tabel, så rapporten kan gengives uden en migrationsfil).
-- En virksomhed slettes én gang.
--
-- data_slettet_at er OGSÅ funktionens idempotens-nøgle: motoren
-- (src/lib/sletning.ts, spejl i _shared) dømmer «allerede slettet» når
-- den er sat, og UPDATE'en der sætter den er gated på IS NULL.
--
-- ALINA STEMPLES HER: hendes række bærer offboarding_requested_at (2/6
-- 19:28) og blev slettet i hånden 8/9 kl. 09:57-10:08. Vej 1 (anmodning)
-- er bevidst ikke gated på ordningens ikrafttrædelse, så uden stemplet
-- ville funktionen finde hende som kandidat igen og forsøge at slette en
-- tom virksomhed én gang til. Tallene er FØR-tallene fra DEL 2.
-- Guarded på id, anmodning og tomt stempel, så en genkørsel rammer nul.

alter table public.companies
  add column if not exists data_slettet_at      timestamptz,
  add column if not exists data_slettet_vej     text
    constraint companies_data_slettet_vej_check
    check (data_slettet_vej is null or data_slettet_vej in ('anmodning', 'tilbud_ubesvaret', 'aldrig_tilbudt', 'i_haanden')),
  add column if not exists data_slettet_raekker jsonb;

comment on column public.companies.data_slettet_at is
  'Hvornår medlemsdata blev slettet (Alina-sagen 8/9-2026). Sættes SIDST af slet-medlemsdata-cron, kun når alle trin er igennem; NULL = ikke slettet. Idempotens-nøgle: en stemplet række dømmes aldrig igen. Rækken selv bliver som arkivspor (navn, CVR, kontraktperiode, offboarding_requested_at).';
comment on column public.companies.data_slettet_vej is
  'Hvilken af de tre veje (src/lib/sletning.ts): anmodning (7 dage efter offboarding_requested_at), tilbud_ubesvaret (dag 45 efter slutdato, beslutning tilbyd), aldrig_tilbudt (dag 45, ingen beslutning/tilbyd_ikke) — eller i_haanden for sletninger kørt manuelt i SQL editoren.';
comment on column public.companies.data_slettet_raekker is
  'FØR-tallene pr. tabel og storage-bucket i det øjeblik sletningen kørte, fx {"financial_reports": 13, "user_login_log": 198, "storage/financial-documents": 13, "auth_users": 1}. Rollback-referencen findes ikke — derfor står tallene her.';

-- Alina Beauty & Skincare: slettet i hånden 8/9-2026 kl. 09:57-10:08 (DEL 2).
update public.companies
set data_slettet_at = '2026-09-08 10:08:00+02',
    data_slettet_vej = 'i_haanden',
    data_slettet_raekker = '{
      "budget_targets": 240, "user_login_log": 198, "messages": 30,
      "advisor_notifications": 27, "email_send_log": 21,
      "financial_report_facts": 15, "financial_reports": 13,
      "storage/financial-documents": 13, "notifications": 12,
      "slack_report_notification_log": 10, "financial_commentaries": 8,
      "weekly_focus": 6, "handouts": 5, "milestones": 3, "kpi_benchmarks": 2,
      "conversations": 1, "company_invitations": 1, "company_members": 1,
      "user_roles": 1, "pulse_checkins": 1, "conversation_last_seen": 1,
      "auth_users": 1
    }'::jsonb
where id = '778c7899-feff-4f8a-a11e-83dac1bd39f5'
  and name = 'Alina Beauty & Skincare'
  and offboarding_requested_at is not null
  and data_slettet_at is null;
-- forventet: UPDATE 1 (nul ved genkørsel)

-- Efter-verifikation (SELECT):
--   select column_name, data_type from information_schema.columns
--   where table_name = 'companies' and column_name like 'data_slettet%';
--   select name, offboarding_requested_at, data_slettet_at, data_slettet_vej
--   from public.companies where data_slettet_at is not null;
```

Hvad den gør: tre kolonner på `companies` (`data_slettet_at`
timestamptz, `data_slettet_vej` text med CHECK på fire værdier,
`data_slettet_raekker` jsonb), tre kolonnekommentarer, og ÉN UPDATE der
stempler Alina med `i_haanden`, 8/9 kl. 10:08 og FØR-tallene — guarded
på id, navn, anmodning og tomt stempel. Facit for UPDATE'en: **1 række**
(nul ved genkørsel).

---

## Skridt 3 — Bevis at migrationen er kørt (SELECT) — KØRT 8/9

**KØRT:** 3a tre kolonner, 3c Alina med `i_haanden`, 3d **0 rækker** — hun er ikke længere kandidat.

```sql
-- 3a. Kolonnerne: forventet 3 rækker
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'companies'
  and column_name like 'data_slettet%'
order by column_name;

-- 3b. CHECK-constrainten
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.companies'::regclass and conname = 'companies_data_slettet_vej_check';

-- 3c. Alina er stemplet: forventet 1 række, i_haanden, 2026-09-08 10:08
select name, offboarding_requested_at, data_slettet_at, data_slettet_vej,
       data_slettet_raekker->>'financial_reports' as rapporter,
       data_slettet_raekker->>'user_login_log' as loginposter
from public.companies
where data_slettet_at is not null;

-- 3d. Alina bliver IKKE kandidat: funktionens målgruppe er
--     data_slettet_at IS NULL AND (anmodning eller slutdato) — forventet 0 rækker for hende
select id, name
from public.companies
where id = '778c7899-feff-4f8a-a11e-83dac1bd39f5'
  and data_slettet_at is null
  and (offboarding_requested_at is not null or contract_end_date is not null);
```

Facit: 3a tre rækker, 3b én constraint, 3c Alina med `i_haanden`, 3d
**nul rækker**. Bogfør kørslen i OVERLEVERING (det andet vindues fil).

---

## Skridt 4 — Deploy af funktionen (Lovable build-chat + «View code») — KØRT 8/9 kl. 11:59

**KØRT kl. 11:59:** udrullet fra commit `ff548d1e` sammen med `_shared/sletning.ts`. Kald uden JWT svarede **401**, ikke 404.

Hvad funktionen trækker ind (`index.ts:47-50`):

| fil | status |
|---|---|
| `supabase/functions/slet-medlemsdata-cron/index.ts` | **NY** — selve funktionen |
| `supabase/functions/_shared/sletning.ts` | **NY** delt fil — motoren |
| `_shared/fornyelse.ts` → `_shared/membershipTier.ts` | findes i drift: `fornyelsesvarsel-cron` importerer `fornyelsesvarsel.ts`, som importerer `fornyelse.ts` (`fornyelsesvarsel.ts:42`), bevist kørende 7/9 kl. 11:57 |
| `_shared/edgeFunctionAuth.ts` | findes i drift (alle Bucket B-functions) |
| `esm.sh/@supabase/supabase-js@2.97.0` | ekstern |

DEL 1: «Nye edge functions OG ændringer der trækker en ny delt fil ind
(`_shared/…`) ruller ikke med merge — de deployes eksplicit via
build-chat, og verificeres med at funktionen svarer noget andet end 404.»
Begge betingelser er opfyldt her: ny function OG ny delt fil.

**Beskeden til Lovable build-chat, ordret:**

> Deploy edge-funktionen `slet-medlemsdata-cron` fra main, commit
> `ff548d1e` (#734 «feat: slettefunktionen — tre veje, toerkoersel som
> standard»). Den er NY og trækker en NY delt fil ind:
> `supabase/functions/_shared/sletning.ts`. Den importerer også
> `_shared/fornyelse.ts`, `_shared/membershipTier.ts` og
> `_shared/edgeFunctionAuth.ts`, som allerede er i drift.
> `supabase/config.toml` har `[functions.slet-medlemsdata-cron]
> verify_jwt = true` (Bucket B). Rør ikke andre functions, og ændr intet
> i koden.

**Bevis** (DEL 4: «Build-chattens «deployet ✅» er ikke et bevis; et kald
er»): to ting, begge før skridt 6.

1. Lovable → Edge functions → `slet-medlemsdata-cron` → **View code**:
   filen skal begynde med kommentaren «Slettefunktionen — sletter et
   tidligere medlems data når motoren siger det» og importere
   `../_shared/sletning.ts`. «Last updated» er ikke pålidelig.
2. Et kald UDEN nøgle skal give **401** (`authenticateServiceRole`), ikke
   404. Fra SQL editoren (pg_net; `timeout_milliseconds` fordi
   standarden er 5 s, DEL 4):

```sql
select net.http_post(
  url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/slet-medlemsdata-cron',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb,
  timeout_milliseconds := 150000
) as request_id;
-- Notér request_id, vent et par sekunder, og læs svaret:
select id, status_code, left(content, 300) as svar, error_msg
from net._http_response
where id = <request_id>;
```

Facit: `status_code = 401`, `svar` = `{"error":"Unauthorized — service-role key required"}`. Et **404** betyder at funktionen ikke er deployet (som `berig-virksomheder` 3/9) — tilbage til build-chatten. Et **500** her betyder at migrationen ikke er kørt (skridt 2) eller at den delte fil mangler.

---

## Skridt 5 — Tørkørslen: sådan kaldes den (SQL editor, SELECT + pg_net) — KØRT 8/9 kl. 12:00

**KØRT kl. 12:00** på rigtige data: `undersoegt 35 · fundet 0 · slettet 0 · fejlet 0`, tomme kandidatlister.

Samme form som `fornyelsesvarsel-cron` kaldes (`fornyelsesvarsel-cron/index.ts:63-77`,
`indgangs-paamindelser-cron:44-58`), men UDEN body — tom body er tørkørsel
(`index.ts`: `let toerKoersel = true; … if (body?.dry_run === false) toerKoersel = false`):

```sql
select net.http_post(
  url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/slet-medlemsdata-cron',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 150000
) as request_id;

-- svaret (tørkørslens rapport, hele JSON'en):
select id, status_code, content::jsonb as rapport, error_msg
from net._http_response
where id = <request_id>;
```

`body := '{}'` er en TOM body for funktionen — `dry_run` er ikke sat, så
den tørkører. Send ALDRIG `'{"dry_run": false}'` i hånden i morgen.

**Svar-formen, ordret fra koden** (`index.ts:113-131`, `:88-111`):

```ts
interface SletteResultat {
  ok: boolean;
  dry_run: boolean;
  /** Undersøgte virksomheder (ikke stemplet, med anmodning eller slutdato). */
  undersoegt: number;
  /** Motoren siger slet nu. */
  fundet: number;
  /** Faktisk slettet og stemplet (altid 0 i tørkørsel). */
  slettet: number;
  /** Fundet, men stoppet (bilag på kontoen / anden virksomhed) eller fejlet. */
  stoppet: number;
  fejlet: number;
  kandidater: KandidatRapport[];
  /** Undersøgte der IKKE skal slettes nu, med motorens grund — så rapporten siger hvorfor de andre ikke er med. */
  ikke_nu: { company_id: string; virksomhed: string; vej: string | null; frist: string | null; grund: string }[];
  error?: string;
}

interface KandidatRapport {
  company_id: string;
  virksomhed: string;
  cvr: string | null;
  status: string | null;
  contract_end_date: string | null;
  offboarding_requested_at: string | null;
  beslutning: Fornyelsesbeslutning | null;
  dom: Slettedom;                      // { skal_slettes, vej, grund, frist, dage_over_frist }
  /** Advarsel: kontrakten er stadig aktiv (kan kun ske ad vej 1). */
  aktiv_kontrakt: boolean;
  brugere: {
    user_id: string;
    email: string | null;
    sidste_login: string | null;
    andre_virksomheder: number;
    session_bookings: number;
    konto: "slettes" | "bevares — medlem af anden virksomhed" | "STOP — bilag på kontoen";
  }[];
  /** Rækker pr. tabel — tørkørslen tæller, den rigtige kørsel tæller FØR den sletter. */
  raekker: Record<string, number>;
  /** Filer pr. bucket. */
  storage: Record<string, number>;
  /** (b) der bliver — tælles kun, aldrig rørt. */
  bilag_der_bliver: Record<string, number | string | null>;
  companies_toemmes: string[];
  stop: string | null;
  /** Kun rigtig kørsel: trin der fejlede (kandidaten er da IKKE stemplet og findes igen i morgen). */
  fejl: string[];
}
```

`raekker`-nøglerne er tabelnavnene i FK-orden (`financial_commentaries`,
`financial_report_facts`, `financial_reports`, `handout_lever_milestones`,
`handouts`, `advisor_milestone_actions`, `milestones`, `budget_targets`,
`kpi_targets`, `kpi_benchmarks`, `kpi_chart_comments`, `pulse_checkins`,
`weekly_focus`, `agent_proposals`, `agent_runs`, `company_actions`,
`advisor_session_notes`, `advisor_company_acknowledgments`, `messages`,
`conversation_notes`, `slack_conversation_threads`, `slack_notification_log`,
`conversations`, `notifications (company_id)`, `advisor_notifications`,
`slack_report_notification_log`, `slack_handout_notification_log`,
`feedback`, `legat_enrollments`, `group_companies`, `_facts_backfill_log`,
`user_login_log`, `conversation_last_seen`, `message_reactions`,
`notifications (user_id)`, `feedback (user_id)`, `kpi_chart_comments (author_id)`,
`… (user_id)` × 6, `… (kaskade)` × 7, `email_send_log (a)`,
`email_send_log_legacy`, `email_unsubscribe_tokens`, `suppressed_emails`,
`company_invitations`, `company_members`, `auth_users`, `auth_users (bevares)`).
`storage`-nøglerne er `financial-documents`, `company-logos`, `avatars`,
`chat-attachments`, `feedback-screenshots`, `community-billeder`,
`community-filer`.

---

## Skridt 6 — Hvad vi forventede at se, og SELECT'en der siger det samme — KØRT 8/9

**KØRT:** tørkørslen og SQL'en var enige: `fundet 0`, `ikke_nu []`. `undersoegt` blev **35** (planens skøn var ~37 — tallet er det målte). Nul er rigtigt: Alina er stemplet ude, og ingen med slutdato efter 10/9 er nået til dag 45.

Motorens regel (`_shared/sletning.ts`), i SQL, så tørkørslen kan
sammenlignes med noget der ikke er den selv:

```sql
-- 6a. Kandidater i dag efter motorens regel: forventet 0 rækker
with c as (
  select c.id, c.name, c.status, c.contract_end_date, c.offboarding_requested_at,
         c.subscription_status, c.subscription_current_period_end, f.beslutning
  from public.companies c
  left join public.company_fornyelse f on f.company_id = c.id
  where c.data_slettet_at is null
)
select name, 'anmodning' as vej,
       (offboarding_requested_at::date + 7) as frist
from c
where offboarding_requested_at is not null
  and offboarding_requested_at::date + 7 <= current_date
union all
select name,
       case when beslutning = 'tilbyd' then 'tilbud_ubesvaret' else 'aldrig_tilbudt' end as vej,
       (contract_end_date::date + 45) as frist
from c
where offboarding_requested_at is null
  and contract_end_date is not null
  and contract_end_date::date > date '2026-09-10'                 -- inden for ordningen
  and contract_end_date::date + 45 <= current_date               -- dag 45 passeret
  and not (subscription_status = 'active' and subscription_current_period_end > now())  -- ikke selvbetjener
order by frist;

-- 6b. «På vej» — det tørkørslen viser i ikke_nu: anmodninger under 7 dage,
--     og udløbne inden for ordningen under dag 45: forventet 0 rækker i morgen
with c as (
  select c.name, c.contract_end_date, c.offboarding_requested_at, f.beslutning,
         c.subscription_status, c.subscription_current_period_end
  from public.companies c left join public.company_fornyelse f on f.company_id = c.id
  where c.data_slettet_at is null
)
select name, 'anmodning' as vej, offboarding_requested_at::date + 7 as frist
from c where offboarding_requested_at is not null and offboarding_requested_at::date + 7 > current_date
union all
select name, coalesce(beslutning, 'ingen beslutning'), contract_end_date::date + 45
from c where offboarding_requested_at is null
  and contract_end_date::date > date '2026-09-10'
  and contract_end_date::date < current_date          -- udløbet (tier expired)
  and contract_end_date::date + 45 > current_date
  and not (subscription_status = 'active' and subscription_current_period_end > now());

-- 6c. Undersøgt-tallet: alle uden stempel med anmodning eller slutdato
select count(*) as undersoegt
from public.companies
where data_slettet_at is null
  and (offboarding_requested_at is not null or contract_end_date is not null);

-- 6d. De syv «tidligere»: står ALLE med slutdato ≤ 10/9 og uden anmodning — uden for ordningen
select name, contract_end_date, offboarding_requested_at
from public.companies
where status = 'tidligere' and data_slettet_at is null
order by contract_end_date;
```

**Facit for tørkørslen — som planlagt, og som det blev (8/9 kl. 12:00):**

| felt | forventet | hvorfor |
|---|---|---|
| `ok` | `true` | |
| `dry_run` | `true` | ingen body |
| `undersoegt` | = 6c (alle med slutdato — ~37 rækker) | målgruppen er bred, motoren dømmer |
| `fundet` | **0** | vej 1: Alina var den eneste anmodning (1c), og hun er stemplet (3d). Vej 2/3: kræver slutdato EFTER 10/9 OG dag 45 passeret — den tidligste mulige slutdato er 11/9, dag 45 er 26/10. Umuligt før 26. oktober |
| `slettet`, `stoppet`, `fejlet` | 0 | |
| `kandidater` | `[]` | |
| `ikke_nu` | `[]` (6b) | en udløbet virksomhed inden for ordningen findes først efter 10/9; PHILBERT (29/9) og CARMA (11/9) er ikke udløbet endnu |
| `error` | fraværende | |

**Nul er RIGTIGT.** Den første rigtige kandidat kommer af sig selv:
CARMA STUDIO (slutdato 11/9, beslutning tilbyd, målt 7/9) bliver
`ikke_nu` fra 12/9 med frist 26/10, og kandidat 26/10 ad vej
`tilbud_ubesvaret` — medmindre de fornyer. Derfor planlægges cronen
alligevel (skridt 8), så dagen kommer uden at nogen skal huske den.

Stemmer tørkørslen ikke med 6a/6b (fx `fundet > 0` i morgen), så STOP:
en kandidat i morgen er enten en ny anmodning over syv dage (1c viser
den) eller en fejl i motoren — og cronen planlægges IKKE før det er
læst.

---

## Skridt 7 — Læs tørkørslen som den der skal slettes — KØRT 8/9

**KØRT:** rapporten læst, ingen kandidater, ingen `VILLE SLETTE`-linjer.

Selv med `fundet: 0` er der to ting at læse:

1. `undersoegt` skal være 6c's tal. Er det 0, læste funktionen ikke
   `companies` (RLS rører ikke service-role — men et `ok: false` med
   `error` siger hvad der skete).
2. Lovable → Edge functions → `slet-medlemsdata-cron` → Logs: linjen
   `[slet-medlemsdata-cron] Summary: {"ok":true,"dry_run":true,"undersoegt":N,"fundet":0,…}`.
   Ingen `VILLE SLETTE`-linjer forventes.

---

## Skridt 8 — Cron-jobbet (SQL editor, KUN efter skridt 6 er læst) — KØRT 8/9 kl. 12:01

**KØRT kl. 12:01:** `slet-medlemsdata`, `0 12 * * *` UTC (14:00 dansk), aktivt, `dry_run: false`. Tolvte job i `cron.job`, alene på klokkeslættet, efter `fornyelsesvarsler` kl. 11. **Udestår:** migrationsfilen der bogfører planlægningen (se bunden af skridtet).

**Slottet.** Optaget i UTC (målt 2/9 + fornyelsen 7/9): 04:00
`opgave-udloeb` · 05:00 `agent-runs-opbevaring` · 06:00
`generate-weekly-focus` (mandag) · 07:00 `event-reminders` · 08:00
`send-monthly-digest` (d. 22.) · 09:00 `daily-report-reminder` +
`intro-session-reminder` · 10:00 (`indgangs-paamindelser`, foreslået, ikke
bekræftet planlagt) · 11:00 `fornyelsesvarsler`. Derudover `*/5`-jobbene
(`process-notification-emails`, `cleanup-stale-processing-reports`) og det
døde `process-email-queue` (5 s, mod en slettet funktion).

**Ledigt:** 12:00 UTC og frem, og 00:00-03:00.

**Det der taler for 12:00 UTC (14:00 dansk), EFTER fornyelsesvarslerne
kl. 11:**
- Motoren kender ikke varslerne — den dømmer på slutdato, beslutning og
  stempel — så der er ingen datamæssig afhængighed nogen af vejene. Men
  rækkefølgen «varsel først, sletning bagefter» er den rigtige LÆSEORDEN
  for dagen: fornyelsesvarslernes rapport er læst, før sletningens
  rapport læses, og de to jobs rammer aldrig samme minut.
- Dagtid: fejler den første rigtige kørsel (26/10), står den i loggen
  kl. 14 dansk, ikke kl. 03 — og kan læses samme dag.
- Vej 1's frist regnes i hele UTC-kalenderdage (`sletning.ts`: dag 7 er
  første slettedag). Et medlem der trykker 15/9 kl. 23:00 dansk (21:00
  UTC) har fortrydelsesret til og med 21/9 og slettes 22/9 kl. 14:00
  dansk. Klokkeslættet flytter ikke dagen.

**Imod:** at lægge den FØR kl. 11 gav ingen fordel; at lægge den om
natten (03:00) sparer intet og gemmer fejlen til morgenen.

Formen, som `fornyelsesvarsler` (`fornyelsesvarsel-cron/index.ts:56-80`);
bemærk `'{"dry_run": false}'` i body — det er cronen der sletter:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'slet-medlemsdata') THEN
    PERFORM cron.unschedule('slet-medlemsdata');
  END IF;
END $$;

SELECT cron.schedule(
  'slet-medlemsdata',
  '0 12 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/slet-medlemsdata-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"dry_run": false}'::jsonb,
    timeout_milliseconds := 150000
  ) AS request_id;
  $job$
);

-- Efter-verifikation (SELECT): forventet 1 række, active = true
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'slet-medlemsdata';
```

Bogfør planlægningen i en migrationsfil bagefter (formen fra
`20260901112000_prod_cron_bogfoert.sql`), så jobbet kan genskabes fra
repoet — det andet vindues opgave.

---

## Skridt 9 — Hvad kan gå galt den første gang, og hvordan ses det (gælder fra nu — første rigtige kandidat tidligst 26/10)

| # | fejl | hvordan den ser ud | hvor |
|---|---|---|---|
| 1 | Migrationen ikke kørt før kaldet | `status_code 500`, `content` = `{"ok":false,…,"error":"column companies.data_slettet_at does not exist"}` | `net._http_response`; Logs: `companies-opslag fejlede` |
| 2 | Funktionen ikke deployet | `status_code 404`, `NOT_FOUND` | `net._http_response` (skridt 4) |
| 3 | Den delte fil `_shared/sletning.ts` mangler i deployet | `status_code 500`/boot-fejl, «Module not found» | Edge function Logs ved kaldet |
| 4 | Forkert/ingen nøgle | `401` («service-role key required») eller `403` («service-role required») | `net._http_response` |
| 5 | pg_net-timeout (5 s standard) | `error_msg` sat, `status_code` null — funktionen kørte måske FÆRDIG serverside alligevel | brug `timeout_milliseconds := 150000` (DEL 4) og læs Logs' `Summary:` |
| 6 | En kandidat i morgen (`fundet > 0`) | tørkørslen lister den med dom og grund | sammenlign med 6a; er den ikke i 6a, er motoren og SQL'en uenige — STOP |
| 7 | En kandidat med `stop` (bilag på kontoen / anden virksomhed) | `stoppet: 1`, `kandidater[].stop` med grund, `brugere[].konto = "STOP — …"` | rapporten; intet er slettet for den |
| 8 | Storage-`remove` afvises af `protect_delete` (ikke målt, spec §3) | ses FØRST ved en rigtig kørsel: `fejl: ["storage/financial-documents: remove fejlede: …"]`, `fejlet: 1`, INTET stempel — kandidaten findes igen næste dag | rapporten + Logs; SELECT 9a |
| 9 | Rigtig kørsel dør midtvejs | intet stempel; næste dag samme kandidat, `raekker` med nul på det der allerede er væk | 9a viser at stemplet mangler; hvert trin er idempotent |
| 10 | Cronen kører ikke | ingen linje i `cron.job_run_details` kl. 12:00 | SELECT 9b |

```sql
-- 9a. Efter en rigtig kørsel (fra 26/10): hvem er stemplet, og hvad forsvandt
select name, data_slettet_at, data_slettet_vej,
       data_slettet_raekker->>'financial_reports' as rapporter,
       data_slettet_raekker->>'user_login_log' as loginposter,
       data_slettet_raekker->>'auth_users' as konti,
       contact_email, contact_person             -- forventet NULL efter sletning
from public.companies
where data_slettet_at is not null
order by data_slettet_at desc;

-- 9b. Kørte cronen, og hvad svarede den
select j.jobname, d.status, d.return_message, d.start_time, d.end_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname = 'slet-medlemsdata'
order by d.start_time desc limit 5;

-- 9c. Funktionens svar til cronen (pg_net gemmer svaret et døgn)
select id, created, status_code, left(content, 400) as svar, error_msg
from net._http_response
where content like '%slet-medlemsdata%' or content like '%"undersoegt"%'
order by created desc limit 5;

-- 9d. Efterladte person-rækker efter en sletning (kaskaden tager dem ikke — det er trin 10):
--     kør med de user_id'er rapporten viste under brugere[] — forventet 0 alle steder
select 'user_login_log' as tabel, count(*) from public.user_login_log where user_id = '<P>'
union all select 'conversation_last_seen', count(*) from public.conversation_last_seen where user_id = '<P>'
union all select 'notifications', count(*) from public.notifications where user_id = '<P>'
union all select 'handouts', count(*) from public.handouts where user_id = '<P>'
union all select 'pulse_checkins', count(*) from public.pulse_checkins where user_id = '<P>';
```

---

## Rækkefølgen, kort — som den blev fulgt 8/9

1. SQL editor: **skridt 1** (SELECT, FØR-tilstand). Facit: 0 kolonner, Alina med anmodning, kun hende.
2. SQL editor: **skridt 2** (HELE migrationen). Facit: `UPDATE 1`.
3. SQL editor: **skridt 3** (SELECT). Facit: 3 kolonner, Alina stemplet `i_haanden`, 3d = 0 rækker.
4. Build-chat: **skridt 4**-beskeden. Så «View code», så 401-kaldet. Facit: 401.
5. SQL editor: **skridt 5** (tørkørslen, tom body). Læs `net._http_response`.
6. SQL editor: **skridt 6** (6a-6d). Facit: `fundet 0`, `ikke_nu []`, `undersoegt` = 6c.
7. Logs: **skridt 7**. Facit: én `Summary:`-linje, ingen `VILLE SLETTE`.
8. SQL editor: **skridt 8** (cron 12:00 UTC, `dry_run: false`). Facit: 1 aktivt job.
9. Bogfør: migration kørt, deploy bevist, cron planlagt — i OVERLEVERING og en cron-migrationsfil (det andet vindue).

Første rigtige kørsel med en kandidat: **tidligst 26. oktober** (CARMA,
hvis de ikke fornyer). Sæt en påmindelse til at læse 9a og 9b den dag.
