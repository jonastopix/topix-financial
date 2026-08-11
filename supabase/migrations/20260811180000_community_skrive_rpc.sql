-- Community: skrive-RPC'er — tråd, svar, reaktions-toggle og visning.
--
-- Læsningen går gennem get_community_feed/_traad/_svar. Skrivningen skal gøre
-- det samme, fordi tre af fire skrivninger har regler, klienten ikke kan bære:
-- en visning skal være idempotent, et like er en toggle, og et svar må ikke
-- kunne skrives ind i en tråd, brugeren ikke må se. Ligger de regler i React,
-- ligger de uden for enhver håndhævelse.
--
-- Adgangstjekket står FØRST i alle fire kroppe — SECURITY DEFINER omgår
-- RLS, så funktionen skal selv håndhæve adgangen. Forskellen fra
-- læse-RPC'erne (20260811170000): læsning returnerer tomt, fordi en
-- udløben bruger skal se et tomt community frem for en fejlskærm.
-- Skrivning REJSER fejl, fordi en handling, der ikke må ske, skal fejle
-- synligt frem for stille at blive ignoreret. Eneste undtagelse er
-- registrer_community_visning (se dens egen kommentar).
--
-- Ingen ændring af tabeller, policies, triggere eller indekser.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT pg_get_functiondef('public.opret_community_traad(text, text, text, uuid, uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.opret_community_svar(uuid, text)'::regprocedure);
--   SELECT pg_get_functiondef('public.saet_community_reaktion(uuid, uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.registrer_community_visning(uuid)'::regprocedure);

-- ─────────────────────────────────────────────────────────────────────────
-- 1) opret_community_traad
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.opret_community_traad(
  p_titel text,
  p_indhold text,
  p_kilde_type text DEFAULT NULL,
  p_kilde_item_id uuid DEFAULT NULL,
  p_kilde_event_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
BEGIN
  -- SECURITY DEFINER omgår RLS — funktionen håndhæver selv adgangen.
  -- Skrivning rejser fejl (modsat læse-RPC'ernes tomme resultat): en
  -- handling, der ikke må ske, skal fejle synligt.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  -- Whitespace alene er tomt.
  IF btrim(COALESCE(p_titel, '')) = '' THEN
    RAISE EXCEPTION 'Titlen må ikke være tom';
  END IF;
  IF btrim(COALESCE(p_indhold, '')) = '' THEN
    RAISE EXCEPTION 'Indholdet må ikke være tomt';
  END IF;

  -- Kilde-felterne sendes videre som de er — CHECK-constrainten
  -- community_traade_kilde_check håndhæver sammenhængen.
  -- Titel og indhold indsættes TRIMMET: der valideres med btrim, men
  -- indsættes råt, så " Titel " ellers ville havne i databasen med
  -- mellemrum.
  INSERT INTO public.community_traade
    (forfatter_id, titel, indhold, kilde_type, kilde_item_id, kilde_event_id)
  VALUES
    (auth.uid(), btrim(p_titel), btrim(p_indhold), p_kilde_type, p_kilde_item_id, p_kilde_event_id)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

COMMENT ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid) IS
  'Opretter en community-tråd som den kaldende bruger (forfatter_id = auth.uid()) og returnerer id. Fail-closed adgangstjek (har_aktivt_medlemskab eller advisor) — rejser fejl, skrivning må ikke ignoreres stille. Afviser tom titel/indhold (btrim). Kilde-sammenhængen håndhæves af tabellens CHECK-constraint.';

REVOKE ALL ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.opret_community_traad(text, text, text, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) opret_community_svar
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.opret_community_svar(p_traad_id uuid, p_indhold text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  IF btrim(COALESCE(p_indhold, '')) = '' THEN
    RAISE EXCEPTION 'Indholdet må ikke være tomt';
  END IF;

  -- Tråden skal findes og være aktiv FØR insert: uden tjekket kan et svar
  -- skrives ind i en skjult tråd, som forfatteren ikke selv kan se.
  IF NOT EXISTS (
    SELECT 1 FROM public.community_traade t
    WHERE t.id = p_traad_id AND t.status = 'aktiv'
  ) THEN
    RAISE EXCEPTION 'Tråden findes ikke eller er lukket';
  END IF;

  -- Indholdet indsættes TRIMMET: der valideres med btrim, men indsættes
  -- råt, så " Titel " ellers ville havne i databasen med mellemrum.
  INSERT INTO public.community_svar (traad_id, forfatter_id, indhold)
  VALUES (p_traad_id, auth.uid(), btrim(p_indhold))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

COMMENT ON FUNCTION public.opret_community_svar(uuid, text) IS
  'Opretter et svar som den kaldende bruger og returnerer id. Fail-closed adgangstjek der rejser fejl. Afviser tomt indhold (btrim) og kræver at tråden findes med status = ''aktiv'' — ellers kunne et svar skrives ind i en skjult tråd. Trådens antal_svar/sidste_svar_at vedligeholdes af trigger.';

REVOKE ALL ON FUNCTION public.opret_community_svar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opret_community_svar(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.opret_community_svar(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) saet_community_reaktion — toggle
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.saet_community_reaktion(
  p_traad_id uuid DEFAULT NULL,
  p_svar_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _fandtes boolean;
BEGIN
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  -- Præcis ét mål — spejler tabellens community_reaktioner_maal_check.
  IF (p_traad_id IS NULL AND p_svar_id IS NULL)
     OR (p_traad_id IS NOT NULL AND p_svar_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Angiv præcis ét af p_traad_id og p_svar_id';
  END IF;

  -- Toggle: findes brugerens reaktion, slettes den — uanset objektets
  -- status, så et like altid kan fortrydes.
  IF p_traad_id IS NOT NULL THEN
    DELETE FROM public.community_reaktioner r
    WHERE r.traad_id = p_traad_id AND r.bruger_id = auth.uid() AND r.type = 'like';
    _fandtes := FOUND;
  ELSE
    DELETE FROM public.community_reaktioner r
    WHERE r.svar_id = p_svar_id AND r.bruger_id = auth.uid() AND r.type = 'like';
    _fandtes := FOUND;
  END IF;

  IF _fandtes THEN
    RETURN false;  -- reaktionen er fortrudt
  END IF;

  -- Ny reaktion kræver at målobjektet findes og er aktivt.
  -- ON CONFLICT DO NOTHING fjerner kapløbstilstanden: to hurtige klik kan
  -- begge nå at se, at reaktionen ikke findes, hvorefter den anden INSERT
  -- rammer det partielle unikke indeks og rejser en fejl. Brugeren ville
  -- få en fejlbesked for at klikke to gange på et hjerte. DO NOTHING
  -- fjerner fejlstien uden at ændre svaret: reaktionen findes bagefter,
  -- så true er stadig sandt.
  IF p_traad_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.community_traade t
      WHERE t.id = p_traad_id AND t.status = 'aktiv'
    ) THEN
      RAISE EXCEPTION 'Tråden findes ikke eller er lukket';
    END IF;
    INSERT INTO public.community_reaktioner (traad_id, bruger_id, type)
    VALUES (p_traad_id, auth.uid(), 'like')
    ON CONFLICT DO NOTHING;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.community_svar s
      WHERE s.id = p_svar_id AND s.status = 'aktiv'
    ) THEN
      RAISE EXCEPTION 'Svaret findes ikke eller er skjult';
    END IF;
    INSERT INTO public.community_reaktioner (svar_id, bruger_id, type)
    VALUES (p_svar_id, auth.uid(), 'like')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN true;  -- "har jeg nu reageret"
END;
$$;

COMMENT ON FUNCTION public.saet_community_reaktion(uuid, uuid) IS
  'Toggle af den kaldende brugers like på præcis ét mål (tråd ELLER svar — ellers fejl). Findes reaktionen, slettes den (uanset målets status, så et like altid kan fortrydes) og false returneres; ellers indsættes type ''like'' — kun på aktive mål — og true returneres. Returværdien er "har jeg nu reageret". Fail-closed adgangstjek der rejser fejl.';

REVOKE ALL ON FUNCTION public.saet_community_reaktion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saet_community_reaktion(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.saet_community_reaktion(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) registrer_community_visning — idempotent
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrer_community_visning(p_traad_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- ENESTE skrive-RPC der IKKE rejser fejl ved manglende adgang: en
  -- visning er en bivirkning af at kigge, ikke en handling. Kald fra en
  -- bruger uden adgang skal forsvinde stille — aldrig give en fejlskærm
  -- oven på et view, brugeren alligevel ikke ser.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RETURN;
  END IF;

  -- Idempotent: primærnøglen er (traad_id, bruger_id), så tælleren er
  -- "hvor mange har set", ikke "hvor mange gange" — og gentagne kald må
  -- derfor ikke fejle.
  INSERT INTO public.community_visninger (traad_id, bruger_id)
  VALUES (p_traad_id, auth.uid())
  ON CONFLICT (traad_id, bruger_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.registrer_community_visning(uuid) IS
  'Registrerer at den kaldende bruger har set tråden — idempotent via ON CONFLICT (traad_id, bruger_id) DO NOTHING; tælleren er "hvor mange har set", ikke "hvor mange gange". Rejser IKKE fejl ved manglende adgang (stille RETURN): en visning er en bivirkning af at kigge, ikke en handling. Trådens antal_visninger vedligeholdes af trigger.';

REVOKE ALL ON FUNCTION public.registrer_community_visning(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrer_community_visning(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrer_community_visning(uuid) TO authenticated;
