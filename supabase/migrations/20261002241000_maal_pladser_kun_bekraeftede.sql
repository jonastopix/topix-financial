-- KØRT i prod 2/10-2026 ca. 12:00 (Claude via Lovable-MCP, Jonas' grønne lys «Klar» 11:31). FØR: kroppen som 20260917150000, 4 triggere. EFTER: markøren kun_bekraeftede, 4 triggere uændret, RPC maal_pladser_kun_bekraeftede true (også som authenticated), ikke definer.
--
-- «DINE MÅL», SKIVE 3 — ÅBENT PUNKT 13 LUKKES: triggeren «højst tre aktive mål»
-- tæller KUN BEKRÆFTEDE (Jonas, morgenlisten 2/10-2026: «Ja, kun bekræftede»;
-- docs/dine-maal-design.md «Skive 3» §6 punkt 13).
--
-- HVORFOR DEN KRÆVER GRØNT LYS: den ændrer kroppen på en trigger-funktion
-- (public.haandhaev_hoejst_tre_aktive_maal, migration 20260917150000 — KØRT).
-- Triggeren er IKKE SECURITY DEFINER og bliver det ikke; den opretter ingen
-- politik (maalSkriv.guard dom 2 og dom 7). Første linje er med vilje IKKE
-- «IKKE KØRT. DEPLOY:» — den, der scanner mappen efter migrationer at køre,
-- skal ikke tage denne med uden Jonas' ja.
--
-- FØR KØRSEL (ufravigeligt): kroppen i prod SKAL sammenlignes med kroppen i
-- 20260917150000 — den er grundlaget for ændringen herunder. Afviger prod
-- (en hånd har rettet den uden om repoet), STOP og læs, før noget køres:
--   SELECT pg_get_functiondef('public.haandhaev_hoejst_tre_aktive_maal()'::regprocedure);
--   Forventet (20260917150000:55–78, tegn for tegn i kroppen):
--     if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
--       select count(*) into antal from public.milestones m
--        where m.company_id = new.company_id and m.status = 'active' and m.id is distinct from new.id;
--       if antal >= 3 then raise exception 'milestones: virksomheden har allerede 3 aktive mål — parkér eller markér et som nået først' using errcode = 'P0001'; end if;
--     end if;
--   Og at kolonnerne findes (20261002100000 er KØRT 2/10 ~05:05):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'milestones' AND column_name IN ('bekraeftet_at','bekraeftet_af');
--   → to rækker. Mangler de, kan triggeren ikke oprettes (42703 ved første skrivning) — STOP.
--
-- DOMMEN (ny): en række TAGER EN PLADS, når den er AKTIV OG BEKRÆFTET. Triggeren
-- dømmer, når rækken BLIVER det — ved INSERT, ved UPDATE af status (parkeret/
-- nået → aktiv) OG ved UPDATE af bekraeftet_at (NULL → værdi: «Det er vores
-- mål»/«Behold» på et aktivt forslag tager en plads, selv om status ikke
-- ændres). Et ubekræftet aktivt mål (rådgiverens forslag, handout, legat, agent)
-- hverken tæller eller dømmes — det er et FORSLAG, ikke medlemmets mål (Jonas
-- 1/10: «Ja, ét klik»; docs/dine-maal-design.md «Skive 3» §1).
--
-- SANDHEDSTABEL (NEW efter skrivningen; «dømmes» = tællingen køres og en fjerde
-- bekræftet aktiv afvises med P0001):
--   tg_op   | OLD.status | OLD.bekraeftet_at | NEW.status | NEW.bekraeftet_at | dømmes | tæller i andres tælling
--   INSERT  |     —      |         —         |  active    |     NOT NULL      |  JA    | ja
--   INSERT  |     —      |         —         |  active    |     NULL          |  nej   | nej
--   INSERT  |     —      |         —         |  parked    |     (alt)         |  nej   | nej
--   UPDATE  |  parked    |     NOT NULL      |  active    |     NOT NULL      |  JA    | ja   (Aktivér)
--   UPDATE  |  completed |     NOT NULL      |  active    |     NOT NULL      |  JA    | ja   (Genåbn)
--   UPDATE  |  active    |     NULL          |  active    |     NOT NULL      |  JA    | ja   (bekræftelsen — NY i forhold til 20260917150000)
--   UPDATE  |  parked    |     NULL          |  active    |     NOT NULL      |  JA    | ja   (aktiverFelter: status + bekræftelse i samme UPDATE)
--   UPDATE  |  active    |     NOT NULL      |  active    |     NOT NULL      |  nej   | ja   (fremdrift, titel, frist — uændret)
--   UPDATE  |  parked    |     (alt)         |  active    |     NULL          |  nej   | nej  (et forslag aktiveres uden bekræftelse — rådgiverens vej)
--   UPDATE  |  active    |     NOT NULL      |  parked    |     NOT NULL      |  nej   | nej  (parkér frigør pladsen)
--   UPDATE  |  active    |     NOT NULL      |  active    |     NULL          |  nej   | nej  (en bekræftelse trækkes tilbage — ingen klient gør det; harmløst)
--   Tællingen: company_id = NEW.company_id AND status = 'active' AND bekraeftet_at IS NOT NULL AND id <> NEW.id. Grænsen 3 = MAX_AKTIVE_MAAL.
--
-- FØLGER, målt i koden 2/10 (ingen af dem kræver en kodeændring for at køre migrationen):
--   (a) Fladen: dineMaal.ts/dineMaalFlade.ts dømmer pladsen efter DATABASENS regel og
--       læser, hvilken regel databasen har, gennem RPC'en herunder — se «KLIENTEN».
--   (b) maal-skriv (rådgiverens vej, _shared/maal.ts kanOpretteMaal) tæller stadig ALLE aktive
--       FØR skrivningen og svarer 409 ved tre — konservativt (den afviser, hvor databasen nu
--       ville tage imod), aldrig det modsatte. En lempelse er en function-ændring med udrulning
--       (åbent punkt i docs/dine-maal-design.md «Skive 3» §6).
--   (c) handoutEngine.loeftestangStatus parkerer løftestangens mål, når ALLE aktive er tre —
--       konservativt af samme grund; et handout-mål er ubekræftet og ville aldrig blive afvist.
--   (d) Prod 2/10 (migration 20261002100000, EFTER-SQL): 3 virksomheder har 3 aktive, mest
--       maskinskrevne (agent 15 · handout 9 · ai 5 ubekræftede). Efter denne migration har de
--       plads til EGNE mål uden først at svare — fladen siger det (hovedlinjen: «plads til N
--       mere», ikke længere «Svar på de mål, der venter på jeres ja»).
--
-- KLIENTEN LÆSER REGLEN, DEN GÆTTER IKKE: en SECURITY INVOKER-RPC
-- public.maal_pladser_kun_bekraeftede() svarer true, når den KØRENDE trigger-krop
-- bærer markøren «PLADSDOM: kun_bekraeftede» (læst i pg_proc.prosrc — dvs. målt
-- på funktionen i drift, ikke på et flag, der kan stå forkert). Før migrationen
-- findes RPC'en ikke (PGRST202) → klienten dømmer «alle» (som i dag); rulles
-- triggeren tilbage uden RPC'en, svarer den false → «alle». Enhver fejl → false
-- (fail-closed til den gamle tekst, som aldrig lover en plads, databasen ville
-- afvise). app_config blev fravalgt: et flag kan sættes uden triggeren, og
-- fladen ville da love en plads, databasen afviser.
--
-- INGEN RLS-ÆNDRING, ingen politik, ingen SECURITY DEFINER, ingen ny tabel/kolonne.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 triggerkrop' as sektion, pg_get_functiondef('public.haandhaev_hoejst_tre_aktive_maal()'::regprocedure) as vaerdi
--   union all
--   select '2 triggere milestones', string_agg(tgname, ' · ' order by tgname)
--     from pg_trigger where tgrelid = 'public.milestones'::regclass and not tgisinternal
--   union all
--   select '3 rpc findes', count(*)::text from pg_proc where proname = 'maal_pladser_kun_bekraeftede'
--   union all
--   select '4 bekraeftede aktive pr. virksomhed over 3', coalesce(string_agg(concat(company_id, ':', n), ', '), 'ingen')
--     from (select company_id, count(*) n from public.milestones where status = 'active' and bekraeftet_at is not null group by company_id having count(*) > 3) t
--   union all
--   select '5 alle aktive pr. virksomhed over 3', coalesce(string_agg(concat(company_id, ':', n), ', '), 'ingen')
--     from (select company_id, count(*) n from public.milestones where status = 'active' group by company_id having count(*) > 3) t
--   union all
--   select '6 ubekraeftede aktive pr. source', coalesce(string_agg(source || ':' || n, ' · ' order by source), 'ingen')
--     from (select source, count(*) n from public.milestones where bekraeftet_at is null and status = 'active' group by source) t
--   order by 1;
--   Forventet: 1 = kroppen fra 20260917150000 (uden «bekraeftet_at»); 2 = milestone_completed_at ·
--   milestone_progress_updated_at · milestones_hoejst_tre_aktive · update_milestones_updated_at;
--   3 = 0; 4 = virksomheder med flere end tre BEKRÆFTEDE aktive (de får ingen ny plads, og rammes
--   ikke — triggeren rører aldrig eksisterende rækker); 5 = som 20260917150000's gennemgang; 6 = fordelingen.
--   Afviger 1 eller 2 — STOP.
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 triggerkrop baerer markoeren' as sektion,
--          (position('PLADSDOM: kun_bekraeftede' in pg_get_functiondef('public.haandhaev_hoejst_tre_aktive_maal()'::regprocedure)) > 0)::text as vaerdi
--   union all
--   select '2 triggere milestones', string_agg(tgname, ' · ' order by tgname)
--     from pg_trigger where tgrelid = 'public.milestones'::regclass and not tgisinternal
--   union all
--   select '3 rpc svarer', public.maal_pladser_kun_bekraeftede()::text
--   union all
--   select '4 rpc rettigheder', coalesce((select string_agg(grantee || ':' || privilege_type, ' · ' order by grantee)
--     from information_schema.routine_privileges where specific_schema = 'public' and routine_name = 'maal_pladser_kun_bekraeftede'), 'ingen')
--   union all
--   select '5 rpc ikke definer', (select (not prosecdef)::text from pg_proc where proname = 'maal_pladser_kun_bekraeftede')
--   union all
--   select '6 trigger ikke definer', (select (not prosecdef)::text from pg_proc where proname = 'haandhaev_hoejst_tre_aktive_maal')
--   order by 1;
--   Forventet: 1 = true; 2 = UÆNDRET (fire triggere); 3 = true; 4 = authenticated:EXECUTE (og
--   ejeren/service_role); 5 = true; 6 = true.
--   DEREFTER som authenticated (RPC'en læser pg_proc som kalderen — det SKAL måles, før Update):
--   begin; set local role authenticated; select public.maal_pladser_kun_bekraeftede(); rollback;
--   → true. Svarer den false, læser rollen ikke pg_proc, og klienten bliver stående på «alle»
--   (ikke farligt — men ikke det, der er bygget): STOP og skriv det.
--   MANUEL PRØVE (beskrivelse — kør den IKKE som en del af migrationen): på en TESTVIRKSOMHED
--   med tre BEKRÆFTEDE aktive mål og ét ubekræftet aktivt:
--     update public.milestones set bekraeftet_at = now(), bekraeftet_af = user_id where id = '<det ubekræftede>';
--   → forventet fejl: «milestones: virksomheden har allerede 3 bekræftede aktive mål …» (P0001), og
--     insert into public.milestones (company_id, user_id, title, status) values ('<test>', '<medlem>', 'Prøve', 'active');
--   → går IGENNEM (ubekræftet tager ingen plads). Slet prøverækken bagefter (SELECT før, skriv, SELECT efter).
--   REST-måling (anon-nøglen fra index-*.js): POST /rest/v1/rpc/maal_pladser_kun_bekraeftede → 200
--   (anon har ingen EXECUTE: 42501 — det beviser kun, at PostgREST kender funktionen; PGRST202 = schema-
--   cachen har ikke set den endnu: vent og mål igen; KLIK IKKE Update før).
--
-- ROLLBACK (kun før Update; genskaber 20260917150000 tegn for tegn):
--   drop function if exists public.maal_pladser_kun_bekraeftede();
--   create or replace function public.haandhaev_hoejst_tre_aktive_maal() returns trigger language plpgsql set search_path to 'public' as $x$
--   declare antal integer;
--   begin
--     if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
--       select count(*) into antal from public.milestones m where m.company_id = new.company_id and m.status = 'active' and m.id is distinct from new.id;
--       if antal >= 3 then raise exception 'milestones: virksomheden har allerede 3 aktive mål — parkér eller markér et som nået først' using errcode = 'P0001'; end if;
--     end if;
--     return new;
--   end;
--   $x$;
--   (triggeren milestones_hoejst_tre_aktive står og peger på funktionen — den røres ikke af rollback.)

create or replace function public.haandhaev_hoejst_tre_aktive_maal()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  antal integer;
begin
  -- PLADSDOM: kun_bekraeftede (2/10-2026, Jonas «Ja, kun bekræftede»). Markøren
  -- læses af public.maal_pladser_kun_bekraeftede() — fjernes den, dømmer klienten
  -- «alle aktive tæller» igen. Lad den stå.
  --
  -- Kun når rækken BLIVER et bekræftet aktivt mål: INSERT som aktiv + bekræftet,
  -- UPDATE af status til aktiv på en bekræftet, eller UPDATE af bekraeftet_at fra
  -- NULL på en aktiv (bekræftelsen tager pladsen). Fremdrift, titel, frist på et
  -- allerede bekræftet aktivt mål passerer uden tælling. Et ubekræftet aktivt
  -- mål (forslag) tæller aldrig og dømmes aldrig.
  if new.status = 'active'
     and new.bekraeftet_at is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'active' or old.bekraeftet_at is null) then
    select count(*) into antal
      from public.milestones m
     where m.company_id = new.company_id
       and m.status = 'active'
       and m.bekraeftet_at is not null
       and m.id is distinct from new.id;
    if antal >= 3 then
      raise exception 'milestones: virksomheden har allerede 3 bekræftede aktive mål — parkér eller markér et som nået først'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Triggeren står allerede (20260917150000) og peger på funktionen ved navn —
-- genskabes idempotent med SAMME definition, så filen også kan køres på en tom base.
drop trigger if exists milestones_hoejst_tre_aktive on public.milestones;
create trigger milestones_hoejst_tre_aktive
  before insert or update on public.milestones
  for each row execute function public.haandhaev_hoejst_tre_aktive_maal();

comment on function public.haandhaev_hoejst_tre_aktive_maal() is
  'Højst tre BEKRÆFTEDE aktive mål pr. virksomhed (skive 3, 2/10-2026 — Jonas «Ja, kun bekræftede»; før 2/10: alle aktive). Rammer kun rækker, der bliver aktive og bekræftede — også når bekraeftet_at sættes på et aktivt forslag. Ubekræftede (forslag) tæller aldrig. Markøren «PLADSDOM: kun_bekraeftede» i kroppen læses af maal_pladser_kun_bekraeftede().';

-- Klientens måling af reglen i drift (se filhovedet «KLIENTEN LÆSER REGLEN»).
-- SECURITY INVOKER, STABLE, kun SELECT på pg_catalog. Fail-closed: enhver fejl
-- (funktionen findes ikke, rollen må ikke læse pg_proc) → false → «alle».
create or replace function public.maal_pladser_kun_bekraeftede()
returns boolean
language plpgsql
stable
set search_path to 'public'
as $$
begin
  return coalesce(
    (select position('PLADSDOM: kun_bekraeftede' in p.prosrc) > 0
       from pg_catalog.pg_proc p
      where p.oid = 'public.haandhaev_hoejst_tre_aktive_maal()'::regprocedure),
    false);
exception when others then
  return false;
end;
$$;

comment on function public.maal_pladser_kun_bekraeftede() is
  'Dine mål (2/10-2026): svarer true, når den KØRENDE trigger haandhaev_hoejst_tre_aktive_maal tæller kun bekræftede (markøren «PLADSDOM: kun_bekraeftede» i pg_proc.prosrc). Klienten (src/lib/hjemmebane/maalPladsdom.ts) dømmer pladserne efter svaret; PGRST202/false/fejl = «alle aktive tæller» (som før 2/10). Måler, påstår ikke — derfor ikke et app_config-flag.';

revoke all on function public.maal_pladser_kun_bekraeftede() from public;
revoke all on function public.maal_pladser_kun_bekraeftede() from anon;
grant execute on function public.maal_pladser_kun_bekraeftede() to authenticated;
grant execute on function public.maal_pladser_kun_bekraeftede() to service_role;

select tgname from pg_trigger where tgrelid = 'public.milestones'::regclass and not tgisinternal order by 1;
