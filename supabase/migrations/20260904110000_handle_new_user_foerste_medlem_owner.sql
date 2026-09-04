-- handle_new_user: det FØRSTE medlem i en virksomhed bliver owner.
--
-- GRØNT LYS: handle_new_user står på CLAUDE.md's FORBIDDEN-liste (triggers
-- på auth.users). Jonas gav 4. september 2026 udtrykkelig tilladelse til
-- præcis denne ændring — og kun denne.
--
-- MÅLT 4/9-2026: ni aktive virksomheder havde ét medlem med rollen
-- 'member' og ingen owner. Rettet i data kl. 10:17 (35 owner / 3 member).
-- Men hullet var ikke lukket: kun ÉN vej i koden gav owner — signup hvor
-- invitationen IKKE bar et company_id (grenen der opretter en ny
-- virksomhed). Den nuværende indgang (Monday → betaling → invitation MED
-- company_id, _shared/sikrIndgangsInvitation.ts) ramte den anden gren,
-- som altid skrev 'member'. Næste virksomhed gennem døren ville igen få
-- et første medlem uden owner.
--
-- BESLUTNING (Jonas, 4/9): rettelsen ligger i handle_new_users egen gren,
-- ikke i en trigger. En trigger der skrev 'owner' hvor koden lige havde
-- skrevet 'member', ville være usynlig og lyve om hvad der sker — samme
-- fælde som de to uenige domme og den permissive «hide»-policy. Betingelsen
-- er præcis og synlig: er der INGEN company_members-rækker i virksomheden i
-- forvejen, er personen ejeren; ellers er personen medlem.
--
-- ÉN ÆNDRING mod 20260319101733: i grenen `invite_record.company_id IS NOT
-- NULL` er `'member'` erstattet af
--   CASE WHEN EXISTS (SELECT 1 FROM public.company_members
--                     WHERE company_id = invite_record.company_id)
--        THEN 'member' ELSE 'owner' END
-- Alt andet er ordret som før: signatur, SECURITY DEFINER, search_path,
-- advisor-grenen, token-opslag, email-fallback, afvisning uden invitation,
-- profil, virksomhedsnavn, ny-virksomhed-grenen, samtale, accept af
-- invitationen og fejlbeskederne.
--
-- ÅBENT PUNKT — tre andre veje kan stadig give et første medlem uden owner,
-- og de rettes IKKE her: process-pending-invitation (skriver 'member',
-- W1), attach-user-to-company (skriver 'member', W2) og legat-vejene i
-- create-legat-enrollment (skriver 'member', W3/W4). De er sjældne og
-- kaldes af et menneske, de står ikke på FORBIDDEN-listen, og de kan
-- rettes med samme betingelse («ingen medlemmer i forvejen → owner»)
-- senere.
--
-- Deploy: køres manuelt i Lovable → SQL editor (CLAUDE.md). CREATE OR
-- REPLACE — kan køres igen uden skade.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
  invite_record record;
  advisor_invite record;
  existing_conv_id uuid;
  invite_token_val text;
  _company_name text;
BEGIN
  -- Check for pending advisor invitation (email-based)
  SELECT * INTO advisor_invite
  FROM public.advisor_invitations
  WHERE lower(trim(email)) = lower(trim(NEW.email)) AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'advisor')
    ON CONFLICT DO NOTHING;

    UPDATE public.advisor_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = advisor_invite.id;

    RETURN NEW;
  END IF;

  -- 1) Token-based invitation lookup
  invite_token_val := NEW.raw_user_meta_data->>'invite_token';
  IF invite_token_val IS NOT NULL AND invite_token_val != '' THEN
    SELECT * INTO invite_record
    FROM public.company_invitations
    WHERE token = invite_token_val::uuid AND status = 'pending'
    LIMIT 1;
  END IF;

  -- 2) Fallback: email-based invitation lookup
  IF NOT FOUND THEN
    SELECT * INTO invite_record
    FROM public.company_invitations
    WHERE lower(trim(email)) = lower(trim(NEW.email)) AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- NO invitation found → REJECT signup entirely
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup kræver en gyldig invitation. Kontakt din rådgiver for at få adgang.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Invitation found — create profile
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

  _company_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      split_part(NEW.email, '@', 1),
      'Ny bruger'
    ) || 's virksomhed'
  );

  IF invite_record.company_id IS NOT NULL THEN
    -- 4/9-2026: det FØRSTE medlem i virksomheden er ejeren. Findes der
    -- allerede en company_members-række, er den nye person medlem.
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (
      invite_record.company_id,
      NEW.id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.company_members
          WHERE company_id = invite_record.company_id
        ) THEN 'member'
        ELSE 'owner'
      END
    );

    SELECT id INTO existing_conv_id
    FROM public.conversations
    WHERE company_id = invite_record.company_id
    LIMIT 1;

    IF existing_conv_id IS NULL THEN
      INSERT INTO public.conversations (member_id, company_id)
      VALUES (NEW.id, invite_record.company_id);
    END IF;
  ELSE
    INSERT INTO public.companies (name)
    VALUES (_company_name)
    RETURNING id INTO new_company_id;

    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (new_company_id, NEW.id, 'owner');

    INSERT INTO public.conversations (member_id, company_id)
    VALUES (NEW.id, new_company_id);
  END IF;

  UPDATE public.company_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
  WHERE id = invite_record.id;

  RETURN NEW;
END;
$$;

-- VERIFICÉR efter kørsel i Lovable → SQL editor — definitionen skal
-- indeholde den nye betingelse (forventet: én række, 'true'):
--
--   SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure)
--          LIKE '%WHEN EXISTS (%SELECT 1 FROM public.company_members%THEN ''member''%ELSE ''owner''%'
--          AS har_foerste_medlem_owner;
--
-- BEVIS I DRIFT — signup skal prøves for BEGGE grene, ikke kun læses:
--   1. En invitation MED company_id på en virksomhed UDEN medlemmer →
--      det nye medlem skal have role = 'owner'.
--   2. En invitation MED company_id på en virksomhed der allerede har et
--      medlem → det nye medlem skal have role = 'member'.
--   Tjek bagefter med:
--     SELECT company_id, user_id, role, created_at
--     FROM public.company_members WHERE company_id = '<id>' ORDER BY created_at;
