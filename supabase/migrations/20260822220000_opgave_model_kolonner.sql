-- Opgave-model, fase 1, spor 1: additive kolonner paa company_actions.
-- Design: docs/opgave-model-design.md (beslutning B1-B9, 2026-08-22).
-- Kortlaegning: docs/opgave-model-kortlaegning.md
--
-- Dette greb roerer INGEN data. Statussaettet er et overgangssaet der
-- tillader baade gamle og nye vaerdier, saa de 70 eksisterende raekker
-- med status='open' ikke afvises. Datamigreringen (open -> proposed) og
-- opstramningen af CHECK er sit eget spor med SELECT-foerst og
-- foer/efter-taellinger.
--
-- Koert manuelt i Lovable SQL editor 2026-08-22 22:58. Verificeret ved
-- pg_constraint-udtraek: alle ni constraints bekraeftet.

alter table public.company_actions
  add column if not exists due_date date,
  add column if not exists accepted_at timestamptz,
  add column if not exists deferral_count integer not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists proposed_by uuid references auth.users(id) on delete set null;

-- source_type udvides med agent, advisor og reflection.
-- 'agent' lukker samtidig fejlen i run-company-agent/index.ts:736-756,
-- som skrev en vaerdi uden for constrainten (docs/opgave-model-design.md 6.2).
alter table public.company_actions
  drop constraint if exists company_actions_source_type_check;
alter table public.company_actions
  add constraint company_actions_source_type_check
  check (source_type = any (array['ai_weekly','milestone','handout','manual','agent','advisor','reflection']));

-- Overgangssaet: nye vaerdier + de gamle. 'open' og 'parked' fjernes
-- i spor 2 efter datamigreringen.
alter table public.company_actions
  drop constraint if exists company_actions_status_check;
alter table public.company_actions
  add constraint company_actions_status_check
  check (status = any (array['proposed','active','done','not_done','dropped','dismissed','expired','open','parked']));

-- B3 haandhaevet i databasen: en aktiv opgave skal have en dato.
alter table public.company_actions
  drop constraint if exists company_actions_active_requires_due_date;
alter table public.company_actions
  add constraint company_actions_active_requires_due_date
  check (status <> 'active' or due_date is not null);

alter table public.company_actions
  drop constraint if exists company_actions_deferral_count_nonneg;
alter table public.company_actions
  add constraint company_actions_deferral_count_nonneg
  check (deferral_count >= 0);

-- Partielle indeks til de to kommende cron-job: udloeb af forslag (B8)
-- og forfald af aktive opgaver (B2).
create index if not exists idx_company_actions_expiry
  on public.company_actions (expires_at) where status = 'proposed';
create index if not exists idx_company_actions_due
  on public.company_actions (due_date) where status = 'active';

comment on column public.company_actions.due_date is 'B3/B6: forfaldsdato, sat af medlemmet ved accept. Paakraevet naar status = active.';
comment on column public.company_actions.accepted_at is 'B1: hvornaar medlemmet forpligtede sig. Maales for accept-rate jf. B6.';
comment on column public.company_actions.deferral_count is 'B7: antal udskydelser. Tredje lukker opgaven.';
comment on column public.company_actions.expires_at is 'B8: hvornaar et ubesvaret forslag forsvinder fra medlemmets liste.';
comment on column public.company_actions.closed_at is 'Naar opgaven naaede en sluttilstand, uanset hvilken.';
comment on column public.company_actions.proposed_by is 'Hvem foreslog. NULL = system eller AI. Ellers raadgiverens user_id.';
