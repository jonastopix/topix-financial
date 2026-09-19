-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge, FØR
-- meta-annoncer-cron udrulles (uden tabellerne fejler skrivningen på en
-- ukendt relation).
--
-- METAS ANNONCER OG FORBRUG — GRUNDLAGET (recon-meta-annoncer §7.1).
--
-- Målt i prod 19/9 (Jonas): 597 tilmeldinger, 586 personer, 11 distinkte
-- utm_content, 3 utm_campaign, 581 med fbclid. Der ER noget at sammenligne —
-- og der findes i dag intet sted at gemme, hvad en annonce kostede.
--
-- TO TABELLER, OG GRUNDEN ER VIGTIG:
--   meta_annonce      den AKTUELLE beskrivelse (navn, tekst, billede, status)
--   meta_annonce_dag  KENDSGERNINGEN med en dato (forbrug, visninger, klik)
-- En annonce kan omdøbes. Stod navnet i hver dagsrække, ville historikken
-- skifte navn med tilbagevirkende kraft, og «hvad kostede annonce X i
-- oktober» ville blive et andet spørgsmål hver gang nogen redigerede i Ads
-- Manager. Beskrivelsen er «nu»; dagsrækken er «den dag».
--
-- KOBLINGEN TIL VORES EGNE TAL ER ALLEREDE PÅ PLADS og kræver INGEN nye
-- kolonner: webinar_tilmeldinger.utm_content = meta_annonce.ad_id, og
-- utm_campaign = campaign_id (migration 20260919150000). Derfor er ad_id text
-- og ikke uuid — det er Metas id, ikke vores.
--
-- FIRE REGLER I SKEMAET, HVER MED EN GRUND:
--   1. PK (ad_id, dato) på dagsrækken → upsert er idempotent. Det er DEN
--      regel, der gør det gratis at hente de samme syv dage hver nat, så
--      Metas efterjusteringer (op til 28 dage) retter sig selv.
--   2. forbrug_oere er bigint, ikke numeric/float. Huset regner penge i øre
--      som heltal overalt (prisniveau_oere, beloeb_oere).
--   3. valuta står i HVER dagsrække. Et beløb uden valuta er ikke et beløb —
--      og kontoen kan i teorien skifte valuta.
--   4. raa jsonb gemmes begge steder. Når vi om tre måneder opdager, at vi
--      skulle have brugt et felt mere, er det der. Samme mønster som
--      webinar_haendelser.raa.
--
-- INGEN FREMMEDNØGLE til webinar_tilmeldinger. Koblingen er en VÆRDI, ikke en
-- relation: en annonce kan findes uden tilmeldinger, og en tilmelding kan bære
-- et utm_content, vi endnu ikke har hentet. En FK ville afvise begge dele.
--
-- RLS: rådgivere læser, service role skriver. Samme mønster som
-- webinar_tilmeldinger (20260919130000). Ingen medlemsadgang: det er husets
-- egne annoncetal, ikke medlemmets.
--
-- PERSONDATA: ingen. Tabellerne bærer annonce-id'er, navne, annoncetekster og
-- tal. Der ligger hverken mails, navne eller IP i dem. Det er grunden til, at
-- dette udkast IKKE venter på juristen, som Conversions API-udkastet gør
-- (udkast-meta-capi) — der sendes intet til Meta; der hentes kun vores eget hjem.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
--     from information_schema.tables
--     where table_schema = 'public' and table_name in ('meta_annonce', 'meta_annonce_dag')
--   union all
--   select '2 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 er TOM (ingen af de to findes).
-- EFTER-SQL: samme. FACIT EFTER: sektion 1 = 2 rækker.
--
-- ROLLBACK (intet andet peger på dem):
--   drop table if exists public.meta_annonce_dag;
--   drop table if exists public.meta_annonce;

-- ── Beskrivelsen: én række pr. annonce, «som den ser ud nu» ────────────────
create table if not exists public.meta_annonce (
  ad_id            text primary key,
  adset_id         text,
  campaign_id      text,
  navn             text,
  adsaet_navn      text,
  kampagne_navn    text,
  status           text,
  effective_status text,
  overskrift       text,
  brodtekst        text,
  billede_url      text,
  video_id         text,
  link_url         text,
  opdateret_at     timestamptz not null default now(),
  raa              jsonb
);

create index if not exists meta_annonce_campaign_idx on public.meta_annonce (campaign_id);
create index if not exists meta_annonce_adset_idx    on public.meta_annonce (adset_id);

comment on table public.meta_annonce is 'Metas annoncer, som de ser ud NU (19/9-2026). ad_id er Metas eget id og er det samme som webinar_tilmeldinger.utm_content. Navne og tekster overskrives ved hver hentning — historikken bor i meta_annonce_dag.';
comment on column public.meta_annonce.ad_id is 'Metas ad-id. Kobles til webinar_tilmeldinger.utm_content (migration 20260919150000). Text, fordi det er Metas id, ikke vores uuid.';
comment on column public.meta_annonce.effective_status is 'Den status, der afgør om annoncen FAKTISK leverer — status kan sige ACTIVE, mens annoncesættet ovenover er slukket.';

-- ── Kendsgerningen: én række pr. annonce pr. dag, aldrig overskrevet af en anden dag ──
create table if not exists public.meta_annonce_dag (
  ad_id         text not null,
  dato          date not null,
  adset_id      text,
  campaign_id   text,
  valuta        text not null,
  forbrug_oere  bigint not null,
  visninger     bigint,
  klik          bigint,
  link_klik     bigint,
  raekkevidde   bigint,
  frekvens      numeric,
  hentet_at     timestamptz not null default now(),
  raa           jsonb,
  primary key (ad_id, dato)
);

create index if not exists meta_annonce_dag_dato_idx     on public.meta_annonce_dag (dato);
create index if not exists meta_annonce_dag_campaign_idx on public.meta_annonce_dag (campaign_id, dato);

comment on table public.meta_annonce_dag is 'Forbrug og levering pr. annonce pr. dag (19/9-2026). PK (ad_id, dato) gør hentningen idempotent: de samme syv dage kan hentes hver nat, og Metas efterjusteringer (op til 28 dage) retter sig selv uden dubletter.';
comment on column public.meta_annonce_dag.forbrug_oere is 'Forbrug i ØRE som heltal, i kolonnen valutas enhed. Meta sender en decimalstreng i kontoens valuta; _shared/metaAnnoncer.ts:oereAf oversætter ét sted og afviser alt, den ikke kan læse — en række uden læsbart forbrug skrives ikke, frem for at blive gemt som 0.';
comment on column public.meta_annonce_dag.valuta is 'Kontoens valuta, læst ved hver kørsel. Står i HVER række: et beløb uden valuta er ikke et beløb.';

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.meta_annonce     enable row level security;
alter table public.meta_annonce_dag enable row level security;

drop policy if exists "Advisors can view meta annonce" on public.meta_annonce;
create policy "Advisors can view meta annonce"
  on public.meta_annonce for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage meta annonce" on public.meta_annonce;
create policy "Service role can manage meta annonce"
  on public.meta_annonce for all to service_role
  using (true) with check (true);

drop policy if exists "Advisors can view meta annonce dag" on public.meta_annonce_dag;
create policy "Advisors can view meta annonce dag"
  on public.meta_annonce_dag for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage meta annonce dag" on public.meta_annonce_dag;
create policy "Service role can manage meta annonce dag"
  on public.meta_annonce_dag for all to service_role
  using (true) with check (true);

-- ── EFTER-tjek (kør og gem CSV) ───────────────────────────────────────────
select '1 tabeller' as sektion, table_name as noegle, 'findes' as vaerdi
  from information_schema.tables
  where table_schema = 'public' and table_name in ('meta_annonce', 'meta_annonce_dag')
union all
select '2 politikker', concat(tablename, ': ', policyname), concat(cmd, ' | ', roles::text)
  from pg_policies
  where schemaname = 'public' and tablename in ('meta_annonce', 'meta_annonce_dag')
union all
select '3 primaernoegle', 'meta_annonce_dag', pg_get_constraintdef(oid)
  from pg_constraint where conrelid = 'public.meta_annonce_dag'::regclass and contype = 'p'
union all
select '4 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
order by 1, 2;
