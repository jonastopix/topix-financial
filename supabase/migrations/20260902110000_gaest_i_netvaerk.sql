-- Gæster på platformen: adgang ja, netværk nej.
-- KØRT MANUELT i Lovable SQL editor 2026-09-02. Denne fil er bogføringen,
-- så laget kan genskabes fra repoet.
--
-- Baggrund: to virksomheder (Alexander Lunds og Martin Larsens) er gæster
-- der har fået lov at se platformen. De fremgik i Netværket, fordi
-- is_membership_active er FAIL-OPEN: contract_end_date IS NULL -> true.
-- Målt 2/9: der fandtes intet felt, ingen rolle og ingen indstilling der
-- kunne holde en aktiv, ikke-legat bruger ude af Netværket uden også at
-- tage adgangen eller sende dem til legat-miljøet.
--
-- Hvorfor et eget felt og ikke companies.status: status styrer allerede
-- fire ting (raadgiverlisten i Members.tsx:445, rapport-paamindelser i
-- send-report-reminder, run-weekly-agent og branche-sammenligningen i
-- run-company-agent). Bindes Netvaerket til den femte, kan en gaest ikke
-- skjules ET sted uden at blive skjult alle fem. En gaest SKAL have
-- adgang; de skal bare ikke staa paa listen.

alter table public.companies
  add column if not exists vis_i_netvaerk boolean not null default true;

comment on column public.companies.vis_i_netvaerk is
  'Falsk = virksomhedens brugere vises IKKE i Netvaerket, men beholder fuld adgang til platformen. Til gaester der har faaet lov at se platformen uden at vaere medlemmer. Adskilt fra companies.status, som styrer raadgiverlisten, rapport-paamindelser, ugeagenten og branche-sammenligningen — en gaest skal skjules ET sted, ikke fem. Laeses kun af get_member_directory.';

-- get_member_directory: fjerde betingelse ved siden af de tre
-- eksisterende (rolle, aktivt medlemskab, ingen legat-indskrivning).
-- Raadgivergrenen i UNION roeres IKKE — raadgivere vises altid.
-- Oevrige kolonner og raekkefoelge er uaendret fra 20260810200000.

create or replace function public.get_member_directory()
returns table(
  user_id uuid, full_name text, avatar_url text, company_name text,
  industry_label text, company_description text, website text,
  linkedin_url text, expertise text[], ask_me_about text,
  working_on text, working_on_updated_at timestamptz,
  member_since timestamptz, is_advisor boolean
)
language sql
stable security definer
set search_path to 'public'
as $$
  SELECT
    p.user_id, p.full_name, p.avatar_url, c.name, c.industry_label,
    c.description, c.website, mp.linkedin_url,
    COALESCE(mp.expertise, '{}'::text[]), mp.ask_me_about, mp.working_on,
    mp.working_on_updated_at,
    (SELECT MIN(cm2.created_at) FROM public.company_members cm2 WHERE cm2.user_id = p.user_id),
    false AS is_advisor
  FROM public.company_members cm
  JOIN public.profiles p ON p.user_id = cm.user_id
  LEFT JOIN public.companies c ON c.id = public.user_company_id(p.user_id)
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE NOT public.has_role(cm.user_id, 'advisor')
    AND public.is_membership_active(public.user_company_id(p.user_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.legat_enrollments le
      WHERE le.user_id = p.user_id
        AND le.status IN ('active', 'completed')
    )
    -- Gaester: adgang ja, netvaerk nej. COALESCE fordi join'et er et
    -- LEFT JOIN — en bruger uden virksomhed giver NULL og skal fortsat
    -- med, praecis som foer.
    AND COALESCE(c.vis_i_netvaerk, true)
  UNION
  SELECT
    p.user_id, p.full_name, p.avatar_url,
    NULL::text, NULL::text, NULL::text, NULL::text,
    mp.linkedin_url, COALESCE(mp.expertise, '{}'::text[]),
    mp.ask_me_about, mp.working_on, mp.working_on_updated_at,
    NULL::timestamptz, true AS is_advisor
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN public.member_profiles mp ON mp.user_id = p.user_id
  WHERE ur.role IN ('advisor'::app_role, 'admin'::app_role)
  ORDER BY is_advisor, full_name, user_id
$$;

REVOKE ALL ON FUNCTION public.get_member_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_directory() TO authenticated;

-- De to gaester, sat 2/9. Bevist samme dag: get_member_directory gav 28
-- raekker (26 medlemmer + 2 raadgivere) og ingen af gaesterne.
-- FOER-vaerdi for begge: true (kolonnens default).
update public.companies set vis_i_netvaerk = false
where id in (
  '877ac0c1-e4b2-43f2-a5b6-5ccdc452a688',  -- Alexander Lunds virksomhed
  '510955b3-f6ac-4811-9834-45e315e82ec8'   -- Martin Larsens virksomhed
)
  and vis_i_netvaerk = true;
