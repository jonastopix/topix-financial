-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
--
-- CVR-DAGSLOFTET IND I app_config (19/9-2026, recon-boelgen-2 §3).
--
-- FUNDET: CVR-opslaget sker på ansøgningsformularens FØRSTE skærm, og
-- mailadressen kommer først på den sjette. Dagsloftet på 20 opslag tælles
-- altså i dem der STARTER, ikke i dem der sender — og med 597 tilmeldte til
-- ét webinar er 20 ikke mange. Loftet skal kunne hæves midt i en bølge,
-- uden en udrulning og uden at redigere secrets.
--
-- HERFRA LÆSES DET: _shared/cvrLoft.ts:vaelgLoft, kaldt af ansoegning-cvr ved
-- hvert opslag. Rækkefølgen er app_config → secret ANSOEGNING_CVR_DAGSLOFT →
-- DAGSLOFT_STANDARD (20). En ubrugelig værdi (tekst, nul, negativ, over 5000)
-- springes over med en log; den slukker ALDRIG loftet. Den gamle kode var
-- `Number(env ?? "20")`, og `brugt >= NaN` er altid falsk — en tastefejl i
-- secret'en ville have åbnet kvoten helt.
--
-- VÆRDIEN er et JSON-TAL, ikke en streng: `to_jsonb(20)` giver `20`.
-- vaelgLoft tager også `"20"` og `{"vaerdi": 20}`, men tallet er det rene.
--
-- SÅDAN HÆVES DET (den ene linje, der er hele pointen):
--   update public.app_config set config_value = to_jsonb(40)
--     where config_key = 'ansoegning_cvr_dagsloft';
-- Virker med det samme — functionen læser nøglen ved hvert opslag.
--
-- INGEN NY TABEL, INGEN NY POLITIK. app_config findes, og dens RLS er
-- admin-only (SECURITY_BASELINE §«Admin-only»). Rådgivere kan ikke ændre
-- loftet; service role (functionen) læser det. Derfor rører denne migration
-- hverken RLS eller politikker — kun én række.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select 'raekke' as sektion, config_key as noegle, config_value::text as vaerdi
--     from public.app_config where config_key = 'ansoegning_cvr_dagsloft'
--   union all
--   select 'opslag i dag', 'cvr_opslag_cache', count(*)::text from public.cvr_opslag_cache
--     where slaaet_op_at >= date_trunc('day', now() at time zone 'UTC')
--   union all
--   select 'tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion «raekke» er TOM (nøglen findes ikke endnu).
--
-- EFTER-SQL: samme. FACIT EFTER: sektion «raekke» = 1 række med værdien 20.
--
-- ROLLBACK:
--   delete from public.app_config where config_key = 'ansoegning_cvr_dagsloft';
--   (Koden falder da tilbage på secret'en, og derefter på 20 — intet går i stykker.)

insert into public.app_config (config_key, config_value, description)
values (
  'ansoegning_cvr_dagsloft',
  to_jsonb(20),
  'Rigtige CVR-opslag (cache-misses) pr. dag fra ansøgningsformularen. Læses af ansoegning-cvr ved hvert opslag gennem _shared/cvrLoft.ts. Rækkefølge: denne række → secret ANSOEGNING_CVR_DAGSLOFT → koden (20). Rådgiverne får én klokke ved 80 % og én når loftet er ramt. Hæv med: update public.app_config set config_value = to_jsonb(40) where config_key = ''ansoegning_cvr_dagsloft'';'
)
on conflict (config_key) do nothing;

-- EFTER-tjek (kør og gem CSV):
select 'raekke' as sektion, config_key as noegle, config_value::text as vaerdi
  from public.app_config where config_key = 'ansoegning_cvr_dagsloft'
union all
select 'opslag i dag', 'cvr_opslag_cache', count(*)::text from public.cvr_opslag_cache
  where slaaet_op_at >= date_trunc('day', now() at time zone 'UTC')
union all
select 'tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
order by 1, 2;
