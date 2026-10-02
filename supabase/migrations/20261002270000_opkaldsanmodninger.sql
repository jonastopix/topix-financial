-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- «MÅ VI RINGE TIL DIG?» (2/10-2026, docs/samtykke-og-opkald.md del 2; Jonas' fem svar
-- 2/10 kl. 07:38–07:39): efter webinaret kan en DELTAGER bede om, at Morten eller Jonas
-- ringer — én gang, om The Boardroom. Personen beder selv; der er ingen liste over
-- «varme leads» (fjernet 1/10). Hver anmodning er én klokke til rådgiverne (MORGEN-typen,
-- klokkeMail.ts) og én hændelse «Bad om opkald» til Klaviyo UDEN nummer.
--
-- RÆKKEFØLGEN — LÆS DEN (CLAUDE.md «Deployment af edge functions»; ét trin ad gangen,
-- beviset før det næste):
--   1. MERGE til main (kilden lander hos Lovable; den kører ikke, og fladen er ikke udgivet).
--   2. DENNE migration i Lovable → SQL editor: FØR-SQL → kørsel → EFTER-SQL (nedenfor).
--      Målingen er EFTER-SQL'en (anon har bevidst ingen SELECT, så en REST-måling med
--      anon-nøglen kan ikke give 200 — samme som tjenestekonti 30/9). Tabellen SKAL findes,
--      før functionen udrulles: ellers fejler hvert opslag med PGRST205.
--   3. Secret'en RING_SECRET (lang tilfældig streng, ét job) i Lovable → secrets. Uden den
--      svarer ring-mig-op 503, og webhooken/importen udsteder intet token (fail-soft).
--   4. EKSPLICIT deploy af ring-mig-op, ewebinar-webhook OG ewebinar-import fra Lovables
--      build-chat — bed den KØRE deploy-værktøjet og vise resultatet («Successfully deployed …»).
--      Merget udruller intet; de to ewebinar-functions trækker de ændrede delte filer ind.
--   5. BEVISET: et POST uden body → 400 med feltet "ring_mig_op": "skive-1" — kun den nye
--      kode har feltet. Webhooken: næste «Deltog i webinar»-række i klaviyo_haendelser bærer
--      `ring_op_url` i `sendt` (service-role-only tabel).
--   6. Update (fladen: /ring-mig-op og /opkald findes; klokken peger på /opkald). Først nu —
--      fladen læser tabellen, og functionen skal svare.
--   7. Klaviyo-KNAPPEN: {{ person.ring_op_url }} bag {% if person.ring_op_url %} i «Deltog»-flowets
--      mail 1 (profilegenskaben, Jonas 08:17 — skrevet i samme kald som «Deltog i webinar»).
--      SIDST: en knap til en flade, der ikke er udgivet, er et dødt link.
--
-- TABELLEN: én række pr. tilmelding (tilmelding_id UNIQUE → webinar_tilmeldinger.id, cascade:
-- slettes tilmeldingen, slettes anmodningen). navn og telefon (E.164 «+45…», dømt af
-- _shared/opkaldDom.ts — aldrig et rået tal), samtykke_ordlyd ORDRET som krydset stod
-- (bevisbyrden, spamvejledningen kap. 12) + samtykke_at, og rådgiverens ene klik:
-- ringet_at/ringet_af. Plus ip_hash (dagshash, kun til loftet), sidst_indsendt_at (10-minutters-
-- reglen) og runde_id (klokkens og Klaviyo-hændelsens id — skiftes ved en genåbning). Intet
-- andet: ingen besked, intet tidsrum, ingen status-trappe — det er en kø af løfter, ikke et CRM.
--
-- RÅDETS FUND 2/10 (rettet før kørsel):
--   1. Gentaget «indsend»: sidst_indsendt_at sættes ved hvert indsend, der når rækken; et nyt
--      inden for 10 min (opkaldDom.forSnartIgen: nu − sidst < 600 000 ms) afvises med 429 —
--      intet skrives, ingen klokke, ingen Klaviyo-POST. Skrivningerne er guardet på det læste
--      stempel (compare-and-swap), så to samtidige ikke begge passerer.
--   2. Linket udløber 30 dage efter sessionens start (opkaldDom.tokenUdloebet: session_tid +
--      30 × 86 400 000 ms < nu) — et svar, 403 «ukendt», for ukendt og udløbet.
--   3. En ÅBEN anmodning overskrives aldrig (et videresendt link må ikke skifte nummeret); kun
--      en LUKKET (ringet) genåbnes, og genåbningen skifter runde_id → ny klokke, ny hændelse.
--   4. SELECT/UPDATE-politikkerne udelukker tjenestekonti (claude@topix.dk ser aldrig numrene).
--   5. FORTRYD «RINGET» — BEVIDST: enhver rådgiver kan fortryde (og sætte) «ringet», også en
--      anden rådgivers. Begrundelse: Jonas 1/10 09:32 «Rådgiverne er sammen om alle medlemmer»
--      (ingen tildeling); kræves OLD.ringet_af = auth.uid(), kan et fejlklik hos Morten kun
--      rettes af Morten, og anmodningen står forkert lukket, til han er tilbage — et løfte om
--      et opkald, ingen holder. Hvem der SATTE «ringet», står stadig i ringet_af (= auth.uid(),
--      håndhævet af triggeren); en fortrydelse efterlader intet spor ud over den åbne række.
--      En fortrydelse skifter IKKE runde_id: den er rådgiverens rettelse, ikke en ny anmodning.
--   6. ip_hash: husets måde (ansoegning-gem) — usaltet sha256(ip:dato). Svagheden står i
--      ring-mig-op's filhoved: den kan vendes ved at prøve IPv4-rummet, så den er persondata
--      og slettes med rækken; XFF's første led kan forfalskes, så IP-loftet kan omgås.
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
--   - rådgivere (has_role advisor, admin arver) — MINUS tjenestekonti (rådets fund 4: en
--     maskine, der SER platformen, skal ikke se telefonnumre): SELECT (listen på /opkald) og
--     UPDATE — men KUN ringet_at og ringet_af, og ringet_af skal være dem selv. Hvorfor UPDATE til
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
--     WHERE table_schema='public' AND table_name='opkaldsanmodninger'                       -- 12
--   UNION ALL SELECT 'rls', relrowsecurity::text FROM pg_class WHERE relname='opkaldsanmodninger'  -- true
--   UNION ALL SELECT 'policies', count(*)::text FROM pg_policies WHERE tablename='opkaldsanmodninger'  -- 3
--   UNION ALL SELECT 'trigger', count(*)::text FROM pg_trigger WHERE tgname='opkald_raadgiver_kolonnevaern'  -- 1
--   UNION ALL SELECT 'grant_anon', has_table_privilege('anon','public.opkaldsanmodninger','SELECT')::text  -- false
--   UNION ALL SELECT 'grant_insert_auth', has_table_privilege('authenticated','public.opkaldsanmodninger','INSERT')::text  -- false
--   UNION ALL SELECT 'cron', count(*)::text FROM cron.job WHERE jobname='opkald-opbevaring' AND active  -- 1
--   UNION ALL SELECT 'policy_tjenestekonti', count(*)::text FROM pg_policies WHERE tablename='opkaldsanmodninger'
--     AND qual LIKE '%tjenestekonti%';                                                       -- 2 (select + update)
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
  -- Sidste «indsend», der nåede rækken (også et afvist på en åben anmodning) — 10-minutters-
  -- reglen (opkaldDom.forSnartIgen). Kun functionen skriver den (kolonneværnet).
  sidst_indsendt_at timestamptz not null default now(),
  -- Rundens id: klokkens reference_id og «Bad om opkald»s unikke id. Skiftes KUN af functionen,
  -- når en LUKKET anmodning genåbnes — så genåbningen er en ny klokke og en ny hændelse.
  runde_id         uuid not null default gen_random_uuid(),
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
  '«Må vi ringe til dig?» (2/10-2026): en webinarDELTAGER bad selv om et opkald fra Morten eller Jonas. Én pr. tilmelding; skrives kun af ring-mig-op (service role, token = HMAC over ewebinar_id, RING_SECRET). Rådgivere (ikke tjenestekonti) læser og sætter ringet_at/ringet_af (kun de to kolonner — trigger; enhver rådgiver kan fortryde). En åben anmodning overskrives aldrig; kun en ringet genåbnes (ny runde_id). Linket udløber 30 dage efter sessionen. Slettes 90 dage efter samtykke_at af cron-jobbet opkald-opbevaring. Aldrig til Klaviyo, Meta eller en deling.';
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
    -- FORTRYD (ringet_at/ringet_af → null) er BEVIDST åben for enhver rådgiver (rådets fund 5,
    -- begrundelsen i filhovedet): OLD.ringet_af kræves IKKE at være auth.uid().
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
-- Tjenestekonti (public.tjenestekonti, 30/9) er rådgiverkonti for en maskine — de ser ALDRIG
-- numrene. Subforespørgslen læser tjenestekonti som authenticated ("Indloggede ser
-- tjenestekonti", USING true), så ingen SECURITY DEFINER-hjælper er nødvendig. Begge politikker
-- er PERMISSIVE og giver kun JA; tjenestekontoen får nej, fordi INGEN politik siger ja til den.
create policy "Advisors can view opkaldsanmodninger"
  on public.opkaldsanmodninger for select to authenticated
  using (
    public.has_role(auth.uid(), 'advisor'::app_role)
    and not exists (select 1 from public.tjenestekonti tk where tk.user_id = auth.uid())
  );

-- UPDATE: rådgivere — kolonnerne afgrænses af triggeren ovenfor (RLS kan ikke se kolonner).
drop policy if exists "Advisors can mark opkaldsanmodninger ringet" on public.opkaldsanmodninger;
create policy "Advisors can mark opkaldsanmodninger ringet"
  on public.opkaldsanmodninger for update to authenticated
  using (
    public.has_role(auth.uid(), 'advisor'::app_role)
    and not exists (select 1 from public.tjenestekonti tk where tk.user_id = auth.uid())
  )
  with check (
    public.has_role(auth.uid(), 'advisor'::app_role)
    and not exists (select 1 from public.tjenestekonti tk where tk.user_id = auth.uid())
  );

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
