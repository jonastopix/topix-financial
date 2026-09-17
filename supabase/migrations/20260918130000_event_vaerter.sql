-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- Værter på events (medlemmets forside PR 4b, 17/9-2026). Jonas 17/9 (ordret):
-- «Ja events har vært på. Og vi skal gerne kunne sætte flere værter på. Ofte
-- er det både Morten og Jonas. Og somme tider har vi gæster med. Altså
-- gæsteværter. De er ikke på platformen, men kunne være dejligt at markere
-- når der kommer en gæstevært.»
--
-- MÅLT FØRST (README §1): events (20260804120000:288-303) har ingen vært-
-- kolonne, og ingen senere ALTER tilføjer én (Jonas' SQL 17/9 13:01:
-- events_vaert_kolonner = 0). Én kolonne rækker ikke — «flere værter» og
-- «gæster uden konto» kræver en undertabel, som event_registrations er det
-- for tilmeldinger (:350-357).
--
-- FORMEN — én række pr. vært, i rækkefølge:
--   event_id        → events, ON DELETE CASCADE (slettes eventet, slettes værterne — som tilmeldingerne)
--   user_id         → auth.users: en rådgiver på platformen (navn og portræt slås
--                     op i get_all_advisor_profiles — ingen kopi af navnet her)
--   gaest_navn      en gæstevært uden konto (påkrævet for gæster), gaest_titel
--                   («titel/virksomhed», valgfri), gaest_foto_path (valgfri —
--                   en sti i den EKSISTERENDE private bucket content-assets, som
--                   indholdsbilleder/covers bruger (20260804120000:403-433):
--                   rådgivere uploader, medlemmer læser via signeret URL; stien
--                   følger buildAssetPath-konventionen: vaerter/{event_id}/{fil})
--   raekkefoelge    heltal, 0 = først («Morten og Jonas» er en rækkefølge)
--   CHECK           præcis ÉN af user_id / gaest_navn er sat; gæste-felterne
--                   (titel/foto) kun på gæster; foto-stien kun i vaerter/-mappen.
--
-- AFVIGELSE FRA BESTILLINGEN (user_id ON DELETE SET NULL): SET NULL ville
-- kollidere med CHECK'en «præcis én» — slettes en rådgivers auth-bruger,
-- bliver rækken (NULL, NULL) og selve sletningen af brugeren fejler på
-- constrainten. Her er user_id derfor ON DELETE CASCADE: forsvinder
-- rådgiverens konto, forsvinder hendes værtsrækker (eventet består). Vil
-- Jonas hellere beholde et spor («tidligere rådgiver»), er vejen en
-- navnekopi (vaert_navn_snapshot) + SET NULL — det er en anden model og
-- besluttes for sig.
--
-- RLS — ingen SECURITY DEFINER:
--   LÆS: «kan du se eventet, kan du se dets værter» — policyen spørger events
--        med et EXISTS, og events' egne policies gælder inde i subselecten
--        (medlem: published/cancelled/completed AND har_aktivt_medlemskab
--        (20260813104000); rådgiver: alle). Reglen følger events automatisk
--        hvis events' regel ændres — ingen kopi af dommen.
--   SKRIV: som events' egen admin-skrivning (20260804120000:318-331):
--        has_role(auth.uid(), 'advisor') for INSERT/UPDATE/DELETE. Service
--        role ALT (som events/registrations). Medlemmer skriver ikke.
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 tabellen' as sektion, 'findes' as noegle, count(*)::text as vaerdi
--     from information_schema.tables where table_schema = 'public' and table_name = 'event_vaerter'
--   union all
--   select '2 events', 'antal | published', concat(count(*), ' | ', count(*) filter (where status = 'published'))
--     from public.events
--   union all
--   select '3 events-politikker', policyname, concat(cmd, ' | ', roles::text) from pg_policies
--     where schemaname = 'public' and tablename = 'events'
--   union all
--   select '4 bucket', 'content-assets', count(*)::text from storage.buckets where id = 'content-assets'
--   union all
--   select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 = 0; sektion 3 = 6 politikker (Members view non-draft, Advisors view/insert/update/delete, Service role); sektion 4 = 1.
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt plus
--   select '6 kolonner', column_name, concat(data_type, ' | ', is_nullable) from information_schema.columns
--    where table_schema = 'public' and table_name = 'event_vaerter'
--   union all
--   select '7 politikker', policyname, concat(cmd, ' | ', roles::text) from pg_policies
--    where schemaname = 'public' and tablename = 'event_vaerter'
--   union all
--   select '8 constraints', conname, contype::text from pg_constraint
--    where conrelid = 'public.event_vaerter'::regclass
--   union all
--   select '9 raekker', 'antal', count(*)::text from public.event_vaerter
--   FACIT EFTER: sektion 1 = 1; sektion 6 = 8 kolonner; sektion 7 = 5 politikker
--   («Users can view hosts of visible events» SELECT, «Advisors can insert/update/delete event hosts», «Service role can manage event hosts» ALL);
--   sektion 8 = pkey, 2 fkeys, 3 checks, 1 unique (en rådgiver højst én gang pr. event); sektion 9 = 0.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK:
--   drop table if exists public.event_vaerter;
-- (Ingen andre objekter. types.ts rettes i hånden hvis Lovable ikke
--  regenererer — klienten læser tabellen med `as any` indtil da, som
--  member_profiles gjorde.)

create table if not exists public.event_vaerter (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete cascade,
  gaest_navn       text,
  gaest_titel      text,
  gaest_foto_path  text,
  raekkefoelge     integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint event_vaerter_en_af check (
    (user_id is not null and gaest_navn is null)
    or (user_id is null and gaest_navn is not null and length(trim(gaest_navn)) > 0)
  ),
  constraint event_vaerter_gaest_felter check (
    user_id is null or (gaest_titel is null and gaest_foto_path is null)
  ),
  constraint event_vaerter_foto_sti check (
    gaest_foto_path is null or gaest_foto_path ~ '^vaerter/[^/]+/[^/]+$'
  )
);

comment on table public.event_vaerter is
  'Værter på et event (PR 4b, 17/9-2026): rådgivere fra platformen (user_id — navn/portræt via get_all_advisor_profiles) eller gæsteværter uden konto (gaest_navn, valgfri titel og foto i content-assets under vaerter/{event_id}/). Præcis én af user_id/gaest_navn. Rækkefølgen er raekkefoelge. Læses af alle der kan se eventet (EXISTS mod events — events'' RLS gælder), skrives af rådgivere som events selv.';

-- En rådgiver står højst én gang pr. event (gæster kan hedde det samme — ingen unique på navn).
create unique index if not exists event_vaerter_event_user_uidx
  on public.event_vaerter (event_id, user_id) where user_id is not null;

create index if not exists event_vaerter_event_idx
  on public.event_vaerter (event_id, raekkefoelge);

alter table public.event_vaerter enable row level security;

-- LÆS: samme regel som events — kan du se eventet, kan du se dets værter.
-- events' policies gælder i subselecten (ingen SECURITY DEFINER her).
drop policy if exists "Users can view hosts of visible events" on public.event_vaerter;
create policy "Users can view hosts of visible events"
  on public.event_vaerter for select
  to authenticated
  using (exists (select 1 from public.events e where e.id = event_vaerter.event_id));

-- SKRIV: som events' admin-skrivning (has_role advisor — admin arver).
drop policy if exists "Advisors can insert event hosts" on public.event_vaerter;
create policy "Advisors can insert event hosts"
  on public.event_vaerter for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Advisors can update event hosts" on public.event_vaerter;
create policy "Advisors can update event hosts"
  on public.event_vaerter for update
  to authenticated
  using (public.has_role(auth.uid(), 'advisor'))
  with check (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Advisors can delete event hosts" on public.event_vaerter;
create policy "Advisors can delete event hosts"
  on public.event_vaerter for delete
  to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

drop policy if exists "Service role can manage event hosts" on public.event_vaerter;
create policy "Service role can manage event hosts"
  on public.event_vaerter for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
