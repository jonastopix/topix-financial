# Køreplan: sletning af de syv tidligere medlemmer — som Alina, i ÉN kørsel

> **IKKE KØRT — 8. september 2026, dagens slut.** Planen er skrevet og
> efterprøvet mod skemaet, men ingen af skridtene er udført i prod. Den
> følges mod produktionsdata der ikke kan komme tilbage; FØR-målingen i
> skridt 1 er den eneste rollback-reference.
>
> **BESLUTTET af Jonas 8/9: kør den på ÉN virksomhed først — Coskun
> Holding ApS (`8929ee5f-5e6c-4326-965a-a261b71d74f5`, slut 6/5, den
> ældste) — og se at tallene stemmer FØR de seks andre.** Syv på én gang
> er hurtigere, men en fejl midtvejs bliver til syv sager i stedet for
> én. Konkret: i skridt 4's `insert into _syv` beholdes kun Coskuns
> linje i første kørsel; FØR/EFTER-målingerne (skridt 1 og 5) læses for
> hende alene; derefter køres de seks som én kørsel med samme script.
>
> **Slettefunktionen (#734, `slet-medlemsdata-cron`) tager IKKE de syv.**
> Dens vej 2 og 3 («tilbud ubesvaret», «aldrig tilbudt») er afgrænset til
> virksomheder inden for ordningen — slutdato efter 10/9, samme skel som
> fornyelsesmotorens `uden_for_ordningen` — og de syv (slutdato 6/5–1/9)
> falder udenfor med vilje (`src/lib/sletning.ts:34-37`). De er en
> beslutning, ikke en regel; derfor denne køreplan med eksplicitte id'er.
>
> **Arkivsporet:** migrationen `20260908120000_data_slettet.sql` (#734,
> IKKE kørt i prod) tilføjer `data_slettet_at`, `data_slettet_vej`
> (`'i_haanden'` er en tilladt værdi) og `data_slettet_raekker` (jsonb med
> FØR-tallene) på `companies`. Køres migrationen FØR de syv, sættes de tre
> kolonner i skridt 4's UPDATE i stedet for kun at stå i bogføringen —
> `data_slettet_vej = 'i_haanden'`, `data_slettet_raekker` = tallene fra
> skridt 1. Køres den ikke først, bogføres FØR-tallene som for Alina, i
> OVERLEVERING DEL 2 og i en migrationsfil.

Skrevet 8. september 2026, main (`## main...origin/main`, ren arbejdskopi ved
start og slut; intet ændret i repoet, ingen gren, ingen commit; intet
slettet herfra). `supabase/functions/` og `src/lib/` er ikke rørt.
Kilder: `~/Downloads/recon-alinas-sletning.md` (rækkefølge, FK-kort,
kolonneliste), `~/Downloads/recon-de-syv-tidligere.md` (tælle-SQL),
`docs/OVERLEVERING.md` DEL 2 «Alina-sagen» (:2176-2270) og DEL 4
(:3274-3300), og FK-klausulerne læst igen i migrationerne i dag.

Beslutningen (Jonas 8/9): de syv slettes som Alina — kundens materiale og
alt personligt væk, navn/CVR/kontraktdatoer/status/`offboarding_requested_at`
bliver som arkivspor. Målt 8/9 kl. 10:27: ingen perioder, træk,
betalingslink, bookinger eller `stripe_customer_id`; ni konti; én fil.

**Reglen for hele planen:** Lovables SQL editor kører hvert script som ÉN
transaktion — fejler ét statement, rulles alt tilbage (DEL 1). Sletningen
i skridt 5 udnytter det: værnene øverst kaster, og så sker intet.
Editoren viser kun det SIDSTE resultatsæt — derfor er målingerne
skrevet som én SELECT hver.

---

## 1. Alinas sletning — som den blev kørt, og hvad der kom til

Det der står i repoet om den faktiske kørsel (OVERLEVERING:2193-2196):
«planlagt linje for linje (`recon-alinas-sletning.md`) og udført i
Lovables SQL editor 8/9 kl. 09:57-10:08, tabel for tabel, med SELECT før
og efter.» Selve statement-rækkefølgen minut for minut står ikke i
repoet — den er i SQL editorens historik. Det der KAN gengives ordret er
den planlagte rækkefølge (recon §4), FØR-tallene, og de trin
bogføringen siger kom til.

### 1a. Den planlagte rækkefølge, ordret (recon-alinas-sletning §4)

1. Storage først, mens stierne kendes (`financial-documents/<company>/…`,
   `company-logos/<company>/logo`, `avatars/<user>/…`,
   `chat-attachments/<user>/…`, `feedback-screenshots/<user>/…`,
   `community-billeder/<user>/…`, `community-filer/<user>/…`) — via
   Storage API/dashboard, ikke SQL.
2. `financial_commentaries` (RESTRICT mod facts).
3. `financial_report_facts` (uden ON DELETE mod rapporter).
4. `financial_reports`.
5. `handout_lever_milestones` → `handouts`; `advisor_milestone_actions` → `milestones`.
6. `budget_targets`, `kpi_targets`, `kpi_benchmarks`, `kpi_chart_comments`.
7. `pulse_checkins`, `weekly_focus`, `agent_proposals` → `agent_runs`,
   `company_actions`, `advisor_session_notes`, (`advisor_company_acknowledgments`).
8. `messages` → `conversation_notes`, `slack_conversation_threads` → `conversations`.
9. `notifications` (company_id OG user_id), `advisor_notifications`,
   `slack_*_log`, `feedback`, `legat_enrollments`, `group_companies`.
10. Person-nøglet uden FK: `user_login_log`, `conversation_last_seen`,
    `message_reactions`, `notifications.user_id`; mail:
    `email_unsubscribe_tokens`, `suppressed_emails`, `email_send_log` (a).
11. `company_invitations`.
12. `company_members`.
13. `auth.users` (kaskade: `profiles`, `user_roles`, `member_profiles`,
    `member_progress`, `community_*`, `event_registrations`).
14. UPDATE `companies` — personfelterne til NULL, sporet sat.
15. Rører ikke: `company_perioder`, `company_traek`,
    `company_betalingslink`, `session_bookings`, `email_send_log` (b),
    `company_fornyelse`.

### 1b. FØR-tallene der faktisk blev slettet (OVERLEVERING:2198-2225)

`budget_targets` 240 · `user_login_log` 198 · `messages` 30 ·
`advisor_notifications` 27 · `email_send_log` 21 · `financial_report_facts`
15 · `financial_reports` 13 · filer i `financial-documents` 13 ·
`notifications` 12 · `slack_report_notification_log` 10 ·
`financial_commentaries` 8 · `weekly_focus` 6 · `handouts` 5 ·
`milestones` 3 · `kpi_benchmarks` 2 · `conversations` 1 ·
`company_invitations` 1 · `company_members` 1 · `user_roles` 1 ·
`pulse_checkins` 1 · `conversation_last_seen` 1 · `auth.users` 1 konto.
Plus `companies`-rækken: «kontaktperson, mail, telefon, adresse,
postnummer, by, hjemmeside, årsomsætning» sat til NULL, `er_kunde` sat
til false (`:2227-2236`).

### 1c. Det der kom TIL undervejs — fordi kaskaden ikke tog det

OVERLEVERING:2246-2252 («Kaskaden tager ikke alt»): efter at kontoen var
slettet stod **198 loginposter med IP, 5 handouts, 1 pulse-checkin og 1
`conversation_last_seen`** tilbage — tabeller med `user_id` uden FK. De
blev fanget fordi «hver tabel med `user_id` og `company_id` blev listet
fra `information_schema` og målt ÉN FOR ÉN». Dertil, som Jonas nævner
det 8/9, de company-nøglede tabeller udenfor den første tælling:
`weekly_focus` (6), `advisor_notifications` (27), slack-loggen
(`slack_report_notification_log` 10) og `kpi_benchmarks` (2). Alle står
i planen nedenfor fra start, så ingen af dem skal findes bagefter.
`email_send_log` (21) blev slettet helt — Alina havde ingen bilagsmails.

---

## 2. Skridt 1 — FØR-målingen (rollback-referencen; der findes ingen anden)

Kør i Lovable → SQL editor. KUN SELECT. Gem hele resultatet (kopiér
tabellen ud) FØR noget slettes. To resultatsæt: kør dem som to
kørsler, editoren viser kun det sidste.

### 2a. Rækker pr. virksomhed pr. tabel (én linje pr. tabel med rækker)

```sql
with v as (
  select id, name from public.companies
  where id in ('8929ee5f-5e6c-4326-965a-a261b71d74f5','93e8d101-b625-405c-83de-c3af3bc2527d',
               '57e41335-f91f-42fe-a2e9-7f85dca6f46f','017b9fad-9708-4fca-b35f-abec08c916c0',
               'fbec75bb-6e3f-4b90-b937-7522bde76917','32379181-f2c6-4ad9-92ca-aaed860f3e53',
               '652dfff9-95b1-4bf6-b891-0fb43fb716d9')
),
m as (select cm.company_id, cm.user_id from public.company_members cm join v on v.id = cm.company_id),
conv as (select c.id, c.company_id from public.conversations c join v on v.id = c.company_id),
adr as (
  select v.id as company_id, lower(u.email) as email from v join m on m.company_id = v.id join auth.users u on u.id = m.user_id
  union select v.id, lower(ci.email) from v join public.company_invitations ci on ci.company_id = v.id
  union select v.id, lower(c.contact_email) from v join public.companies c on c.id = v.id where c.contact_email is not null
)
select v.name as virksomhed, t.tabel, t.antal
from v
cross join lateral (values
  -- (a) slettes — company-nøglet
  ('financial_commentaries',        (select count(*) from public.financial_commentaries x where x.company_id = v.id)),
  ('financial_report_facts',        (select count(*) from public.financial_report_facts x where x.company_id = v.id)),
  ('_facts_backfill_log',           (select count(*) from public._facts_backfill_log x where x.company_id = v.id)),
  ('slack_report_notification_log', (select count(*) from public.slack_report_notification_log x where x.company_id = v.id)),
  ('financial_reports',             (select count(*) from public.financial_reports x where x.company_id = v.id)),
  ('handout_lever_milestones',      (select count(*) from public.handout_lever_milestones hl where hl.handout_id in (select id from public.handouts where company_id = v.id) or hl.milestone_id in (select id from public.milestones where company_id = v.id))),
  ('advisor_milestone_actions',     (select count(*) from public.advisor_milestone_actions a where a.milestone_id in (select id from public.milestones where company_id = v.id))),
  ('handouts',                      (select count(*) from public.handouts x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('milestones',                    (select count(*) from public.milestones x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('budget_targets',                (select count(*) from public.budget_targets x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('kpi_targets',                   (select count(*) from public.kpi_targets x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('kpi_benchmarks',                (select count(*) from public.kpi_benchmarks x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('kpi_chart_comments',            (select count(*) from public.kpi_chart_comments x where x.company_id = v.id or x.author_id in (select user_id from m where m.company_id = v.id))),
  ('pulse_checkins',                (select count(*) from public.pulse_checkins x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('weekly_focus',                  (select count(*) from public.weekly_focus x where x.company_id = v.id)),
  ('agent_proposals',               (select count(*) from public.agent_proposals x where x.company_id = v.id)),
  ('agent_runs',                    (select count(*) from public.agent_runs x where x.company_id = v.id)),
  ('company_actions',               (select count(*) from public.company_actions x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('advisor_session_notes',         (select count(*) from public.advisor_session_notes x where x.company_id = v.id)),
  ('advisor_company_acknowledgments',(select count(*) from public.advisor_company_acknowledgments x where x.company_id = v.id)),
  ('message_reactions',             (select count(*) from public.message_reactions x where x.message_id in (select ms.id from public.messages ms join conv on conv.id = ms.conversation_id where conv.company_id = v.id) or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('conversation_last_seen',        (select count(*) from public.conversation_last_seen x where x.conversation_id in (select id from conv where conv.company_id = v.id) or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('conversation_notes',            (select count(*) from public.conversation_notes x where x.conversation_id in (select id from conv where conv.company_id = v.id))),
  ('slack_notification_log',        (select count(*) from public.slack_notification_log x where x.company_id = v.id)),
  ('slack_conversation_threads',    (select count(*) from public.slack_conversation_threads x where x.company_id = v.id)),
  ('messages',                      (select count(*) from public.messages x where x.conversation_id in (select id from conv where conv.company_id = v.id) or x.sender_id in (select user_id from m where m.company_id = v.id))),
  ('conversations',                 (select count(*) from public.conversations x where x.company_id = v.id or x.member_id in (select user_id from m where m.company_id = v.id))),
  ('advisor_financial_actions',     (select count(*) from public.advisor_financial_actions x where x.notification_id in (select id from public.notifications n where n.company_id = v.id or n.user_id in (select user_id from m where m.company_id = v.id)))),
  ('notifications',                 (select count(*) from public.notifications x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('advisor_notifications',         (select count(*) from public.advisor_notifications x where x.company_id = v.id or x.member_id in (select user_id from m where m.company_id = v.id))),
  ('slack_handout_notification_log',(select count(*) from public.slack_handout_notification_log x where x.company_id = v.id)),
  ('feedback',                      (select count(*) from public.feedback x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('legat_enrollments',             (select count(*) from public.legat_enrollments x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('group_companies',               (select count(*) from public.group_companies x where x.company_id = v.id)),
  -- (a) slettes — person-nøglet
  ('user_login_log (med IP)',       (select count(*) from public.user_login_log x where x.user_id in (select user_id from m where m.company_id = v.id))),
  ('member_progress',               (select count(*) from public.member_progress x where x.user_id in (select user_id from m where m.company_id = v.id))),
  ('member_profiles',               (select count(*) from public.member_profiles x where x.user_id in (select user_id from m where m.company_id = v.id))),
  ('event_registrations',           (select count(*) from public.event_registrations x where x.user_id in (select user_id from m where m.company_id = v.id))),
  ('community_visninger',           (select count(*) from public.community_visninger x where x.bruger_id in (select user_id from m where m.company_id = v.id))),
  ('community_reaktioner',          (select count(*) from public.community_reaktioner x where x.bruger_id in (select user_id from m where m.company_id = v.id))),
  ('community_svar',                (select count(*) from public.community_svar x where x.forfatter_id in (select user_id from m where m.company_id = v.id))),
  ('community_traade',              (select count(*) from public.community_traade x where x.forfatter_id in (select user_id from m where m.company_id = v.id))),
  ('email_unsubscribe_tokens',      (select count(*) from public.email_unsubscribe_tokens x where lower(x.email) in (select email from adr where adr.company_id = v.id))),
  ('suppressed_emails',             (select count(*) from public.suppressed_emails x where lower(x.email) in (select email from adr where adr.company_id = v.id))),
  ('email_send_log',                (select count(*) from public.email_send_log x where lower(x.recipient_email) in (select email from adr where adr.company_id = v.id))),
  ('email_send_log — heraf bilagslabels (skal være 0)', (select count(*) from public.email_send_log x where lower(x.recipient_email) in (select email from adr where adr.company_id = v.id) and (x.template_name like 'indgang-%' or x.template_name like 'fornyelse-%' or x.template_name = 'session-booking-confirmation'))),
  ('email_send_log_legacy',         (select count(*) from public.email_send_log_legacy x where lower(x.recipient_email) in (select email from adr where adr.company_id = v.id))),
  ('company_invitations',           (select count(*) from public.company_invitations x where x.company_id = v.id)),
  ('user_roles',                    (select count(*) from public.user_roles x where x.user_id in (select user_id from m where m.company_id = v.id))),
  ('profiles',                      (select count(*) from public.profiles x where x.user_id in (select user_id from m where m.company_id = v.id))),
  ('company_members',               (select count(*) from public.company_members x where x.company_id = v.id)),
  ('auth.users (konti)',            (select count(*) from m where m.company_id = v.id)),
  -- storage
  ('storage: filer (company-nøglet buckets)', (select count(*) from storage.objects o where o.bucket_id in ('financial-documents','company-logos') and (storage.foldername(o.name))[1] = v.id::text)),
  ('storage: filer (person-nøglet buckets)',  (select count(*) from storage.objects o where o.bucket_id in ('avatars','chat-attachments','feedback-screenshots','community-billeder','community-filer') and (storage.foldername(o.name))[1] in (select user_id::text from m where m.company_id = v.id))),
  -- (b) SKAL være 0 — ellers stop (værnet i skridt 5 kaster)
  ('VÆRN company_perioder',         (select count(*) from public.company_perioder x where x.company_id = v.id)),
  ('VÆRN company_traek',            (select count(*) from public.company_traek x where x.company_id = v.id)),
  ('VÆRN company_betalingslink',    (select count(*) from public.company_betalingslink x where x.company_id = v.id)),
  ('VÆRN session_bookings',         (select count(*) from public.session_bookings x where x.company_id = v.id or x.user_id in (select user_id from m where m.company_id = v.id))),
  ('VÆRN company_fornyelse',        (select count(*) from public.company_fornyelse x where x.company_id = v.id)),
  ('VÆRN konti i ANDRE virksomheder', (select count(*) from public.company_members x where x.user_id in (select user_id from m where m.company_id = v.id) and x.company_id <> v.id)),
  ('VÆRN konti med advisor/admin-rolle', (select count(*) from public.user_roles x where x.user_id in (select user_id from m where m.company_id = v.id) and x.role in ('advisor','admin')))
) as t(tabel, antal)
where t.antal > 0
order by v.name, t.tabel;
```

### 2b. Kontiene, adresserne og filen — GEM DENNE, den bruges i skridt 7 og 8

Efter skridt 5 findes `company_members` ikke længere, så bruger-id'erne
kan ikke slås op igen. Dette er den eneste liste.

```sql
with v as (
  select id, name from public.companies
  where id in ('8929ee5f-5e6c-4326-965a-a261b71d74f5','93e8d101-b625-405c-83de-c3af3bc2527d',
               '57e41335-f91f-42fe-a2e9-7f85dca6f46f','017b9fad-9708-4fca-b35f-abec08c916c0',
               'fbec75bb-6e3f-4b90-b937-7522bde76917','32379181-f2c6-4ad9-92ca-aaed860f3e53',
               '652dfff9-95b1-4bf6-b891-0fb43fb716d9')
)
select 'konto' as slags, v.name, u.id::text as id, u.email as detalje, cm.role as rolle,
       u.last_sign_in_at::text as sidst
from v join public.company_members cm on cm.company_id = v.id join auth.users u on u.id = cm.user_id
union all
select 'invitation', v.name, ci.id::text, ci.email, ci.status, ci.created_at::text
from v join public.company_invitations ci on ci.company_id = v.id
union all
select 'contact_email', v.name, v.id::text, c.contact_email, c.contact_person, c.contact_phone
from v join public.companies c on c.id = v.id
union all
select 'fil', v.name, o.bucket_id, o.name, (o.metadata->>'size'), o.created_at::text
from v join storage.objects o
  on (o.bucket_id in ('financial-documents','company-logos') and (storage.foldername(o.name))[1] = v.id::text)
  or (o.bucket_id in ('avatars','chat-attachments','feedback-screenshots','community-billeder','community-filer')
      and (storage.foldername(o.name))[1] in (select cm.user_id::text from public.company_members cm where cm.company_id = v.id))
union all
select 'rapport-sti', v.name, r.id::text, r.file_path, r.status, r.uploaded_at::text
from v join public.financial_reports r on r.company_id = v.id
order by 1, 2, 3;
```

### 2c. `companies`-rækkerne som de står (FØR-værdier til arkivet)

```sql
select id, name, cvr_number, status, contract_start_date, contract_end_date, offboarding_requested_at, er_kunde,
       contact_person, contact_email, contact_phone, address, postal_code, city, website, annual_revenue,
       description, logo_url, slack_channel,
       (application_context is not null) as har_application_context,
       stripe_customer_id, stripe_subscription_id, subscription_status
from public.companies
where id in ('8929ee5f-5e6c-4326-965a-a261b71d74f5','93e8d101-b625-405c-83de-c3af3bc2527d',
             '57e41335-f91f-42fe-a2e9-7f85dca6f46f','017b9fad-9708-4fca-b35f-abec08c916c0',
             'fbec75bb-6e3f-4b90-b937-7522bde76917','32379181-f2c6-4ad9-92ca-aaed860f3e53',
             '652dfff9-95b1-4bf6-b891-0fb43fb716d9')
order by contract_end_date;
```
Til sammenligning, Alinas række som den står efter hendes sletning
(afgør om `application_context`/`description` blev NULL'et 8/9 — det
står ikke i bogføringen):
```sql
select name, contact_person, contact_email, contact_phone, address, city, website, annual_revenue,
       (application_context is not null) as har_application_context, description, logo_url, slack_channel, er_kunde
from public.companies where id = '778c7899-feff-4f8a-a11e-83dac1bd39f5';
```

---

## 3. Skridt 2 — STOP-kriterier (læs FØR-målingen)

Fortsæt kun hvis alle VÆRN-linjer i 2a er fraværende (antal 0 vises ikke):
`company_perioder`, `company_traek`, `company_betalingslink`,
`session_bookings`, `company_fornyelse`, «konti i ANDRE virksomheder»,
«konti med advisor/admin-rolle», og «email_send_log — heraf
bilagslabels». Står én af dem med et tal, er sagen IKKE identisk med
Alinas, og skridt 5's værn vil kaste. Målt 8/9 kl. 10:27 var de fire
første 0 for alle syv.

---

## 4. Skridt 3 — storage: den ene fil (uden for SQL, FØR sletningen)

`storage.objects` er DELETE-beskyttet af `protect_delete`-triggeren
(OVERLEVERING DEL 4:2836); filen slettes i Lovable → Storage (eller via
Storage API), ikke i SQL. Stien står i 2b under `fil` (bucket + name) —
målt 8/9: én fil, LineAlmegaard. Slet den nu, mens `file_path` stadig kan
slås op mod `financial_reports`. Kontrol (SELECT):
```sql
select o.bucket_id, o.name from storage.objects o
where (o.bucket_id in ('financial-documents','company-logos') and (storage.foldername(o.name))[1] in (
        '8929ee5f-5e6c-4326-965a-a261b71d74f5','93e8d101-b625-405c-83de-c3af3bc2527d','57e41335-f91f-42fe-a2e9-7f85dca6f46f',
        '017b9fad-9708-4fca-b35f-abec08c916c0','fbec75bb-6e3f-4b90-b937-7522bde76917','32379181-f2c6-4ad9-92ca-aaed860f3e53',
        '652dfff9-95b1-4bf6-b891-0fb43fb716d9'))
   or (o.bucket_id in ('avatars','chat-attachments','feedback-screenshots','community-billeder','community-filer')
       and (storage.foldername(o.name))[1] in (select cm.user_id::text from public.company_members cm where cm.company_id in (
        '8929ee5f-5e6c-4326-965a-a261b71d74f5','93e8d101-b625-405c-83de-c3af3bc2527d','57e41335-f91f-42fe-a2e9-7f85dca6f46f',
        '017b9fad-9708-4fca-b35f-abec08c916c0','fbec75bb-6e3f-4b90-b937-7522bde76917','32379181-f2c6-4ad9-92ca-aaed860f3e53',
        '652dfff9-95b1-4bf6-b891-0fb43fb716d9')));
```
Forventet efter: 0 rækker.

---

## 5. Skridt 4 — SLETNINGEN, én transaktion

Hele scriptet køres som én kørsel i SQL editoren (én transaktion). De
syv id'er står øverst som en liste. Værnene i `DO`-blokken kaster, hvis
en forudsætning ikke holder — så rulles alt tilbage og intet er slettet.
Rækkefølgen er FK-sikker: børn før forældre; `company_members` sidst af
rækkerne (id'erne er fanget i en temp-tabel først); `companies`
opdateres, aldrig slettes. Rører ikke `company_perioder`, `company_traek`,
`company_betalingslink`, `session_bookings`, Stripe-felterne,
`company_fornyelse`.

```sql
-- ============================================================
-- SLETNING AF DE SYV TIDLIGERE MEDLEMMER — som Alina 8/9, i én kørsel.
-- Én transaktion. Fejler et statement, rulles ALT tilbage.
-- ============================================================

create temp table _syv (id uuid primary key, navn text) on commit drop;
insert into _syv values
  ('8929ee5f-5e6c-4326-965a-a261b71d74f5', 'Coskun Holding ApS      6/5'),
  ('93e8d101-b625-405c-83de-c3af3bc2527d', 'Regnskabsvikar ApS      6/5'),
  ('57e41335-f91f-42fe-a2e9-7f85dca6f46f', 'Sebastian & Amalie      6/5'),
  ('017b9fad-9708-4fca-b35f-abec08c916c0', 'Stadio                  6/5'),
  ('fbec75bb-6e3f-4b90-b937-7522bde76917', 'Startkørekort          21/5'),
  ('32379181-f2c6-4ad9-92ca-aaed860f3e53', 'Friends & Fries ApS    22/8'),
  ('652dfff9-95b1-4bf6-b891-0fb43fb716d9', 'LineAlmegaard           1/9');

-- Konti og adresser fanges FØR company_members/invitationer slettes.
create temp table _brugere (user_id uuid primary key) on commit drop;
insert into _brugere select distinct cm.user_id from public.company_members cm join _syv s on s.id = cm.company_id;

create temp table _adresser (email text primary key) on commit drop;
insert into _adresser
  select distinct lower(u.email) from auth.users u join _brugere b on b.user_id = u.id where u.email is not null
  union select distinct lower(ci.email) from public.company_invitations ci join _syv s on s.id = ci.company_id
  union select distinct lower(c.contact_email) from public.companies c join _syv s on s.id = c.id where c.contact_email is not null;

create temp table _samtaler (id uuid primary key) on commit drop;
insert into _samtaler select c.id from public.conversations c where c.company_id in (select id from _syv)
  or c.member_id in (select user_id from _brugere);

-- ── VÆRN: sagen skal være identisk med Alinas. Ellers stop, intet slettet. ──
do $$
declare n int;
begin
  select count(*) into n from _syv s join public.companies c on c.id = s.id;
  if n <> 7 then raise exception 'Forventede 7 virksomheder, fandt %', n; end if;

  select count(*) into n from _syv s join public.companies c on c.id = s.id
   where c.status is distinct from 'tidligere' or c.contract_end_date is null or c.contract_end_date >= current_date;
  if n > 0 then raise exception '% virksomhed(er) er ikke tidligere med passeret slutdato', n; end if;

  select count(*) into n from public.company_perioder where company_id in (select id from _syv);
  if n > 0 then raise exception 'company_perioder: % rækker — bilag, stop', n; end if;
  select count(*) into n from public.company_traek where company_id in (select id from _syv);
  if n > 0 then raise exception 'company_traek: % rækker — bilag, stop', n; end if;
  select count(*) into n from public.company_betalingslink where company_id in (select id from _syv);
  if n > 0 then raise exception 'company_betalingslink: % rækker — bilag, stop', n; end if;
  select count(*) into n from public.session_bookings where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
  if n > 0 then raise exception 'session_bookings: % rækker — bilag, stop', n; end if;
  select count(*) into n from _syv s join public.companies c on c.id = s.id where c.stripe_customer_id is not null or c.stripe_subscription_id is not null;
  if n > 0 then raise exception 'Stripe-id på % virksomhed(er) — stop', n; end if;
  select count(*) into n from public.company_fornyelse where company_id in (select id from _syv);
  if n > 0 then raise exception 'company_fornyelse: % rækker — afgør først', n; end if;

  select count(*) into n from public.company_members cm where cm.user_id in (select user_id from _brugere) and cm.company_id not in (select id from _syv);
  if n > 0 then raise exception '% konto/konti hører også til en anden virksomhed — stop', n; end if;
  select count(*) into n from public.user_roles r where r.user_id in (select user_id from _brugere) and r.role in ('advisor','admin');
  if n > 0 then raise exception '% konto/konti er advisor/admin — stop', n; end if;

  select count(*) into n from public.email_send_log e join _adresser a on lower(e.recipient_email) = a.email
   where e.template_name like 'indgang-%' or e.template_name like 'fornyelse-%' or e.template_name = 'session-booking-confirmation';
  if n > 0 then raise exception 'email_send_log: % bilagsmails på adresserne — stop', n; end if;
end $$;

-- ── 1. Kundens tal: analyser (RESTRICT mod facts) → facts → backfill-log → rapporter ──
delete from public.financial_commentaries        where company_id in (select id from _syv);
delete from public.financial_report_facts        where company_id in (select id from _syv);
delete from public._facts_backfill_log           where company_id in (select id from _syv)
                                                    or report_id in (select id from public.financial_reports where company_id in (select id from _syv));
delete from public.slack_report_notification_log where company_id in (select id from _syv);
delete from public.financial_reports             where company_id in (select id from _syv);

-- ── 2. Handouts og milepæle (koblingstabellerne først) ──
delete from public.handout_lever_milestones where handout_id in (select id from public.handouts where company_id in (select id from _syv) or user_id in (select user_id from _brugere))
                                              or milestone_id in (select id from public.milestones where company_id in (select id from _syv) or user_id in (select user_id from _brugere));
delete from public.advisor_milestone_actions where milestone_id in (select id from public.milestones where company_id in (select id from _syv) or user_id in (select user_id from _brugere));
delete from public.handouts   where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.milestones where company_id in (select id from _syv) or user_id in (select user_id from _brugere);

-- ── 3. Budget og KPI ──
delete from public.budget_targets     where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.kpi_targets        where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.kpi_benchmarks     where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.kpi_chart_comments where company_id in (select id from _syv) or author_id in (select user_id from _brugere);

-- ── 4. Refleksion, agent, opgaver, sessionsnoter ──
delete from public.pulse_checkins                  where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.weekly_focus                    where company_id in (select id from _syv);
delete from public.agent_proposals                 where company_id in (select id from _syv);
delete from public.agent_runs                      where company_id in (select id from _syv);
delete from public.company_actions                 where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.advisor_session_notes           where company_id in (select id from _syv);
delete from public.advisor_company_acknowledgments where company_id in (select id from _syv);

-- ── 5. Chatten: reaktioner og læsemærker → noter/slack-tråde → beskeder → samtaler ──
delete from public.message_reactions      where message_id in (select id from public.messages where conversation_id in (select id from _samtaler))
                                             or user_id in (select user_id from _brugere);
delete from public.conversation_last_seen where conversation_id in (select id from _samtaler) or user_id in (select user_id from _brugere);
delete from public.conversation_notes     where conversation_id in (select id from _samtaler);
delete from public.slack_notification_log where company_id in (select id from _syv) or conversation_id in (select id from _samtaler);
delete from public.slack_conversation_threads where company_id in (select id from _syv) or conversation_id in (select id from _samtaler);
delete from public.messages               where conversation_id in (select id from _samtaler) or sender_id in (select user_id from _brugere);
delete from public.conversations          where id in (select id from _samtaler);

-- ── 6. Notifikationer, feedback, legat, grupper ──
delete from public.advisor_financial_actions where notification_id in (select id from public.notifications where company_id in (select id from _syv) or user_id in (select user_id from _brugere));
delete from public.notifications             where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.advisor_notifications     where company_id in (select id from _syv) or member_id in (select user_id from _brugere);
delete from public.slack_handout_notification_log where company_id in (select id from _syv);
delete from public.feedback                  where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.legat_enrollments         where company_id in (select id from _syv) or user_id in (select user_id from _brugere);
delete from public.group_companies           where company_id in (select id from _syv);

-- ── 7. Personen — det kaskaden IKKE tager (Alinas fire), plus det den ville have taget ──
delete from public.user_login_log       where user_id in (select user_id from _brugere);
delete from public.member_progress      where user_id in (select user_id from _brugere);
delete from public.member_profiles      where user_id in (select user_id from _brugere);
delete from public.event_registrations  where user_id in (select user_id from _brugere);
delete from public.community_visninger  where bruger_id in (select user_id from _brugere);
delete from public.community_reaktioner where bruger_id in (select user_id from _brugere);
delete from public.community_svar       where forfatter_id in (select user_id from _brugere);
-- NB: en tråd skrevet af personen kaskaderer andres svar/reaktioner på den (FK CASCADE, 20260811140000:99,127,161).
delete from public.community_traade     where forfatter_id in (select user_id from _brugere);

-- ── 8. Mail, nøglet på adresse — ALLE rækker; værnet ovenfor har vist at ingen er bilag ──
delete from public.email_unsubscribe_tokens where lower(email) in (select email from _adresser);
delete from public.suppressed_emails        where lower(email) in (select email from _adresser);
delete from public.email_send_log           where lower(recipient_email) in (select email from _adresser);
delete from public.email_send_log_legacy    where lower(recipient_email) in (select email from _adresser);

-- ── 9. Koblingerne: invitationer, roller, profiler, medlemskab (sidst af rækkerne) ──
delete from public.company_invitations where company_id in (select id from _syv);
delete from public.user_roles          where user_id in (select user_id from _brugere);
delete from public.profiles            where user_id in (select user_id from _brugere);
delete from public.company_members     where company_id in (select id from _syv);

-- ── 10. Arkivrækken: persondata til NULL — SAMME felter som Alina (OVERLEVERING:2227-2236). ──
-- Bliver: id, name, cvr_number, status, contract_start_date, contract_end_date,
-- offboarding_requested_at, Stripe-felter (er null), industri, datoer.
update public.companies
   set contact_person = null,
       contact_email  = null,
       contact_phone  = null,
       address        = null,
       postal_code    = null,
       city           = null,
       website        = null,
       annual_revenue = null,
       er_kunde       = false
 where id in (select id from _syv)
   and status = 'tidligere';

-- Sidste resultatsæt (det editoren viser): arkivrækkerne som de nu står.
select c.id, c.name, c.cvr_number, c.status, c.contract_start_date, c.contract_end_date, c.offboarding_requested_at,
       c.er_kunde, c.contact_person, c.contact_email, c.contact_phone, c.address, c.website, c.annual_revenue
from public.companies c join _syv s on s.id = c.id
order by c.contract_end_date;
```

**Det scriptet med vilje IKKE gør — afgør særskilt:**
- `application_context` (founderens egne ord + `raw_cvr_data`),
  `description`, `logo_url`, `slack_channel`: bogføringen af Alina nævner
  dem ikke blandt de NULL'ede felter; 2c's sidste SELECT viser hvad der
  faktisk står på hendes række. Skal de med, er det én linje mere i
  UPDATE'n — samme sted, samme kørsel.
- `auth.users`: ikke i transaktionen (skridt 7).

---

## 6. Skridt 5 — EFTER-målingen

Kør 2a igen, ordret. Forventet: INGEN linjer bortset fra
`auth.users (konti)` (konti er endnu ikke slettet — det er skridt 7) og
evt. `storage: filer …` hvis skridt 3 blev sprunget over. Alle
`VÆRN`-linjer: fraværende. Kør derefter 2c (den første SELECT): de otte
personfelter skal være NULL på alle syv, `er_kunde` false, og `name`,
`cvr_number`, `status`, `contract_*`, `offboarding_requested_at` uændrede
mod FØR-tallene.

Kontrol af at bilaget er urørt (skal give 0 — som før):
```sql
select (select count(*) from public.company_perioder where company_id in (select id from public.companies where status = 'tidligere' and name <> 'Alina Beauty & Skincare')) as perioder,
       (select count(*) from public.company_traek where company_id in (select id from public.companies where status = 'tidligere')) as traek,
       (select count(*) from public.company_betalingslink where company_id in (select id from public.companies where status = 'tidligere')) as betalingslink;
```

---

## 7. Skridt 6 — det der IKKE kan gøres i den SQL

**Storage (skridt 3, FØR):** `protect_delete` blokerer `DELETE` på
`storage.objects`. Filen slettes i Lovable → Storage → bucket → sti (fra
2b), eller via Storage API. Gjort FØR skridt 4, fordi stien slås op mod
`financial_reports.file_path` og bruger-id'erne.

**Brugerkontiene (skridt 7, SIDST):** de ni `auth.users`-rækker. Tre veje
findes, alle uden for skridt 4's transaktion:
1. Lovable → Cloud → Users → slet hver konto (id/e-mail fra 2b).
2. `admin-cleanup-test-data` med `action: "delete_orphan_user"` og
   admins JWT (`index.ts:120-170`): den afviser hvis kontoen stadig har
   `company_members` (`:127-139`, 409) — efter skridt 4 har de ingen — og
   sletter `profiles`, `notifications`, `user_login_log` (alle allerede 0)
   og `auth.admin.deleteUser`.
3. SQL editoren når `auth`-skemaet (OVERLEVERING DEL 4: «SQL editoren NÅR
   auth-skemaet. Bevist 3/9: `DELETE FROM auth.users` virkede»), med
   kaskade til `profiles`/`user_roles` (allerede tomme). Skal den bruges,
   er det en SEPARAT kørsel efter skridt 5 med de ni id'er fra 2b som
   literaler — aldrig i samme script som skridt 4 (DEL 1: DDL og
   destruktive trin adskilt).
Uanset vej: kontoen SIDST, fordi `user_id` er nøglen til sweepen i
skridt 8, og fordi Alinas rester (198 loginposter) netop lå i tabeller
kaskaden ikke rører — dem har skridt 4 allerede taget.

Efter sletning af konti, kontrol (SELECT):
```sql
select id, email from auth.users where id in (/* de ni id'er fra 2b */ '00000000-0000-0000-0000-000000000000');
```
Forventet: 0 rækker.

---

## 8. Skridt 7 — den SIDSTE SWEEP (efter alt — det var dén der fangede de 198)

Dynamisk: finder selv hver tabel i `public` med en `company_id`- eller
person-kolonne og tæller for de syv virksomheder og de ni konti. Indsæt
de ni bruger-id'er fra 2b som literaler (company_members findes ikke
længere). `query_to_xml` er standard-Postgres; kun SELECT.

```sql
with syv as (
  select unnest(array['8929ee5f-5e6c-4326-965a-a261b71d74f5','93e8d101-b625-405c-83de-c3af3bc2527d',
                      '57e41335-f91f-42fe-a2e9-7f85dca6f46f','017b9fad-9708-4fca-b35f-abec08c916c0',
                      'fbec75bb-6e3f-4b90-b937-7522bde76917','32379181-f2c6-4ad9-92ca-aaed860f3e53',
                      '652dfff9-95b1-4bf6-b891-0fb43fb716d9'])::uuid as id
),
brugere as (
  -- INDSÆT de ni bruger-id'er fra skridt 1 (2b, slags = 'konto')
  select unnest(array['00000000-0000-0000-0000-000000000000'])::uuid as user_id
),
adresser as (
  -- INDSÆT adresserne fra 2b (konto, invitation, contact_email), lowercase
  select unnest(array['x@example.test']) as email
),
tc as (select table_name from information_schema.columns where table_schema = 'public' and column_name = 'company_id'),
tp as (select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and column_name in ('user_id','member_id','sender_id','forfatter_id','bruger_id','author_id','committed_by','manual_override_by','accepted_by')),
te as (select table_name, column_name from information_schema.columns
        where table_schema = 'public' and column_name in ('recipient_email','email')
          and table_name in ('email_send_log','email_send_log_legacy','email_unsubscribe_tokens','suppressed_emails','company_invitations')),
tal as (
  select tc.table_name as tabel, 'company_id' as noegle,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where company_id in (%s)', tc.table_name,
             (select string_agg(quote_literal(id::text), ',') from syv)), false, true, '')))[1]::text::int as antal
  from tc
  union all
  select tp.table_name, tp.column_name,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where %I in (%s)', tp.table_name, tp.column_name,
             (select string_agg(quote_literal(user_id::text), ',') from brugere)), false, true, '')))[1]::text::int
  from tp
  union all
  select te.table_name, te.column_name,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where lower(%I) in (%s)', te.table_name, te.column_name,
             (select string_agg(quote_literal(email), ',') from adresser)), false, true, '')))[1]::text::int
  from te
  union all
  select 'auth.users', 'id', (select count(*) from auth.users where id in (select user_id from brugere))
  union all
  select 'storage.objects', 'foldername[1]',
         (select count(*) from storage.objects o
           where (storage.foldername(o.name))[1] in (select id::text from syv) or (storage.foldername(o.name))[1] in (select user_id::text from brugere))
)
select tabel, noegle, antal
from tal
where antal > 0
order by tabel, noegle;
```

**Forventet: 0 linjer.** Hver linje der alligevel kommer, er en rest af
Alina-typen — en tabel der ikke stod i planen, eller en kolonne med et
andet navn. Kolonnenavne der IKKE tælles, fordi de er rådgiverens uid:
`besluttet_af`, `oprettet_af`, `proposed_by`, `decided_by`,
`generated_by`, `advisor_id`, `invited_by`, `created_by`, `updated_by`,
`actioned_by_advisor_id`. Skulle `query_to_xml` være spærret, er 2a med
`auth.users` og storage tilføjet den statiske reserve.

---

## 9. Bogføringen bagefter (uden for denne fil)

Husets form for en manuel prod-handling er en migrationsfil med kommentar
og FØR-værdier, kørt i hånden (`20260902113000_status_tidligere.sql:1-2`),
plus DEL 2 i OVERLEVERING som for Alina (:2176-2270). FØR-tallene fra 2a
og kontolisten fra 2b er det der skal ind — der findes ingen anden
rollback-reference. `docs/` er det andet vindues; dette dokument er kun
køreplanen.

---

## Rækkefølgen, kort

1. FØR-måling (2a, 2b, 2c) — gem alt.
2. Læs STOP-kriterierne (skridt 2).
3. Slet den ene fil i Storage (dashboard), kontrollér med SELECT.
4. Kør sletnings-scriptet (skridt 4) — én kørsel, ét resultatsæt.
5. EFTER-måling (2a igen + 2c + bilagskontrol).
6. Slet de ni konti — én af tre veje — SIDST.
7. Sidste sweep (skridt 7) med de ni id'er og adresserne som literaler. Forventet 0.
8. Bogfør.
