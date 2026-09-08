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
