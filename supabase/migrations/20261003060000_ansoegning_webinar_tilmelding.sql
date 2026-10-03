-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- OG EFTER 20261003010000_webinarmotor_skive1.sql — filen STOPPER selv (raise exception),
-- hvis skive 1 ikke er kørt. FØR ansoegning-gem udrulles.
--
-- WEBINARMOTOREN, SKIVE 4 — ANSØGNINGEN KOBLES TIL TILMELDINGEN PÅ ID (3/10-2026;
-- spec §A9, docs/webinarmotor.md §7.8). ansoegning-gem «opret» tager deltagertokenet
-- fra exitrummets knap (webinar_token), verificerer det med verifyDeltagertoken og
-- skriver tilmeldingens id i ansoegninger.webinar_tilmelding_id (EGEN fail-soft update,
-- _shared/ansoegningWebinarKobling.ts). Tokenet gemmes ALDRIG — kun id'et.
--
-- MÅLT I KODEN FØR DENNE FIL (IKKE i prod):
--   * Kolonnen og indekset er ALLEREDE skrevet i 20261003010000_webinarmotor_skive1.sql
--     §5 («skive 4 skriver den»): `add column if not exists webinar_tilmelding_id uuid
--     references public.webinar_tilmeldinger(id) on delete set null` + det delvise indeks
--     ansoegninger_webinar_tilmelding_idx. Denne fil gentager dem IDEMPOTENT med de SAMME
--     navne — efter skive 1 er de to linjer no-ops (Postgres springer «if not exists» over
--     med en NOTICE), og det eneste nye er kommentaren på kolonnen.
--   * FK'en kræver kun webinar_tilmeldinger (findes i prod siden 20260919130000; id uuid
--     primary key). MEN koblingen virker først efter skive 1: verifyDeltagertoken læser
--     kilde_system og token_version (skive 1's kolonner) og svarer ellers «opslag» →
--     «fejl». Derfor kræver filen skive 1 og stopper uden den (trin 0) — så rækkefølgen
--     aldrig kan byttes om i stilhed.
--   * RLS på ansoegninger (20260918200000 §6): «Advisors can read» (SELECT), «Advisors
--     can update» (UPDATE, has_role advisor) og «Service role can manage» (ALL). INGEN
--     anon-politik og INGEN medlemspolitik → kolonnen kan ikke skrives af anon eller et
--     medlem gennem RLS. Rådgivere kan (som alle kolonner på rækken) — uændret, ingen
--     politik røres her.
--
-- KUN TILFØJENDE: ingen DROP, ingen ændret kolonne, ingen politik, ingen række.
--
-- FØR-SQL (ét resultatsæt — kør og gem CSV):
--   select '1 kolonne' as sektion, column_name as noegle, concat(data_type, ' | null=', is_nullable) as vaerdi
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'ansoegninger' and column_name = 'webinar_tilmelding_id'
--   union all
--   select '2 fk', conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.ansoegninger'::regclass and contype = 'f'
--      and pg_get_constraintdef(oid) like '%webinar_tilmeldinger%'
--   union all
--   select '3 indeks', indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename = 'ansoegninger' and indexname = 'ansoegninger_webinar_tilmelding_idx'
--   union all
--   select '4 skive1', column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'webinar_tilmeldinger' and column_name in ('kilde_system', 'token_version')
--   union all
--   select '5 politikker', policyname, concat(cmd, ' | ', roles::text) from pg_policies
--    where schemaname = 'public' and tablename = 'ansoegninger'
--   union all
--   select '6 koblede', 'antal', count(*)::text from public.ansoegninger where webinar_tilmelding_id is not null
--   order by 1, 2;
--   (Sektion 6 fejler med 42703, hvis skive 1 ikke er kørt — så STOP og kør skive 1 først.)
--   FACIT FØR (efter skive 1): 1 = «uuid | null=YES»; 2 = én FK «… REFERENCES
--   webinar_tilmeldinger(id) ON DELETE SET NULL»; 3 = indekset «… WHERE (webinar_tilmelding_id
--   IS NOT NULL)»; 4 = kilde_system + token_version; 5 = de tre politikker ovenfor (notér,
--   de må ikke ændre sig); 6 = 0.
--
-- EFTER-SQL: SAMME select som FØR, plus
--   union all
--   select '7 kommentar', 'webinar_tilmelding_id',
--          coalesce(col_description('public.ansoegninger'::regclass,
--            (select attnum from pg_attribute where attrelid = 'public.ansoegninger'::regclass
--               and attname = 'webinar_tilmelding_id')), '(ingen)')
--   FACIT EFTER: sektion 1–6 som FØR (uændret), sektion 7 = kommentaren nedenfor.
--   Målingen bagefter (anon-nøglen fra den udrullede bundle):
--   GET /rest/v1/ansoegninger?select=webinar_tilmelding_id&limit=0 → 200 (42703 = mangler;
--   RLS afgør ikke, om kolonnen findes — anon ser 0 rækker).
--
-- ROLLBACK: kommentaren alene kan fjernes —
--   comment on column public.ansoegninger.webinar_tilmelding_id is null;
--   Kolonnen og indekset tilhører skive 1 og rulles tilbage DÉR (dens filhoved), aldrig her.

begin;

-- ── 0. Skive 1 skal være kørt ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'webinar_tilmeldinger' and column_name = 'token_version'
  ) then
    raise exception 'webinar_tilmeldinger.token_version mangler — kør 20261003010000_webinarmotor_skive1.sql først';
  end if;
end
$$;

-- ── 1. Kolonnen (no-op efter skive 1 — samme definition) ─────────────────────
alter table public.ansoegninger
  add column if not exists webinar_tilmelding_id uuid references public.webinar_tilmeldinger(id) on delete set null;

-- ── 2. Indekset (no-op efter skive 1 — samme navn) ───────────────────────────
create index if not exists ansoegninger_webinar_tilmelding_idx
  on public.ansoegninger (webinar_tilmelding_id) where webinar_tilmelding_id is not null;

-- ── 3. Kommentaren ───────────────────────────────────────────────────────────
comment on column public.ansoegninger.webinar_tilmelding_id is
  'Skive 4 (3/10-2026): tilmeldingen, ansøgningen kom fra — skrevet KUN af ansoegning-gem «opret» efter verifyDeltagertoken (deltagertokenet fra exitrummets #wt=). Tokenet gemmes aldrig. NULL = ingen kobling (ingen/ugyldig token, eller fra før skive 4) — mailkoblingen er reserven. Læses endnu ikke af tragten (docs/webinarmotor.md §7.8).';

commit;
