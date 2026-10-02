-- KØRT i prod 2/10-2026 ca. 12:35 (Claude via Lovable-MCP, atomisk i én DO-blok, Jonas' grønne lys «Klar» 11:31). FØR: kolonnen fandtes ikke; feed/tråd-kroppene md5-lig 20261002242000 (d30b31c2…, 0a976cdb…); én trigger; grants authenticated · postgres · sandbox_exec · service_role. EFTER: kolonne timestamptz, feed og tråd 23 kolonner, RPC definer, triggere community_traade_spoergsmaal_vaern + protect_community_traad_immutable_fields, indekset, grants som før (service_role genskabt), 0 markerede. Tørprøve (rullet tilbage): rådgiver markerer eget opslag → først i medlemmets feed; medlemsopslag afvist; medlemmets RPC afvist; skjul rydder.
--
-- Community: rådgivernes «Spørgsmål» øverst i feedet (2/10-2026).
--
-- JONAS 2/10 kl. 07:26: «Vi vil ikke tvinges til at stille et nyt spørgsmål
-- hver mandag, og det ville også gå ud over de opslag der kommer fra
-- medlemmerne, da de drukner. Vi skal opnå større aktivitet blandt medlemmer,
-- ikke kun større interaktion på rådgiveres spørgsmål. Men rådgivere skal i
-- stedet kunne lave et opslag og markere det, så det lægger sig i toppen som
-- et Spørgsmål. Det giver os større fleksibilitet.»
--
-- HVAD:
--   1. Kolonnen community_traade.spoergsmaal_markeret_at (timestamptz, NULL =
--      et almindeligt opslag). Markeringen er sin egen — den rører hverken
--      status, fastgjort eller updated_at.
--   2. HØJST ÉT ad gangen: delvist unikt indeks på en konstant,
--      WHERE spoergsmaal_markeret_at IS NOT NULL. Databasen håndhæver det;
--      RPC'en (4) rydder den gamle markering, før den sætter den nye.
--   3. KUN RÅDGIVERE kan sætte eller ændre markeringen — ny BEFORE INSERT OR
--      UPDATE-trigger community_traade_spoergsmaal_vaern. Et medlem har
--      egen INSERT- og UPDATE-politik på community_traade (20260811160000), så
--      uden triggeren kunne et medlem markere sit eget opslag gennem PostgREST.
--      OG en rådgiver har UPDATE på ALLE tråde, så en direkte PATCH uden om
--      RPC'en dømmes af triggeren med RPC'ens regler (rådets fund 2/10): når
--      markeringen SÆTTES eller ÆNDRES til en værdi (INSERT med værdi, eller
--      UPDATE hvor den er forskellig fra OLD og ikke NULL), kræves (a) kalderen
--      er rådgiver og IKKE en tjenestekonto (public.tjenestekonti — en
--      maskine, der kun SER platformen), (b) trådens forfatter er rådgiver,
--      (c) NEW.status = 'aktiv'. At FJERNE markeringen kræver (a) uden
--      tjenestekonto-leddet. En række, der allerede er markeret, og som
--      opdateres i ANDRE kolonner (tællere, redigering), dømmes ikke — ellers
--      ville et medlems visning af spørgsmålet (visningstælleren skriver
--      tråden) vælte.
--      SKJUL/SLET RYDDER: går et opslag fra 'aktiv' (UPDATE med NEW.status
--      <> 'aktiv'), sætter triggeren markeringen til NULL — uanset hvem der
--      skjuler (det er en følge, ikke en markering). Et skjult opslag er ikke
--      spørgsmålet, og det kommer ikke tilbage som spørgsmål, når det vises
--      igen; rådgiveren markerer på ny.
--      Den eksisterende protect_community_traad_immutable_fields ÆNDRES IKKE
--      (CLAUDE.md FORBIDDEN: protect_*_immutable_fields) — værnet er en egen,
--      additiv trigger med samme form (pg_trigger_depth, has_role advisor).
--   4. RPC'en marker_community_spoergsmaal(p_traad_id, p_markeret) —
--      SECURITY DEFINER, rådgiver-gate FØRST: kalderen er rådgiver og ikke en
--      tjenestekonto, tråden er 'aktiv', og trådens FORFATTER er rådgiver (et
--      medlems opslag bliver aldrig «Spørgsmål fra rådgiverne»). true = ryd
--      alle andre, sæt denne; false = ryd denne. Lige efter gaten tages
--      pg_advisory_xact_lock(hashtext('community_spoergsmaal')): to samtidige
--      markeringer køres efter hinanden, så den anden ser den førstes række og
--      rydder den — ingen 23505 fra det delvist unikke indeks til brugeren.
--   5. Læse-RPC'erne get_community_feed og get_community_traad får tre
--      kolonner SIDST i RETURNS TABLE: spoergsmaal_markeret_at, jeg_har_svaret
--      (har kalderen et AKTIVT svar i tråden — fladen folder spørgsmålet til
--      én linje for den, der har svaret) og antal_svarere (antal FORSKELLIGE
--      personer med et aktivt svar, trådens forfatter fraregnet — «N har
--      svaret» er et antal personer, og antal_svar tæller svar, også
--      forfatterens egne). Feedet sorterer et AKTIVT markeret opslag ØVERST
--      (et skjult markeret står ikke øverst hos rådgiveren), derefter som før
--      (fastgjort, seneste aktivitet). AFVIGELSE fra kilden: kommentaren
--      «Nøjagtig den kanoniske sortering …» i feed-kroppen er ikke længere
--      sand og er erstattet af markørlinjer; kildeværnet kender de to
--      erstattede linjer ordret (ERSTATTEDE_KOMMENTARLINJER).
--      En ændring af RETURNS TABLE kræver DROP først (Postgres: «cannot
--      change return type of existing function»), og DROP fjerner grants —
--      REVOKE/GRANT gentages (samme form som 20260812090000). Kroppene er
--      kopieret ORDRET fra 20261002242000_community_gaest_laeser (gæstens
--      læse-dom: porten er kan_laese_community, ikke har_aktivt_medlemskab —
--      den migration KØRES i prod FØR denne, og en krop fra 20260812180000
--      ville tage gæstens læseadgang fra ham igen); de nye
--      linjer bærer markøren «-- SPOERGSMAAL» (SELECT-leddene med
--      foranstillet komma, så de gamle linjer er uændrede), og kildeværnet
--      communitySpoergsmaal.guard kræver, at resten — uden markørlinjerne og
--      med sammenfoldet whitespace — er ord for ord som 20261002242000.
--      TIDSSTEMPLET 243000 ligger med vilje EFTER gæstens 242000: rækkefølgen
--      i mappen er rækkefølgen i prod.
--      get_community_svar er URØRT.
--   Feed-indekset idx_community_traade_feed (20260811150000) dækker ikke den
--   nye ORDER BY; med < 100 tråde er det uden betydning (sorteringen sker i
--   hukommelsen). Et indeks på den nye kolonne er med vilje IKKE lagt: højst
--   én række er markeret.
--
-- ANDRE LÆSERE AF FEEDET: forsidens «Fra fællesskabet» fjernes 2/10 af en
-- anden gren og er derfor ikke en læser her. Enhver anden læser af
-- get_community_feed får spørgsmålet først — det er feedets orden.
--
-- KLIENTEN FØR KØRSEL (fail-soft): spoergsmaal_markeret_at, jeg_har_svaret og antal_svarere er
-- undefined i svaret → ingen spørgsmålsboks, feedet som i dag. Markér-knappen
-- (rådgivere) fejler med RPC'ens «findes ikke» og siger det i en toast —
-- opslaget ER delt. UPDATE må derfor godt klikkes før kørslen; markeringen
-- virker først efter.
--
-- RÆKKEFØLGEN (ét skridt ad gangen):
--   1. Jonas' grønne lys (SECURITY DEFINER-RPC'er droppes og genskabes).
--      FORUDSÆTNING: 20261002242000_community_gaest_laeser er KØRT i prod
--      (feedets og trådens port er kan_laese_community — FØR-SQL sektion 2–3).
--   2. FØR-SQL (gem CSV). Sektion 1: kolonnen må IKKE findes. Sektion 2 og 3:
--      pg_get_functiondef for de to læse-RPC'er — sammenlign med kroppene i
--      20261002242000_community_gaest_laeser.sql (porten
--      kan_laese_community; IKKE 20260812180000 med har_aktivt_medlemskab —
--      viser prod den gamle port, er gæstens migration ikke kørt: STOP).
--      AFVIGER ÉN, STOP: så er prods krop ikke den, denne fil kopierer fra,
--      og DROP ville tabe den.
--      Sektion 4: grants (authenticated EXECUTE, intet til anon).
--   3. KØR denne migration i Lovable → SQL editor.
--   4. EFTER-SQL (gem CSV): kolonnen findes, to funktioner med 23 kolonner,
--      RPC'en og triggeren findes, indekset findes, grants som før.
--   5. Flip første linje til «-- KØRT i prod …».
--   6. Update i Lovable (frontend). Derefter: en rådgiver markerer et opslag
--      → det står øverst; en anden markering afløser; et medlem, der har
--      svaret, ser én linje.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonne' as sektion, coalesce((select data_type from information_schema.columns
--            where table_schema = 'public' and table_name = 'community_traade' and column_name = 'spoergsmaal_markeret_at'), 'FINDES IKKE (forventet)') as vaerdi
--   union all select '2 feed', pg_get_functiondef('public.get_community_feed(int, int)'::regprocedure)
--   union all select '3 traad', pg_get_functiondef('public.get_community_traad(uuid)'::regprocedure)
--   union all select '4 grants ' || p.proname, coalesce((select string_agg(a.grantee || ':' || a.privilege_type, ', ' order by a.grantee)
--            from information_schema.routine_privileges a where a.specific_schema = 'public' and a.routine_name = p.proname), '—')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname in ('get_community_feed', 'get_community_traad')
--   union all select '5 trigger', coalesce((select string_agg(tgname, ', ') from pg_trigger
--            where tgrelid = 'public.community_traade'::regclass and not tgisinternal), '—')
--   order by 1;
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 kolonne' as sektion, (select data_type from information_schema.columns
--            where table_schema = 'public' and table_name = 'community_traade' and column_name = 'spoergsmaal_markeret_at') as vaerdi
--   union all select '2 feed kolonner', (select (select count(*) from unnest(p.proargmodes) m where m = 't')::text
--            from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_community_feed')
--   union all select '3 traad kolonner', (select (select count(*) from unnest(p.proargmodes) m where m = 't')::text
--            from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_community_traad')
--   union all select '4 rpc', (select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public' and p.proname = 'marker_community_spoergsmaal')
--   union all select '5 trigger', (select string_agg(tgname, ', ') from pg_trigger
--            where tgrelid = 'public.community_traade'::regclass and not tgisinternal)
--   union all select '6 indeks', (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'community_traade_et_spoergsmaal_uidx')
--   union all select '7 grants ' || p.proname, coalesce((select string_agg(a.grantee || ':' || a.privilege_type, ', ' order by a.grantee)
--            from information_schema.routine_privileges a where a.specific_schema = 'public' and a.routine_name = p.proname), '—')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname in ('get_community_feed', 'get_community_traad', 'marker_community_spoergsmaal')
--   union all select '8 markerede', (select count(*)::text from public.community_traade where spoergsmaal_markeret_at is not null)
--   order by 1;
--   (Sektion 2 og 3 skal vise 23; sektion 8 skal vise 0 — ingen backfill.)

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Kolonnen
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.community_traade
  ADD COLUMN IF NOT EXISTS spoergsmaal_markeret_at timestamptz;

COMMENT ON COLUMN public.community_traade.spoergsmaal_markeret_at IS
  'Rådgivernes «Spørgsmål» (2/10-2026): sat = opslaget ligger øverst i feedet som spørgsmål til medlemmerne. Højst én række ad gangen (community_traade_et_spoergsmaal_uidx); kun rådgivere kan sætte den (community_traade_spoergsmaal_vaern); skrives af marker_community_spoergsmaal. NULL = et almindeligt opslag. Rører hverken status, fastgjort eller updated_at.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Højst ét ad gangen
-- ─────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS community_traade_et_spoergsmaal_uidx
  ON public.community_traade ((true))
  WHERE spoergsmaal_markeret_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Kun rådgivere kan sætte markeringen (BEFORE INSERT OR UPDATE)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Samme form som protect_community_traad_immutable_fields (20260811140000):
-- pg_trigger_depth() > 1 slipper tæller-triggernes indirekte opdateringer
-- igennem; en rådgiver (admin arver) slipper igennem; alle andre må hverken
-- indsætte en række med markering eller ændre den. RAISE, ingen stille
-- nulstilling — med ÉN undtagelse: skjul/slet rydder (nedenfor). auth.uid() er NULL i SQL-editoren og for service role →
-- has_role er falsk → markeringen kan KUN sættes af en indlogget rådgiver
-- gennem PostgREST/RPC'en. Det er med vilje (fail-closed, som husets øvrige
-- immutability-triggere).
--
-- Rydningen ved skjul/slet står FØR dybde-tjekket og FØR rolle-tjekket: den
-- er en følge af statusskiftet (skjul_community_traad, slet_community_traad,
-- SQL-editoren), ikke en markering, og må derfor ske for enhver kalder.
-- Dommen ved SÆT dømmes kun, når markeringen faktisk ændres til en værdi —
-- RPC'ens tre regler gentaget, så en rådgivers direkte PATCH gennem
-- PostgREST (UPDATE-politikken på alle tråde) dømmes ens med RPC'en.

CREATE OR REPLACE FUNCTION public.community_traade_spoergsmaal_vaern()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Skjul/slet rydder markeringen (et skjult opslag er ikke spørgsmålet).
  IF TG_OP = 'UPDATE' AND NEW.status <> 'aktiv' AND NEW.spoergsmaal_markeret_at IS NOT NULL THEN
    NEW.spoergsmaal_markeret_at := NULL;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.spoergsmaal_markeret_at IS NOT DISTINCT FROM OLD.spoergsmaal_markeret_at THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.spoergsmaal_markeret_at IS NULL THEN
    RETURN NEW;
  END IF;
  -- Rydningen ved skjul/slet (øverst) er ingen markering — den går igennem
  -- for enhver kalder (også service role og SQL-editoren).
  IF TG_OP = 'UPDATE' AND NEW.status <> 'aktiv' AND NEW.spoergsmaal_markeret_at IS NULL THEN
    RETURN NEW;
  END IF;
  -- Herfra ændres markeringen. At ændre den (også at fjerne den) kræver en rådgiver.
  IF NOT public.has_role(auth.uid(), 'advisor') THEN
    RAISE EXCEPTION 'Kun rådgivere kan markere et opslag som Spørgsmål';
  END IF;
  IF NEW.spoergsmaal_markeret_at IS NOT NULL THEN
    -- RPC'ens tre regler, så en direkte PATCH dømmes ens med RPC'en.
    IF EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'En tjenestekonto kan ikke markere et opslag som Spørgsmål';
    END IF;
    IF NOT public.has_role(NEW.forfatter_id, 'advisor') THEN
      RAISE EXCEPTION 'Kun et opslag skrevet af en rådgiver kan markeres som Spørgsmål';
    END IF;
    IF NEW.status <> 'aktiv' THEN
      RAISE EXCEPTION 'Kun et aktivt opslag kan markeres som Spørgsmål';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.community_traade_spoergsmaal_vaern() IS
  'BEFORE INSERT OR UPDATE på community_traade: et skjult/slettet opslag mister markeringen (enhver kalder — en følge af statusskiftet). spoergsmaal_markeret_at kan kun ændres af en rådgiver (has_role advisor); at SÆTTE den kræver desuden: kalderen er ikke en tjenestekonto, forfatteren er rådgiver, status = aktiv — samme regler som marker_community_spoergsmaal, så en direkte PATCH dømmes ens. En markeret række, der opdateres i andre kolonner, dømmes ikke. Egen, additiv trigger — protect_community_traad_immutable_fields er urørt (CLAUDE.md FORBIDDEN).';

DROP TRIGGER IF EXISTS community_traade_spoergsmaal_vaern ON public.community_traade;
CREATE TRIGGER community_traade_spoergsmaal_vaern
BEFORE INSERT OR UPDATE ON public.community_traade
FOR EACH ROW
EXECUTE FUNCTION public.community_traade_spoergsmaal_vaern();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) marker_community_spoergsmaal — rådgiverens markering
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.marker_community_spoergsmaal(
  p_traad_id uuid,
  p_markeret boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
  _forfatter_id uuid;
BEGIN
  -- Rådgiver-gaten FØRST (skjul_community_traad-formen, 20260812120000).
  IF NOT public.has_role(auth.uid(), 'advisor') THEN
    RAISE EXCEPTION 'Kun rådgivere kan markere et opslag som Spørgsmål';
  END IF;
  -- En tjenestekonto (claude@topix.dk, kun læsning) markerer aldrig.
  IF EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'En tjenestekonto kan ikke markere et opslag som Spørgsmål';
  END IF;

  -- To samtidige markeringer køres efter hinanden: den anden venter her,
  -- ser derefter den førstes markering og rydder den, før den sætter sin
  -- egen — det delvist unikke indeks giver aldrig brugeren en 23505.
  PERFORM pg_advisory_xact_lock(hashtext('community_spoergsmaal'));

  IF p_markeret IS NULL THEN
    RAISE EXCEPTION 'p_markeret skal angives';
  END IF;

  SELECT t.status, t.forfatter_id INTO _status, _forfatter_id
  FROM public.community_traade t
  WHERE t.id = p_traad_id
  FOR UPDATE;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'Tråden findes ikke';
  END IF;

  -- Kun et AKTIVT opslag kan være spørgsmålet: et skjult ses ikke af
  -- medlemmerne, et slettet af ingen.
  IF _status <> 'aktiv' THEN
    RAISE EXCEPTION 'Kun et aktivt opslag kan markeres som Spørgsmål';
  END IF;

  -- «Spørgsmål fra rådgiverne» er rådgivernes eget opslag — et medlems
  -- opslag bliver aldrig markeret (Jonas 2/10: rådgiverne laver et opslag og
  -- markerer det).
  IF NOT public.has_role(_forfatter_id, 'advisor') THEN
    RAISE EXCEPTION 'Kun et opslag skrevet af en rådgiver kan markeres som Spørgsmål';
  END IF;

  IF p_markeret THEN
    -- Én ad gangen: den nye markering afløser den gamle. Rydningen sker
    -- FØR sættet, så det delvist unikke indeks aldrig rammes.
    UPDATE public.community_traade
    SET spoergsmaal_markeret_at = NULL
    WHERE spoergsmaal_markeret_at IS NOT NULL
      AND id <> p_traad_id;

    UPDATE public.community_traade
    SET spoergsmaal_markeret_at = now()
    WHERE id = p_traad_id
      AND spoergsmaal_markeret_at IS NULL;
  ELSE
    UPDATE public.community_traade
    SET spoergsmaal_markeret_at = NULL
    WHERE id = p_traad_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.marker_community_spoergsmaal(uuid, boolean) IS
  'Rådgivernes «Spørgsmål» (2/10-2026): p_markeret = true sætter spoergsmaal_markeret_at = now() på tråden og rydder alle andre (højst ét ad gangen); false rydder den. KUN rådgivere (has_role advisor), aldrig en tjenestekonto, KUN et aktivt opslag, KUN et opslag skrevet af en rådgiver. Tager pg_advisory_xact_lock(hashtext(''community_spoergsmaal'')) efter gaten, så samtidige markeringer serialiseres. Rører hverken status, fastgjort eller updated_at.';

REVOKE ALL ON FUNCTION public.marker_community_spoergsmaal(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marker_community_spoergsmaal(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.marker_community_spoergsmaal(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5a) get_community_feed — tre kolonner sidst, spørgsmålet øverst
-- ─────────────────────────────────────────────────────────────────────────
-- Kroppen er 20261002242000 ordret; kun linjer mærket -- SPOERGSMAAL er nye, og
-- to kommentarlinjer om sorteringen er erstattet (se filhovedet, punkt 5).

DROP FUNCTION public.get_community_feed(int, int);

CREATE FUNCTION public.get_community_feed(p_limit int DEFAULT 30, p_offset int DEFAULT 0)
RETURNS TABLE(
  id uuid,
  titel text,
  indhold text,
  indhold_json jsonb,
  status text,
  fastgjort boolean,
  antal_svar integer,
  antal_visninger integer,
  sidste_svar_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  kilde_type text,
  kilde_item_id uuid,
  kilde_event_id uuid,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean,
  seneste_aktivitet_at timestamptz
  , spoergsmaal_markeret_at timestamptz -- SPOERGSMAAL
  , jeg_har_svaret boolean -- SPOERGSMAAL
  , antal_svarere bigint -- SPOERGSMAAL
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY DEFINER omgår RLS — funktionen SKAL selv håndhæve adgangen.
  -- Uden dette tjek er den en åben dør uden om de netop strammede
  -- community-policies. Tomt resultat, ikke fejl: en udløben bruger skal
  -- se et tomt community, ikke en fejlskærm.
  -- LÆSE-dommen (2/10-2026): kan_laese_community — gæsten læser med.
  IF NOT (public.kan_laese_community(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.titel,
    t.indhold,
    t.indhold_json,
    t.status,
    t.fastgjort,
    t.antal_svar,
    t.antal_visninger,
    t.sidste_svar_at,
    t.created_at,
    t.updated_at,
    t.kilde_type,
    t.kilde_item_id,
    t.kilde_event_id,
    t.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.traad_id = t.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.traad_id = t.id AND r.bruger_id = auth.uid()),
    COALESCE(t.sidste_svar_at, t.created_at)
    , t.spoergsmaal_markeret_at -- SPOERGSMAAL
    , EXISTS (SELECT 1 FROM public.community_svar s -- SPOERGSMAAL
              WHERE s.traad_id = t.id AND s.forfatter_id = auth.uid() AND s.status = 'aktiv') -- SPOERGSMAAL
    , (SELECT count(DISTINCT s.forfatter_id) FROM public.community_svar s -- SPOERGSMAAL
       WHERE s.traad_id = t.id AND s.status = 'aktiv' AND s.forfatter_id <> t.forfatter_id) -- SPOERGSMAAL
  FROM public.community_traade t
  LEFT JOIN public.profiles p ON p.user_id = t.forfatter_id
  -- Rådgivere ser aktiv OG skjult; medlemmer kun aktiv. 'slettet' vises
  -- aldrig for nogen — et medlems sletning er endelig, kun skjul er
  -- moderation.
  WHERE (t.status = 'aktiv'
         OR (t.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')))
  -- Rådgivernes AKTIVE Spørgsmål øverst (et skjult markeret ligger ikke -- SPOERGSMAAL
  -- øverst); derefter den kanoniske sortering fra idx_community_traade_feed -- SPOERGSMAAL
  -- (20260811150000): fastgjorte øverst, derefter seneste aktivitet. -- SPOERGSMAAL
  ORDER BY
    (t.spoergsmaal_markeret_at IS NOT NULL AND t.status = 'aktiv') DESC, -- SPOERGSMAAL
    t.fastgjort DESC, COALESCE(t.sidste_svar_at, t.created_at) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_community_feed(int, int) IS
  'Community-feedet: aktive tråde med forfatter (profiles joines i funktionen — medlemmer kan ikke læse andres profiler direkte), reaktionstal og "har jeg reageret". SECURITY DEFINER med eget fail-closed adgangstjek (kan_laese_community eller advisor; 2/10-2026: gæsten læser med) — tomt resultat for alle andre. Rådgivere ser også SKJULTE tråde (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Rådgivernes AKTIVE «Spørgsmål» (spoergsmaal_markeret_at, 2/10-2026) ligger øverst; derefter den kanoniske sortering fra idx_community_traade_feed. jeg_har_svaret = kalderen har et aktivt svar i tråden; antal_svarere = antal forskellige personer med et aktivt svar, trådens forfatter fraregnet. Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';

REVOKE ALL ON FUNCTION public.get_community_feed(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_feed(int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_community_feed(int, int) TO authenticated;
-- DROP fjernede også service_role's EXECUTE (målt i FØR 2/10); service_role arver IKKE authenticated-grants (lærdom 10/8) — genskabt, så grants er som før.
GRANT EXECUTE ON FUNCTION public.get_community_feed(int, int) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5b) get_community_traad — samme tre kolonner
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION public.get_community_traad(uuid);

CREATE FUNCTION public.get_community_traad(p_traad_id uuid)
RETURNS TABLE(
  id uuid,
  titel text,
  indhold text,
  indhold_json jsonb,
  status text,
  fastgjort boolean,
  antal_svar integer,
  antal_visninger integer,
  sidste_svar_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  kilde_type text,
  kilde_item_id uuid,
  kilde_event_id uuid,
  forfatter_id uuid,
  forfatter_navn text,
  forfatter_avatar_url text,
  antal_reaktioner bigint,
  jeg_har_reageret boolean,
  seneste_aktivitet_at timestamptz
  , spoergsmaal_markeret_at timestamptz -- SPOERGSMAAL
  , jeg_har_svaret boolean -- SPOERGSMAAL
  , antal_svarere bigint -- SPOERGSMAAL
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Samme fail-closed adgangstjek som get_community_feed — SECURITY
  -- DEFINER uden eget tjek er en åben dør uden om policies.
  -- LÆSE-dommen (2/10-2026): kan_laese_community — gæsten læser med.
  IF NOT (public.kan_laese_community(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.titel,
    t.indhold,
    t.indhold_json,
    t.status,
    t.fastgjort,
    t.antal_svar,
    t.antal_visninger,
    t.sidste_svar_at,
    t.created_at,
    t.updated_at,
    t.kilde_type,
    t.kilde_item_id,
    t.kilde_event_id,
    t.forfatter_id,
    p.full_name,
    p.avatar_url,
    (SELECT count(*) FROM public.community_reaktioner r WHERE r.traad_id = t.id),
    EXISTS (SELECT 1 FROM public.community_reaktioner r
            WHERE r.traad_id = t.id AND r.bruger_id = auth.uid()),
    COALESCE(t.sidste_svar_at, t.created_at)
    , t.spoergsmaal_markeret_at -- SPOERGSMAAL
    , EXISTS (SELECT 1 FROM public.community_svar s -- SPOERGSMAAL
              WHERE s.traad_id = t.id AND s.forfatter_id = auth.uid() AND s.status = 'aktiv') -- SPOERGSMAAL
    , (SELECT count(DISTINCT s.forfatter_id) FROM public.community_svar s -- SPOERGSMAAL
       WHERE s.traad_id = t.id AND s.status = 'aktiv' AND s.forfatter_id <> t.forfatter_id) -- SPOERGSMAAL
  FROM public.community_traade t
  LEFT JOIN public.profiles p ON p.user_id = t.forfatter_id
  WHERE t.id = p_traad_id
    -- Rådgivere ser aktiv OG skjult; 'slettet' aldrig for nogen.
    AND (t.status = 'aktiv'
         OR (t.status = 'skjult' AND public.has_role(auth.uid(), 'advisor')));
END;
$$;

COMMENT ON FUNCTION public.get_community_traad(uuid) IS
  'Én community-tråd i samme kolonnesæt som get_community_feed. SECURITY DEFINER med samme fail-closed adgangstjek (kan_laese_community eller advisor; 2/10-2026: gæsten læser med) — tomt resultat for brugere uden læseadgang. Rådgivere ser også SKJULTE tråde (moderation kan fortrydes); ''slettet'' vises aldrig for nogen. Bærer spoergsmaal_markeret_at, jeg_har_svaret og antal_svarere (2/10-2026). Det strukturerede Tiptap-dokument (indhold_json) følger med ved siden af tekstuddraget.';

REVOKE ALL ON FUNCTION public.get_community_traad(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_traad(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_community_traad(uuid) TO authenticated;
-- DROP fjernede også service_role's EXECUTE (målt i FØR 2/10); service_role arver IKKE authenticated-grants (lærdom 10/8) — genskabt, så grants er som før.
GRANT EXECUTE ON FUNCTION public.get_community_traad(uuid) TO service_role;
