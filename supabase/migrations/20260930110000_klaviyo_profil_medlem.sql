-- KØRT i prod — 30/9-2026 kl. 16:00 dansk tid (Jonas, Lovable SQL editor), FØR merget af #1170 og FØR deploy af klaviyo-profil-cron. EFTER (16:00): seks kolonner (tb_medlem boolean, tb_medlem_skrevet_at, medlem_forsoegt_at, medlem_udfald, medlem_status, medlem_grund) · klaviyo_profil_medlem_udfald_check · 350 rækker i klaviyo_profil · låsen klaviyo_medlem_aktiv = false.
--
-- MEDLEMSFELTET tb_medlem PÅ KLAVIYO-PROFILEN (30/9-2026, recon-klaviyo-medlemmer.md §4;
-- Jonas 30/9 07:22). klaviyo-profil-cron skriver nu ét felt mere på profilen:
--   tb_medlem = true   bruger eller kontaktmail i en virksomhed med aktiv kontrakt eller
--                      aktivt abonnement (computeMembershipTier «full»/«subscriber»),
--                      IKKE legat (companies.is_legat), IKKE gæst (companies.vis_i_netvaerk = false)
--   tb_medlem = false  KUN for en mail, vi før har skrevet true (ophørt medlem)
-- Klaviyos segment «Medlemmer (auto)» dannes på tb_medlem = true og erstatter listen Xr6Pm9.
--
-- KUN TILFØJENDE: seks nullable kolonner i klaviyo_profil + én CHECK på den nye kolonne
-- + én app_config-række (låsen klaviyo_medlem_aktiv = false, ON CONFLICT DO NOTHING).
-- Webinarkolonnerne, NOT NULL på udfald/forsoegt_at og politikkerne røres IKKE.
--   tb_medlem             det, platformen sidst SKREV med udfald ok (null = aldrig skrevet)
--   tb_medlem_skrevet_at  hvornår det lykkedes
--   medlem_forsoegt_at    sidste medlemsforsøg, uanset udfald
--   medlem_udfald         klaviyo.ts' udfald (samme liste som udfald-CHECK'en)
--   medlem_status         Klaviyos HTTP-status
--   medlem_grund          vores forklaring ved fejl
--
-- LÅSEN app_config.klaviyo_medlem_aktiv (det tekniske råd 30/9, «RET FØRST» fund 1): job 571
-- kører ALLEREDE {"dry_run": false} hvert :17. Uden en lås ville første timekørsel efter
-- udrulningen skrive tb_medlem på alle medlemsmails, umålt. Denne migration indsætter derfor
-- nøglen = false (ON CONFLICT DO NOTHING — en allerede sat lås overskrives aldrig). Medlems-
-- passet skriver KUN for alvor, når dry_run = false OG (låsen = true ELLER prøven til én
-- adresse, {"dry_run": false, "email": …}) — samme form som webinar_mail_aktiv. Webinarpasset
-- (tb_naeste_webinar) er i drift og står IKKE bag låsen. Svaret viser medlem.laas_aktiv,
-- medlem.sender_rigtigt og medlem.holdt_af_laas.
--
-- RÆKKEFØLGEN — ét skridt ad gangen (CLAUDE.md «Nye migrations» + «Deployment af edge functions»):
--   1. Merge.
--   2. KØR denne migration i Lovable → SQL editor (FØR-SQL herunder først; gem CSV).
--   3. MÅL kolonnen udefra:
--        GET /rest/v1/klaviyo_profil?select=tb_medlem&limit=0  (anon-nøglen) → 200  (42703 = mangler)
--      og låsen: sektion 4 i EFTER-SQL = klaviyo_medlem_aktiv | false.
--   4. FØRST DA eksplicit deploy af klaviyo-profil-cron fra build-chat (bed den KØRE værktøjet og
--      vise resultatet). Uden kolonnerne fejler medlemspassets læsning (42703) — isoleret
--      (medlem.fejl + alarm), webinarpasset kører.
--   5. TØRKØRSEL: SELECT public.kald_edge('klaviyo-profil-cron'); svaret i net._http_response.
--      Beviset for udrulningen er feltet medlem.laas_aktiv (kun den nye kode svarer det) = false.
--      LÆS medlem.saet_true = antallet af profiler, der OPRETTES eller opdateres hos Klaviyo
--      (/profile-import/ opretter en profil, der ikke findes — Klaviyo kan tælle nye profiler i
--      betalingen). Forventet: saet_true = medlemsmails, saet_false 0, ukendt_udeladt 0, fejl [];
--      virksomheder.egen ≥ 1 (Topix.dk ApS). Timekørslerne indtil trin 7 viser holdt_af_laas =
--      saet_true + saet_false og skrevet 0 — det er låsen, der virker.
--   6. ÉN PRØVE: kald_edge med body {"dry_run": false, "email": "lh@greensolar.dk"} → medlem.
--      sender_rigtigt true, medlem.lykkedes 1; læs profilen i Klaviyo: tb_medlem = true (boolean).
--   7. Jonas slår låsen til med ÉN guarded UPDATE (rammer nul rækker, hvis den allerede er sat):
--        UPDATE public.app_config SET config_value = 'true'::jsonb, updated_at = now()
--         WHERE config_key = 'klaviyo_medlem_aktiv' AND config_value = 'false'::jsonb;
--      Forventet: UPDATE 1. Slukkes igen med samme form, 'true' ↔ 'false' byttet om.
--      Næste timekørsel (:17) skriver resten; timen efter: saet_true 0.
--   Cron-jobbet (job 571, «17 * * * *») ændres IKKE — samme function, samme plan.
--   ALARMEN deles med webinarpasset: én mail pr. dansk kalenderdøgn for HELE kørslen
--   (profilAlarmNoegle bærer kun datoen) — har webinarpasset alarmeret i dag, går en
--   medlemsfejl samme døgn ikke i en ny mail (kun i klokken og svaret).
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
--   union all
--   select '4 laas', config_key, config_value::text from public.app_config
--     where config_key = 'klaviyo_medlem_aktiv'
--   order by 1,2;
--   FACIT FØR: sektion 1, 2 og 4 TOMME; sektion 3 = antallet i dag (skriv det ned).
-- EFTER-SQL: samme (sidste statement). FACIT EFTER: sektion 1 = 6 kolonner (boolean,
--   timestamp with time zone ×2, text ×2, integer); sektion 2 = 1 CHECK; sektion 3 UÆNDRET;
--   sektion 4 = klaviyo_medlem_aktiv | false.
--
-- ROLLBACK:
--   alter table public.klaviyo_profil
--     drop constraint if exists klaviyo_profil_medlem_udfald_check,
--     drop column if exists tb_medlem, drop column if exists tb_medlem_skrevet_at,
--     drop column if exists medlem_forsoegt_at, drop column if exists medlem_udfald,
--     drop column if exists medlem_status, drop column if exists medlem_grund;
--   delete from public.app_config where config_key = 'klaviyo_medlem_aktiv';

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

-- LÅSEN: standard FALSE (se filhovedet). Sættes aldrig til true her.
insert into public.app_config (config_key, config_value, description)
values ('klaviyo_medlem_aktiv', 'false'::jsonb, 'Klaviyo tb_medlem: skriver klaviyo-profil-cron medlemsfeltet for alvor? false = medlemspasset skriver kun prøven til én adresse (standard). true sættes med én guarded UPDATE, når tørkørslen og prøven til lh@greensolar.dk er læst (30/9-2026). Webinarpasset er ikke bag låsen.')
on conflict (config_key) do nothing;

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
union all
select '4 laas', config_key, config_value::text from public.app_config
  where config_key = 'klaviyo_medlem_aktiv'
order by 1,2;
