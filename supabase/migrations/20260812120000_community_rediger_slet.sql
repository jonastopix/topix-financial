-- Community: ret og slet eget indhold + rådgiver-skjul.
--
-- Et medlem skal kunne rette og slette sit eget opslag. Policies tillader
-- det allerede (UPDATE på egen række med status = 'aktiv', 20260811160000),
-- men der findes ingen RPC'er, og fladen har ingen knapper. Skrivning går
-- gennem RPC'er som resten af community, så reglerne bor ét sted.
-- Rådgivere kan SKJULE (status = 'skjult'), men må IKKE redigere andres
-- ord: en redigering, der ser ud til at komme fra medlemmet selv, er en
-- tillidsbrist i et rum der bygger på ærlighed. Sletning af andres indhold
-- findes ikke — 'skjult' bevarer historikken.
--
-- Immutability-note: protect_community_traad_immutable_fields gater på
-- auth.uid() (kalderens JWT-claim), som SECURITY DEFINER IKKE ændrer —
-- triggeren ser altså medlemmet, ikke funktionens rolle. Det er ufarligt
-- her: RPC'erne rører kun titel, indhold, indhold_json, status og
-- updated_at, og ingen af dem er blandt de frosne felter (forfatter_id,
-- created_at, fastgjort, tællerne, kilde-felterne). Triggeren er urørt.
--
-- Ingen ændring af tabeller, policies, triggere eller andre funktioner.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT pg_get_functiondef('public.ret_community_traad(uuid, text, jsonb)'::regprocedure);
--   SELECT pg_get_functiondef('public.ret_community_svar(uuid, jsonb)'::regprocedure);
--   SELECT pg_get_functiondef('public.slet_community_traad(uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.skjul_community_traad(uuid, boolean)'::regprocedure);

-- ─────────────────────────────────────────────────────────────────────────
-- 1) ret_community_traad — kun forfatteren selv
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ret_community_traad(
  p_traad_id uuid,
  p_titel text,
  p_indhold_json jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _forfatter_id uuid;
  _status text;
  _tekst text;
BEGIN
  -- SECURITY DEFINER omgår RLS — funktionen håndhæver selv adgangen.
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  -- Samme validering som opret_community_traad: whitespace alene er tomt.
  IF btrim(COALESCE(p_titel, '')) = '' THEN
    RAISE EXCEPTION 'Titlen må ikke være tom';
  END IF;

  -- Dokumentformat-tjek ved døren (jf. 20260811190000). Redigering sker
  -- altid fra composeren, som altid leverer et dokument — NULL er derfor
  -- også ugyldigt her (modsat opret, hvor ren tekst-vejen findes).
  IF p_indhold_json IS NULL
     OR jsonb_typeof(p_indhold_json) IS DISTINCT FROM 'object'
     OR p_indhold_json->>'type' IS DISTINCT FROM 'doc' THEN
    RAISE EXCEPTION 'Ugyldigt dokumentformat';
  END IF;

  -- Teksten udledes af dokumentet — klienten bestemmer aldrig uddraget.
  _tekst := public.community_json_til_tekst(p_indhold_json);
  IF btrim(COALESCE(_tekst, '')) = '' THEN
    RAISE EXCEPTION 'Indholdet må ikke være tomt';
  END IF;

  SELECT t.forfatter_id, t.status INTO _forfatter_id, _status
  FROM public.community_traade t
  WHERE t.id = p_traad_id
  FOR UPDATE;

  -- Status-dommen FØR forfatter-dommen: en skjult/slettet tråds eksistens
  -- skal ikke bekræftes over for andre end dem, der allerede kan se den.
  IF _forfatter_id IS NULL OR _status <> 'aktiv' THEN
    RAISE EXCEPTION 'Tråden findes ikke eller er lukket';
  END IF;

  -- Kun forfatteren selv — rådgivere må IKKE: en redigering, der ser ud
  -- til at komme fra medlemmet selv, er en tillidsbrist i et rum der
  -- bygger på ærlighed. Rådgiverens værktøj er skjul, ikke omskrivning.
  IF _forfatter_id <> auth.uid() THEN
    RAISE EXCEPTION 'Du kan kun rette dine egne opslag';
  END IF;

  UPDATE public.community_traade
  SET titel = btrim(p_titel),
      indhold = _tekst,
      indhold_json = p_indhold_json,
      updated_at = now()
  WHERE id = p_traad_id;
END;
$$;

COMMENT ON FUNCTION public.ret_community_traad(uuid, text, jsonb) IS
  'Retter forfatterens EGEN aktive community-tråd: titel, indhold_json og det udledte tekstuddrag (community_json_til_tekst) + updated_at. Fail-closed: rejser fejl uden community-adgang, ved tom titel, ugyldigt/tomt dokument, ukendt/lukket tråd eller fremmed forfatter. Rådgivere kan IKKE rette andres opslag — de kan kun skjule (skjul_community_traad).';

REVOKE ALL ON FUNCTION public.ret_community_traad(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ret_community_traad(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ret_community_traad(uuid, text, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) ret_community_svar — samme regler, uden titel
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ret_community_svar(
  p_svar_id uuid,
  p_indhold_json jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _forfatter_id uuid;
  _svar_status text;
  _traad_status text;
  _tekst text;
BEGIN
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  -- Dokumentformat-tjek ved døren — NULL er ugyldigt her (se
  -- ret_community_traad).
  IF p_indhold_json IS NULL
     OR jsonb_typeof(p_indhold_json) IS DISTINCT FROM 'object'
     OR p_indhold_json->>'type' IS DISTINCT FROM 'doc' THEN
    RAISE EXCEPTION 'Ugyldigt dokumentformat';
  END IF;

  _tekst := public.community_json_til_tekst(p_indhold_json);
  IF btrim(COALESCE(_tekst, '')) = '' THEN
    RAISE EXCEPTION 'Indholdet må ikke være tomt';
  END IF;

  -- Både svaret OG dets tråd skal være aktive — et svar i en skjult eller
  -- slettet tråd kan ikke redigeres. Status-dommen før forfatter-dommen,
  -- samme begrundelse som i ret_community_traad.
  SELECT s.forfatter_id, s.status, t.status
  INTO _forfatter_id, _svar_status, _traad_status
  FROM public.community_svar s
  JOIN public.community_traade t ON t.id = s.traad_id
  WHERE s.id = p_svar_id
  FOR UPDATE OF s;

  IF _forfatter_id IS NULL OR _svar_status <> 'aktiv' OR _traad_status <> 'aktiv' THEN
    RAISE EXCEPTION 'Svaret findes ikke eller er lukket';
  END IF;

  IF _forfatter_id <> auth.uid() THEN
    RAISE EXCEPTION 'Du kan kun rette dine egne svar';
  END IF;

  UPDATE public.community_svar
  SET indhold = _tekst,
      indhold_json = p_indhold_json,
      updated_at = now()
  WHERE id = p_svar_id;
END;
$$;

COMMENT ON FUNCTION public.ret_community_svar(uuid, jsonb) IS
  'Retter forfatterens EGET aktive svar (i en aktiv tråd): indhold_json og det udledte tekstuddrag + updated_at. Fail-closed: rejser fejl uden community-adgang, ved ugyldigt/tomt dokument, ukendt/lukket svar eller fremmed forfatter. Rådgivere kan ikke rette andres svar.';

REVOKE ALL ON FUNCTION public.ret_community_svar(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ret_community_svar(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ret_community_svar(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) slet_community_traad — forfatterens egen soft-delete
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.slet_community_traad(p_traad_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _forfatter_id uuid;
  _status text;
BEGIN
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  SELECT t.forfatter_id, t.status INTO _forfatter_id, _status
  FROM public.community_traade t
  WHERE t.id = p_traad_id
  FOR UPDATE;

  IF _forfatter_id IS NULL OR _status <> 'aktiv' THEN
    RAISE EXCEPTION 'Tråden findes ikke eller er lukket';
  END IF;

  IF _forfatter_id <> auth.uid() THEN
    RAISE EXCEPTION 'Du kan kun slette dine egne opslag';
  END IF;

  -- Ingen fysisk DELETE (soft-cancel-princippet): svar og reaktioner
  -- bevares i databasen, men tråden forsvinder fra feedet (læse-RPC'erne
  -- filtrerer på status = 'aktiv'), og dens billeder kan ikke længere
  -- signeres — maa_se_community_billede kræver en AKTIV tråd/svar.
  UPDATE public.community_traade
  SET status = 'slettet',
      updated_at = now()
  WHERE id = p_traad_id;
END;
$$;

COMMENT ON FUNCTION public.slet_community_traad(uuid) IS
  'Soft-delete af forfatterens EGEN aktive tråd: status = ''slettet'' + updated_at, ingen fysisk DELETE. Svar og reaktioner bevares, tråden forsvinder fra feedet, og billeder i den kan ikke længere signeres. Fail-closed: fejl uden community-adgang, ved ukendt/lukket tråd eller fremmed forfatter. Kan ikke fortrydes via skjul_community_traad.';

REVOKE ALL ON FUNCTION public.slet_community_traad(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.slet_community_traad(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.slet_community_traad(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) skjul_community_traad — rådgiverens moderation
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.skjul_community_traad(
  p_traad_id uuid,
  p_skjul boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
BEGIN
  IF NOT (public.har_aktivt_medlemskab(auth.uid())
          OR public.has_role(auth.uid(), 'advisor')) THEN
    RAISE EXCEPTION 'Ingen adgang til community';
  END IF;

  IF NOT public.has_role(auth.uid(), 'advisor') THEN
    RAISE EXCEPTION 'Kun rådgivere kan skjule opslag';
  END IF;

  IF p_skjul IS NULL THEN
    RAISE EXCEPTION 'p_skjul skal angives';
  END IF;

  SELECT t.status INTO _status
  FROM public.community_traade t
  WHERE t.id = p_traad_id
  FOR UPDATE;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'Tråden findes ikke';
  END IF;

  -- En slettet tråd må IKKE røres: et medlems sletning skal ikke kunne
  -- fortrydes af en rådgiver — heller ikke ved et uheld via "vis igen".
  IF _status = 'slettet' THEN
    RAISE EXCEPTION 'Tråden er slettet af forfatteren';
  END IF;

  UPDATE public.community_traade
  SET status = CASE WHEN p_skjul THEN 'skjult' ELSE 'aktiv' END,
      updated_at = now()
  WHERE id = p_traad_id;
END;
$$;

COMMENT ON FUNCTION public.skjul_community_traad(uuid, boolean) IS
  'Rådgiver-moderation: p_skjul = true sætter status = ''skjult'', false sætter ''aktiv'' igen. KUN rådgivere (has_role advisor). En tråd med status = ''slettet'' kan ikke røres — et medlems sletning kan ikke fortrydes af en rådgiver. Skjul bevarer historikken; sletning af andres indhold findes ikke.';

REVOKE ALL ON FUNCTION public.skjul_community_traad(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skjul_community_traad(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.skjul_community_traad(uuid, boolean) TO authenticated;
