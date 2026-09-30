-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- MEDLEMSFELTET tb_medlem PÅ KLAVIYO-PROFILEN (30/9-2026, recon-klaviyo-medlemmer.md §4;
-- Jonas 30/9 07:22). klaviyo-profil-cron skriver nu ét felt mere på profilen:
--   tb_medlem = true   bruger eller kontaktmail i en virksomhed med aktiv kontrakt eller
--                      aktivt abonnement (computeMembershipTier «full»/«subscriber»),
--                      IKKE legat (companies.is_legat), IKKE gæst (companies.vis_i_netvaerk = false)
--   tb_medlem = false  KUN for en mail, vi før har skrevet true (ophørt medlem)
-- Klaviyos segment «Medlemmer (auto)» dannes på tb_medlem = true og erstatter listen Xr6Pm9.
--
-- KUN TILFØJENDE: seks nullable kolonner i klaviyo_profil + én CHECK på den nye kolonne.
-- Webinarkolonnerne, NOT NULL på udfald/forsoegt_at og politikkerne røres IKKE.
--   tb_medlem             det, platformen sidst SKREV med udfald ok (null = aldrig skrevet)
--   tb_medlem_skrevet_at  hvornår det lykkedes
--   medlem_forsoegt_at    sidste medlemsforsøg, uanset udfald
--   medlem_udfald         klaviyo.ts' udfald (samme liste som udfald-CHECK'en)
--   medlem_status         Klaviyos HTTP-status
--   medlem_grund          vores forklaring ved fejl
--
-- RÆKKEFØLGEN (CLAUDE.md «Nye migrations» + «Deployment af edge functions»):
--   1. merge
--   2. DENNE migration i SQL editor, og MÅL kolonnen udefra:
--        GET /rest/v1/klaviyo_profil?select=tb_medlem&limit=0  (anon-nøglen) → 200  (42703 = mangler)
--   3. FØRST DA eksplicit deploy af klaviyo-profil-cron fra build-chat. Uden kolonnerne fejler
--      medlemspassets læsning (42703) — det er isoleret (medlem.fejl + alarm), webinarpasset kører.
--   Cron-jobbet (job 571, «17 * * * *») ændres IKKE — samme function, samme plan.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonner' as sektion, column_name as noegle, data_type as vaerdi
--     from information_schema.columns
--     where table_schema='public' and table_name='klaviyo_profil'
--       and column_name in ('tb_medlem','tb_medlem_skrevet_at','medlem_forsoegt_at','medlem_udfald','medlem_status','medlem_grund')
--   union all
--   select '2 check', conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.klaviyo_profil'::regclass and conname = 'klaviyo_profil_medlem_udfald_check'
--   union all
--   select '3 raekker', 'antal', count(*)::text from public.klaviyo_profil
--   order by 1,2;
--   FACIT FØR: sektion 1 og 2 TOMME; sektion 3 = antallet i dag (skriv det ned).
-- EFTER-SQL: samme (sidste statement). FACIT EFTER: sektion 1 = 6 kolonner (boolean,
--   timestamp with time zone ×2, text ×2, integer); sektion 2 = 1 CHECK; sektion 3 UÆNDRET.
--
-- ROLLBACK:
--   alter table public.klaviyo_profil
--     drop constraint if exists klaviyo_profil_medlem_udfald_check,
--     drop column if exists tb_medlem, drop column if exists tb_medlem_skrevet_at,
--     drop column if exists medlem_forsoegt_at, drop column if exists medlem_udfald,
--     drop column if exists medlem_status, drop column if exists medlem_grund;

alter table public.klaviyo_profil
  add column if not exists tb_medlem            boolean,
  add column if not exists tb_medlem_skrevet_at timestamptz,
  add column if not exists medlem_forsoegt_at   timestamptz,
  add column if not exists medlem_udfald        text,
  add column if not exists medlem_status        integer,
  add column if not exists medlem_grund         text;

alter table public.klaviyo_profil
  drop constraint if exists klaviyo_profil_medlem_udfald_check;
alter table public.klaviyo_profil
  add constraint klaviyo_profil_medlem_udfald_check
  check (medlem_udfald is null or medlem_udfald in ('ok', 'ingen_noegle', 'noegle_afvist', 'loft', 'ugyldig', 'fejl', 'timeout'));

-- Medlemmerne, platformen har markeret — segmentets modstykke hos os.
create index if not exists klaviyo_profil_medlem_idx on public.klaviyo_profil (tb_medlem) where tb_medlem is not null;

comment on column public.klaviyo_profil.tb_medlem is
  'Det, klaviyo-profil-cron sidst skrev i profilfeltet tb_medlem med udfald ok (30/9-2026): true = medlem (aktiv kontrakt/abonnement, ikke legat, ikke gæst), false = tidligere medlem, null = aldrig skrevet. Dommen: _shared/klaviyoMedlem.ts.';
comment on column public.klaviyo_profil.medlem_udfald is
  'Udfaldet af sidste medlemsforsøg (klaviyo.ts). Webinarets udfald står i udfald; en række, medlemspasset opretter, bærer medlemsforsøget i begge.';

-- EFTER-tjek (kør og gem CSV):
select '1 kolonner' as sektion, column_name as noegle, data_type as vaerdi
  from information_schema.columns
  where table_schema='public' and table_name='klaviyo_profil'
    and column_name in ('tb_medlem','tb_medlem_skrevet_at','medlem_forsoegt_at','medlem_udfald','medlem_status','medlem_grund')
union all
select '2 check', conname, pg_get_constraintdef(oid) from pg_constraint
  where conrelid = 'public.klaviyo_profil'::regclass and conname = 'klaviyo_profil_medlem_udfald_check'
union all
select '3 raekker', 'antal', count(*)::text from public.klaviyo_profil
order by 1,2;
