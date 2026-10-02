-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «MÅ VI RINGE TIL DIG?» (2/10-2026, docs/samtykke-og-opkald.md del 2; Jonas' fem svar
-- 2/10 kl. 07:38–07:39): efter webinaret kan en DELTAGER bede om, at Morten eller Jonas
-- ringer — én gang, om The Boardroom. Personen beder selv; der er ingen liste over
-- «varme leads» (fjernet 1/10). Hver anmodning er én klokke til rådgiverne (MORGEN-typen,
-- klokkeMail.ts) og én hændelse «Bad om opkald» til Klaviyo UDEN nummer.
--
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»):
--   1. DENNE migration (tabellen, RLS, værnet, cron-jobbet) — FØR udrulningen. Målingen er
--      EFTER-SQL'en nedenfor (anon har bevidst ingen SELECT, så en REST-måling med anon-nøglen
--      kan ikke give 200 — samme som tjenestekonti 30/9).
--   2. merge til main (kilden lander hos Lovable; den kører ikke)
--   3. EKSPLICIT deploy af ring-mig-op, ewebinar-webhook OG ewebinar-import fra Lovables build-chat — bed den
--      KØRE deploy-værktøjet og vise resultatet. Secret'en RING_SECRET skal være sat FØR:
--      uden den svarer ring-mig-op 503, og webhooken udsteder intet token (fail-soft).
--   4. BEVISET: et POST uden token → 403 med feltet "ring_mig_op": "skive-1" — kun den nye
--      kode har feltet. Webhooken: næste «Deltog i webinar»-række i klaviyo_haendelser bærer
--      `ring_op_url` i `sendt` (service-role-only tabel).
--   5. Update (fladen: /ring-mig-op og /opkald findes; klokken peger på /opkald)
--   6. Klaviyo: knappen med {{ person.ring_op_url }} bag {% if person.ring_op_url %} i «Deltog»-flowets
--      mail 1 (profilegenskaben, Jonas 08:17 — skrevet i samme kald som «Deltog i webinar»).
--
-- TABELLEN: én række pr. tilmelding (tilmelding_id UNIQUE → webinar_tilmeldinger.id, cascade:
-- slettes tilmeldingen, slettes anmodningen). navn og telefon (E.164 «+45…», dømt af
-- _shared/opkaldDom.ts — aldrig et rået tal), samtykke_ordlyd ORDRET som krydset stod
-- (bevisbyrden, spamvejledningen kap. 12) + samtykke_at, og rådgiverens ene klik:
-- ringet_at/ringet_af. Plus ip_hash (dagshash, kun til loftet). Intet andet: ingen besked,
-- intet tidsrum, ingen status-trappe — det er en kø af løfter, ikke et CRM.
--
-- OPBEVARING 90 DAGE — SLETNING, IKKE ANONYMISERING (Jonas 2/10: «Slet nummeret efter 90
-- dage — ja»): rækken bærer intet andet end nummeret, navnet og samtykket til dem. En
-- anonymiseret række (telefon null, navn null) ville være en række uden formål, og
-- tallet «hvor mange bad om det» overlever i advisor_notifications (klokkerne) og i
-- cron-loggens «DELETE n». Cron-jobbet opkald-opbevaring: samtykke_at < now() − 90 dage.
--
-- RLS:
--   - anon: INTET (REVOKE). Mennesket uden konto går gennem ring-mig-op (service role,
--     verify_jwt = false med laesRingToken FØRST — samme klasse som webinar-afmeld).
--   - service_role: ALT (functionen skriver; cron-jobbet kører som postgres uden RLS).
--   - rådgivere (has_role advisor, admin arver): SELECT (listen på /opkald) og UPDATE —
--     men KUN ringet_at og ringet_af, og ringet_af skal være dem selv. Hvorfor UPDATE til
--     klienten og ikke en function: det er ÉT klik på én kolonne, der ikke udløser noget
--     (ingen mail, ingen hændelse) — en edge function ville være en kanal uden indhold.
--     Begrænsningen til de to kolonner bor i triggeren opkald_raadgiver_kolonnevaern
--     (samme form som companies_medlem_kolonnevaern 30/9): navn, telefon, samtykke_* og
--     tilmelding_id kan en klient aldrig røre. Ingen INSERT/DELETE for authenticated.
--   - medlemmer: intet (ingen policy, og policies er permissive — kun ja'er findes).
--
-- FØR-SQL (facit: null · 0):
--   select to_regclass('public.opkaldsanmodninger');
--   select count(*) from cron.job where jobname = 'opkald-opbevaring';
--
-- EFTER-SQL (ét resultatsæt):
--   SELECT 'tabel', (to_regclass('public.opkaldsanmodninger') is not null)::text
--   UNION ALL SELECT 'kolonner', count(*)::text FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='opkaldsanmodninger'                       -- 10
--   UNION ALL SELECT 'rls', relrowsecurity::text FROM pg_class WHERE relname='opkaldsanmodninger'  -- true
--   UNION ALL SELECT 'policies', count(*)::text FROM pg_policies WHERE tablename='opkaldsanmodninger'  -- 3
--   UNION ALL SELECT 'trigger', count(*)::text FROM pg_trigger WHERE tgname='opkald_raadgiver_kolonnevaern'  -- 1
--   UNION ALL SELECT 'grant_anon', has_table_privilege('anon','public.opkaldsanmodninger','SELECT')::text  -- false
--   UNION ALL SELECT 'grant_insert_auth', has_table_privilege('authenticated','public.opkaldsanmodninger','INSERT')::text  -- false
--   UNION ALL SELECT 'cron', count(*)::text FROM cron.job WHERE jobname='opkald-opbevaring' AND active;  -- 1
--
-- ROLLBACK:
--   select cron.unschedule('opkald-opbevaring');
--   drop table if exists public.opkaldsanmodninger;
--   drop function if exists public.opkald_raadgiver_kolonnevaern();

-- ── 1. Tabellen ─────────────────────────────────────────────────────────────

create table if not exists public.opkaldsanmodninger (
  id               uuid primary key default gen_random_uuid(),
  tilmelding_id    uuid not null references public.webinar_tilmeldinger(id) on delete cascade,
  navn             text not null,
  -- E.164, dansk: «+45» + 8 cifre (opkaldDom.normaliserTelefon). CHECK'en spejler formen.
  telefon          text not null,
  -- Krydsets tekst ORDRET, som den stod på skærmen (opkaldDom.SAMTYKKE_ORDLYD).
  samtykke_ordlyd  text not null,
  samtykke_at      timestamptz not null default now(),
  oprettet_at      timestamptz not null default now(),
  ringet_at        timestamptz,
  ringet_af        uuid references auth.users(id) on delete set null,
  -- IP'ens DAGSHASH (sha256(ip + ':' + dato), ansoegning-gem-mønstret) — KUN til loftet
  -- «højst N anmodninger pr. IP pr. time». Aldrig rå IP. Følger rækken ud efter 90 dage.
  ip_hash          text,
  constraint opkaldsanmodninger_en_pr_tilmelding unique (tilmelding_id),
  constraint opkaldsanmodninger_navn_check check (char_length(navn) between 1 and 80),
  constraint opkaldsanmodninger_telefon_form check (telefon ~ '^\+45[2-9][0-9]{7}$'),
  constraint opkaldsanmodninger_ordlyd_check check (char_length(samtykke_ordlyd) between 10 and 300),
  -- Ringet er et par: begge eller ingen.
  constraint opkaldsanmodninger_ringet_par check ((ringet_at is null) = (ringet_af is null))
);

create index if not exists opkaldsanmodninger_samtykke_idx on public.opkaldsanmodninger (samtykke_at);
create index if not exists opkaldsanmodninger_ip_idx on public.opkaldsanmodninger (ip_hash, samtykke_at);

comment on table public.opkaldsanmodninger is
  '«Må vi ringe til dig?» (2/10-2026): en webinarDELTAGER bad selv om et opkald fra Morten eller Jonas. Én pr. tilmelding; skrives kun af ring-mig-op (service role, token = HMAC over ewebinar_id, RING_SECRET). Rådgivere læser og sætter ringet_at/ringet_af (kun de to kolonner — trigger). Slettes 90 dage efter samtykke_at af cron-jobbet opkald-opbevaring. Aldrig til Klaviyo, Meta eller en deling.';
comment on column public.opkaldsanmodninger.samtykke_ordlyd is
  'Krydsets tekst ordret (opkaldDom.SAMTYKKE_ORDLYD) — bevisbyrden for samtykket ligger hos os.';
comment on column public.opkaldsanmodninger.telefon is
  'E.164 «+45XXXXXXXX», dømt af opkaldDom.normaliserTelefon. Bruges KUN til dette opkald — aldrig SMS, aldrig Klaviyo, aldrig Meta.';

-- ── 2. Kolonneværnet for rådgiverens UPDATE ────────────────────────────────

create or replace function public.opkald_raadgiver_kolonnevaern()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- De to kolonner, en klient (rådgiver) må ændre. Alt andet er functionens og cron-jobbets.
  tilladte constant text[] := array['ringet_at', 'ringet_af'];
  jwt_rolle text := coalesce(auth.role(), '');
  aendrede text;
begin
  -- Kun klientkald bedømmes (som companies_medlem_kolonnevaern): service_role og postgres
  -- uden JWT (SQL editor, migrationer, pg_cron) passerer.
  if current_user::text not in ('authenticated', 'anon') and jwt_rolle not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - tilladte) is not distinct from (to_jsonb(old) - tilladte) then
    -- ringet_af skal være den, der klikker — aldrig en anden rådgivers navn på opkaldet.
    if new.ringet_af is not null and new.ringet_af is distinct from auth.uid() then
      raise exception 'ringet_af skal være dig selv' using errcode = '42501';
    end if;
    return new;
  end if;

  select string_agg(n.key, ', ' order by n.key)
    into aendrede
    from jsonb_each(to_jsonb(new) - tilladte) n
   where n.value is distinct from (to_jsonb(old) -> n.key);

  raise exception 'Rådgivere må kun ændre ringet_at/ringet_af på en opkaldsanmodning: %', aendrede
    using errcode = '42501',
          hint = 'Kolonneværnet på opkaldsanmodninger (migration 20261002270000).';
end;
$$;

comment on function public.opkald_raadgiver_kolonnevaern() is
  'BEFORE UPDATE på opkaldsanmodninger: en klient (rådgiver) må kun sætte ringet_at/ringet_af, og ringet_af = auth.uid(). service_role/postgres passerer. Migration 20261002270000.';

drop trigger if exists opkald_raadgiver_kolonnevaern on public.opkaldsanmodninger;
create trigger opkald_raadgiver_kolonnevaern
  before update on public.opkaldsanmodninger
  for each row execute function public.opkald_raadgiver_kolonnevaern();

-- ── 3. RLS ─────────────────────────────────────────────────────────────────

alter table public.opkaldsanmodninger enable row level security;

revoke all on public.opkaldsanmodninger from anon;
revoke all on public.opkaldsanmodninger from authenticated;
grant select, update on public.opkaldsanmodninger to authenticated;

-- DROP POLICY IF EXISTS herunder: KUN for idempotens på en tabel, denne migration selv
-- opretter — ingen eksisterende policy fjernes.
drop policy if exists "Advisors can view opkaldsanmodninger" on public.opkaldsanmodninger;
create policy "Advisors can view opkaldsanmodninger"
  on public.opkaldsanmodninger for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'::app_role));

-- UPDATE: rådgivere — kolonnerne afgrænses af triggeren ovenfor (RLS kan ikke se kolonner).
drop policy if exists "Advisors can mark opkaldsanmodninger ringet" on public.opkaldsanmodninger;
create policy "Advisors can mark opkaldsanmodninger ringet"
  on public.opkaldsanmodninger for update to authenticated
  using (public.has_role(auth.uid(), 'advisor'::app_role))
  with check (public.has_role(auth.uid(), 'advisor'::app_role));

drop policy if exists "Service role can manage opkaldsanmodninger" on public.opkaldsanmodninger;
create policy "Service role can manage opkaldsanmodninger"
  on public.opkaldsanmodninger for all
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

-- ── 4. Opbevaring: 90 dage, så slettes rækken ──────────────────────────────
--
-- SLOTTET: dagligt 05:33 UTC — målt 2/10 mod alle cron.schedule i migrationerne: hver time-plan
-- (*/5, */15, 1-59/5, :07, :17, 4-59/15, 10/25/40/55, 2/12/…/54, 3/8/…/58, 9/14/…/59) rammer
-- aldrig minut 33; de eneste planer på :33 er meta-annoncer kl. 03:33 og meta_hentning_vagt kl.
-- 04:33 — andre timer. Minut 52 er webinar-delinger-opbevarings (webinarDeling.guard dom 10 kræver,
-- at ingen anden plan rører det minut), og kl. 05 bruger kun :00 og :20. Låst af ringMigOp.guard.
-- cron.schedule med kendt jobname OPDATERER jobbet (husets form). En BAR DELETE, så
-- antallet står i cron.job_run_details.return_message («DELETE n»).
-- REGNESTYKKET: samtykke_at + 90 dage < now() ⇔ samtykke_at < now() − interval '90 days';
-- 90 er opkaldDom.OPBEVARING_DAGE (holdt af ringMigOp.guard).

select cron.schedule(
  'opkald-opbevaring',
  '33 5 * * *',
  $job$
  DELETE FROM public.opkaldsanmodninger
   WHERE samtykke_at < now() - interval '90 days';
  $job$
);

-- PostgREST skal kende tabellen og FK'en til tilmeldingen (indlejringen
-- `webinar_tilmeldinger(session_tid)` på /opkald), ellers PGRST200/PGRST205. SIDST.
notify pgrst, 'reload schema';
