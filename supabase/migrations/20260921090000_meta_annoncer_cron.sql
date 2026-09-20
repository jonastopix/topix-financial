-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- RÆKKEFØLGE — LÆS DEN: kør den FØR merge. Den er additiv (en nullable
-- kolonne, en tom tabel, en funktion, to cron-jobs), så den gamle function
-- tåler den. Omvendt tåler den NYE function ikke at mangle den: merge udruller
-- functionen straks, og dens upsert skriver url_tags og meta_hentning — mangler
-- de, fejler HELE kørslen. Cron-jobbet fyrer først 03:33 UTC, så et par timers
-- gammel function mod ny tabel er ufarligt. Mål kolonnen, før merge:
--   GET /rest/v1/meta_annonce?select=url_tags&limit=0 → 200 (reglen fra 20/9).
--
-- FIRE TING I ÉN FIL, så den kan køres alene (21/9-2026,
-- ~/Downloads/udkast-meta-cron/README.md):
--   1. meta_annonce.url_tags — Metas url-makroer pr. annonce, som de står
--      («utm_content={{ad.id}}» eller «{{ad.name}}»). Så det kan MÅLES, om
--      skiftet 20/9 greb på alle annoncer — uden at vente på en tilmelding.
--   2. meta_hentning — én statusrække pr. RIGTIG kørsel af meta-annoncer-cron:
--      udfald, fejl, vindue, hentet_til, tal. Tørkørsler skriver den ikke.
--   3. meta_hentning_vagt() — dømmer på statusrækkens ALDER og skriver
--      klokken (advisor_notifications, type 'drift' — vagtens form, ordret),
--      når kørslen er UDEBLEVET. Fejlede kørsler skriver functionen selv
--      klokken for; vagten gentager dem ikke.
--   4. To cron-jobs: 'meta-annoncer' (hentningen) og 'meta-hentning-vagt'.
--
-- HVORFOR 03:33 UTC (05:33 dansk sommertid, 04:33 vintertid):
--   · Metas døgn slutter i KONTOENS tidszone (functionen læser timezone_name
--     og skriver den i meta_hentning.tal — efterprøv den efter første kørsel).
--     Er kontoen Europe/Copenhagen, er «i går» lukket kl. 22:00 UTC; 03:33 er
--     5½ time senere. Metas insights «refresh every 15 minutes» og
--     efterjusteres i «a couple of days» — det klarer 7-dages-vinduet med
--     upsert, ikke et senere klokkeslæt.
--   · Minuttet :33 deler slot med ingen. Målt 21/9 mod alle cron.schedule i
--     migrationerne: minutterne i brug er 0, 5, 7, 10, 15, 20, 30 (+ hvert
--     5./15. minut). 05:00 UTC, som functionens gamle kommentar foreslog, har
--     agent-runs-opbevaring.
--   · Før nogen rådgiver er oppe, og en time før vagten (04:33), så en
--     udebleven kørsel bliver til en klokke samme morgen. Vagtens grænse er
--     2 TIMER (Jonas 21/9): «en falsk alarm koster en klokke; en overset
--     stilstand koster dage, der ikke kan hentes». Én udebleven kørsel = rød.
--     «Ingen dagstal» dømmes først efter 7 dage — ved en pause i annoncerne
--     ville 3 dage være støj.
--
-- HVIS timezone_name IKKE ER Europe/Copenhagen (måles ved første kørsel,
-- konto.tidszone i svaret / meta_hentning.tal.tidszone): Metas «i går»
-- slutter kl. 00:00 i DEN zone. Flyt cron-slottet til mindst 3 timer efter
-- det i UTC (America/Los_Angeles: døgnet slutter 07:00 UTC → '33 10 * * *' og
-- vagten '33 11'), og ret hentningens datoregning: `vindue(nu, 7)` i
-- _shared/metaAnnoncer.ts bruger UTC-datoer (isoDato) — med en amerikansk
-- konto er «i går» i UTC ikke Metas i går, og until-datoen skal regnes i
-- kontoens zone. Det er en kodeændring + ny migration, ikke en SQL-rettelse.
--
-- HVAD EN KØRSEL KOSTER (regnet 21/9 på 11 annoncer): 7 dage = ét stykke
-- (CHUNK_DAGE 31) → 1 konto-kald + 1 annonce-side + 1 insights-side
-- (11 × 7 = 77 rækker af 500) = 3 GET, 88 upserts, få sekunder. Timeout
-- 60 s er rigeligt og < interval (kald_edge kræver det).
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi
--     from information_schema.columns where table_schema='public' and table_name='meta_annonce' and column_name='url_tags'
--   union all
--   select '2 tabel', table_name, 'findes' from information_schema.tables where table_schema='public' and table_name='meta_hentning'
--   union all
--   select '3 funktion', p.proname, 'findes' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='meta_hentning_vagt'
--   union all
--   select '4 cron', jobname, schedule from cron.job where jobname in ('meta-annoncer','meta-hentning-vagt')
--   order by 1,2;
--   FACIT FØR: alle fire sektioner TOMME.
-- EFTER-SQL: samme. FACIT EFTER: 1 = url_tags text · 2 = meta_hentning ·
--   3 = meta_hentning_vagt · 4 = to rækker: '33 3 * * *' og '33 4 * * *'.
--   Og kolonnen målt udefra: GET /rest/v1/meta_annonce?select=url_tags&limit=0 → 200.
--
-- FØRSTE KØRSEL (samme dag, i hånden, EFTER function-udrulning er set i «View code»):
--   SELECT public.kald_edge('meta-annoncer-cron');                            -- tørkørsel
--   SELECT status_code, left(content::text, 600) FROM net._http_response ORDER BY id DESC LIMIT 1;
--   -- konto.tidszone står i svaret; annoncer.hentet = 11.
--   SELECT public.kald_edge('meta-annoncer-cron', '{"dry_run": false}'::jsonb, 60000);
--   SELECT * FROM public.meta_hentning;                                       -- én række, udfald 'ok'
--   SELECT ad_id, navn, url_tags FROM public.meta_annonce ORDER BY navn;      -- B's måling
--   SELECT public.meta_hentning_vagt();                                       -- 'groen'
--
-- ROLLBACK:
--   SELECT cron.unschedule('meta-annoncer'); SELECT cron.unschedule('meta-hentning-vagt');
--   DROP FUNCTION IF EXISTS public.meta_hentning_vagt();
--   DROP TABLE IF EXISTS public.meta_hentning;
--   ALTER TABLE public.meta_annonce DROP COLUMN IF EXISTS url_tags;
--   (og functionen rulles tilbage, ellers fejler dens upsert på url_tags)

-- ── 1. url_tags ─────────────────────────────────────────────────────────────
alter table public.meta_annonce add column if not exists url_tags text;
comment on column public.meta_annonce.url_tags is
  'Metas url_tags på kreativet, som de står (21/9) — «utm_content={{ad.id}}» er den rigtige konvention (20/9), «{{ad.name}}» den gamle. null = Meta gav ikke feltet. Målingen: select navn, url_tags from meta_annonce.';

-- ── 2. Statusrækken ─────────────────────────────────────────────────────────
create table if not exists public.meta_hentning (
  art             text primary key check (art in ('annoncer')),
  sidste_koersel  timestamptz not null,
  -- ok · fejl · secret_mangler. Tørkørsler skriver ikke rækken.
  sidste_udfald   text not null check (sidste_udfald in ('ok', 'fejl', 'secret_mangler')),
  sidste_fejl     text,
  vindue_fra      date,
  vindue_til      date,
  -- Nyeste dato, der FAKTISK fik en dagsrække — ikke vinduets kant.
  hentet_til      date,
  -- Kørslens tal (annoncer, dage, dubletter, sider, stykker, tidszone) — til den, der læser bagud.
  tal             jsonb not null default '{}'::jsonb
);
comment on table public.meta_hentning is
  'Én statusrække pr. art for meta-annoncer-cron (21/9): overskrives af hver RIGTIG kørsel (dry_run=false). meta_hentning_vagt() dømmer på dens alder. Rådgivere læser; kun service_role skriver.';

alter table public.meta_hentning enable row level security;

drop policy if exists "Advisors can view meta hentning" on public.meta_hentning;
create policy "Advisors can view meta hentning"
  on public.meta_hentning for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage meta hentning" on public.meta_hentning;
create policy "Service role can manage meta hentning"
  on public.meta_hentning for all to service_role
  using (true) with check (true);

-- ── 3. Vagten for udeblevne kørsler ─────────────────────────────────────────
-- IKKE SECURITY DEFINER: den kaldes kun af pg_cron (som postgres), og den
-- rører ingen vault. Klokke-blokken er vagt_cron's, ordret: én besked pr.
-- rådgiver pr. titel pr. døgn, company_id NULL (en driftsbesked handler ikke
-- om en virksomhed), reference_type 'meta_hentning'.
create or replace function public.meta_hentning_vagt()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_row      public.meta_hentning%rowtype;
  v_titel    text := null;
  v_body     text := null;
  v_r        record;
  v_skrevet  integer := 0;
begin
  select * into v_row from public.meta_hentning where art = 'annoncer';

  if not found then
    v_titel := 'Meta-hentningen har aldrig kørt — forbruget pr. annonce hentes ikke';
    v_body  := 'meta_hentning er tom: cron-jobbet meta-annoncer (03:33 UTC) har ikke efterladt en statusrække. '
            || 'Kør SELECT public.kald_edge(''meta-annoncer-cron'') i hånden (tørkørsel) og læs svaret i net._http_response.';
  elsif v_row.sidste_koersel < now() - interval '2 hours' then
    v_titel := 'Meta-hentningen er ikke kørt siden '
            || to_char(v_row.sidste_koersel at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI')
            || ' — forbruget pr. annonce står stille';
    v_body  := 'Ingen statusrække fra i nat (jobbet kører 03:33 UTC, vagten læser 04:33). Er jobbet aktivt (select * from cron.job where jobname = ''meta-annoncer'')? '
            || 'Svarer kald_edge (vault-nøglen)? Sidste udfald: ' || v_row.sidste_udfald
            || coalesce(' — ' || v_row.sidste_fejl, '') || '.';
  elsif v_row.sidste_udfald = 'ok' and (v_row.hentet_til is null or v_row.hentet_til < current_date - 7) then
    -- Kørslen lykkes, men ingen dagsrække de sidste syv dage: enten kører
    -- intet hos Meta (pause), eller Meta svarer tomt. Begge dele skal ses.
    v_titel := 'Meta-hentningen kører, men har ingen dagstal siden '
            || coalesce(to_char(v_row.hentet_til, 'DD/MM'), 'aldrig')
            || ' — kører der annoncer?';
    v_body  := 'Sidste kørsel ' || to_char(v_row.sidste_koersel at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI')
            || ' var ok, vindue ' || coalesce(v_row.vindue_fra::text, '?') || ' → ' || coalesce(v_row.vindue_til::text, '?')
            || ', men nyeste dagsrække er ' || coalesce(v_row.hentet_til::text, 'ingen')
            || '. Er alle annoncer på pause, er det ventet. Ellers: kør tørkørslen og læs stykker[].raekker.';
  end if;
  -- sidste_udfald 'fejl'/'secret_mangler': functionen skrev selv klokken i
  -- samme sekund. Vagten gentager den ikke — én fejl, én klokke.

  if v_titel is null then
    return 'groen';
  end if;

  for v_r in
    select distinct ur.user_id from public.user_roles ur
    where ur.role in ('advisor'::app_role, 'admin'::app_role)
  loop
    if not exists (
      select 1 from public.advisor_notifications a
      where a.advisor_id = v_r.user_id and a.type = 'drift' and a.title = v_titel
        and a.read_at is null and a.created_at > now() - interval '24 hours'
    ) then
      insert into public.advisor_notifications (type, title, body, company_id, member_id, advisor_id, reference_type, reference_id)
      values ('drift', v_titel, v_body, null, v_r.user_id, v_r.user_id, 'meta_hentning', null);
      v_skrevet := v_skrevet + 1;
    end if;
  end loop;

  return 'roed: ' || v_titel || ' (' || v_skrevet || ' klokker skrevet)';
end;
$$;

revoke all on function public.meta_hentning_vagt() from public, anon, authenticated;
comment on function public.meta_hentning_vagt() is
  'Dømmer meta_hentning (21/9): ingen række, ældre end 2 t (dvs. ikke kørt i nat), eller ok uden dagstal i 7 dage → klokke type drift til hver rådgiver (dedup: samme titel, ulæst, < 24 t). Fejlede kørsler skriver functionen selv klokken for. Kaldes af cron meta-hentning-vagt 04:33 UTC.';

-- ── 4. Cron-jobbene ─────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'meta-annoncer') then
    perform cron.unschedule('meta-annoncer');
  end if;
  if exists (select 1 from cron.job where jobname = 'meta-hentning-vagt') then
    perform cron.unschedule('meta-hentning-vagt');
  end if;
end $$;

select cron.schedule(
  'meta-annoncer',
  '33 3 * * *',
  $job$ SELECT public.kald_edge('meta-annoncer-cron', '{"dry_run": false}'::jsonb, 60000, 86400000) $job$
);

select cron.schedule(
  'meta-hentning-vagt',
  '33 4 * * *',
  $job$ SELECT public.meta_hentning_vagt() $job$
);

-- EFTER-tjek (kør og gem CSV):
select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi
  from information_schema.columns where table_schema='public' and table_name='meta_annonce' and column_name='url_tags'
union all
select '2 tabel', table_name, 'findes' from information_schema.tables where table_schema='public' and table_name='meta_hentning'
union all
select '3 funktion', p.proname, 'findes' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='meta_hentning_vagt'
union all
select '4 cron', jobname, schedule from cron.job where jobname in ('meta-annoncer','meta-hentning-vagt')
order by 1,2;
