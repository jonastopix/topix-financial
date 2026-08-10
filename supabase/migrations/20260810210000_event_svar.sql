-- Migration: event-svar — afbud er et svar, ikke et fravær
-- event_registrations kunne kun udtrykke JA (række m. cancelled_at
-- null). Der fandtes ingen måde at sige "jeg har set det og kommer
-- ikke" — og det er forskellen på at ignorere en invitation og at
-- melde afbud. Uden den skelnen kan uge-påmindelsen ikke undgå at
-- ramme folk, der allerede har taget stilling.
--
-- DEPLOY: køres MANUELT i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). Verificér med:
--   SELECT pg_get_functiondef('public.get_event_non_responders(uuid)'::regprocedure);
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.event_registrations'::regclass AND conname LIKE '%response%';

-- ── 1) event_registrations.response ──

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS response text NOT NULL DEFAULT 'attending'
    CHECK (response IN ('attending', 'declined'));

-- cancelled_at betyder fortsat "trukket sit svar tilbage" og er
-- UAFHÆNGIG af response: en afmelding (cancelled_at sat) fjerner
-- svaret fra bordet, et afbud (response='declined', cancelled_at null)
-- ER et aktivt svar. De to må aldrig blandes sammen.
COMMENT ON COLUMN public.event_registrations.response IS 'attending | declined — svaret. cancelled_at betyder "trukket sit svar tilbage" og er uafhængig af response; afmelding er ikke afbud';

-- ── 2) get_event_participants: afbud vises ALDRIG på deltagerlisten ──
-- Listen viser hvem der kommer — aldrig hvem der ikke gør, hverken som
-- navn eller tal. Returtypen er UÆNDRET (samme 14 kolonner som
-- 20260810200000), så CREATE OR REPLACE rækker; alle øvrige filtre
-- (aktivt medlemskab, legat-udelukkelse m. advisor-undtagelse) er
-- bevaret ORDRET. Eneste ændring: response = 'attending'-prædikatet.

CREATE OR REPLACE FUNCTION public.get_event_participants(p_event_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  industry_label text,
  company_description text,
  website text,
  linkedin_url text,
  expertise text[],
  ask_me_about text,
  working_on text,
  working_on_updated_at timestamptz,
  member_since timestamptz,
  is_advisor boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.user_id,
    p.full_name,
    p.avatar_url,
    c.name,
    c.industry_label,
    c.description,
    c.website,
    mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]),
    mp.ask_me_about,
    mp.working_on,
    mp.working_on_updated_at,
    (SELECT MIN(cm2.created_at) FROM public.company_members cm2 WHERE cm2.user_id = p.user_id),
    public.has_role(p.user_id, 'advisor')
  FROM public.event_registrations er
  JOIN public.profiles p ON p.user_id = er.user_id
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE er.event_id = p_event_id
    AND er.cancelled_at IS NULL
    AND er.response = 'attending'
    AND public.is_membership_active(public.user_company_id(p.user_id))
    AND (
      public.has_role(p.user_id, 'advisor')
      OR NOT EXISTS (
        SELECT 1 FROM public.legat_enrollments le
        WHERE le.user_id = p.user_id
          AND le.status IN ('active', 'completed')
      )
    )
  ORDER BY p.full_name
$$;

-- ── 3) get_event_non_responders — dem der hverken har sagt ja eller nej ──
-- Aktive medlemmer (get_member_directory-dommen: company_members, ikke
-- advisor, ikke legat, aktivt medlemskab) UDEN aktiv række i
-- event_registrations for eventet — uanset response: både attending og
-- declined ER svar og udelukker. Returnerer KUN user_id — ingen
-- profiloplysninger; forbrugeren er cron-påmindelser, ikke visning.

CREATE OR REPLACE FUNCTION public.get_event_non_responders(p_event_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT cm.user_id
  FROM public.company_members cm
  WHERE NOT public.has_role(cm.user_id, 'advisor')
    AND public.is_membership_active(public.user_company_id(cm.user_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.legat_enrollments le
      WHERE le.user_id = cm.user_id
        AND le.status IN ('active', 'completed')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.event_registrations er
      WHERE er.event_id = p_event_id
        AND er.user_id = cm.user_id
        AND er.cancelled_at IS NULL
    )
$$;

-- EXECUTE til BÅDE authenticated og service_role: cron-funktionen
-- (event-reminders) kalder med service-role, og service_role arver
-- IKKE authenticated-grants (lærdommen fra event-reminders 2026-08-10,
-- hvor get_member_directory ikke kunne kaldes fra cron).
REVOKE ALL ON FUNCTION public.get_event_non_responders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_non_responders(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_non_responders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_non_responders(uuid) TO service_role;
