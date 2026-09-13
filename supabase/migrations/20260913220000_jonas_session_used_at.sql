-- Retten til den inkluderede session med JONAS (13/9-2026, recon-de-tre-sessioner.md §3, F4).
--
-- Medlemskabet indeholder EN session med hver raadgiver. Mortens ret spores i
-- companies.intro_session_used_at (20260619120000) — Jonas' ret havde intet spor: ingen
-- kolonne, ingen bookingvej, intet kort. Den levede kun som Calendly-event «Onboarding».
--
-- FORMEN: en soesterkolonne, ikke en ny tabel. Begrundelse:
--   * Mortens ret er EN kolonne med fire skrivere (claim, rollback, host-genaabning,
--     admin-afkrydsning) og fire laesere (Book session-gaten, paamindelses-cronen,
--     virksomhedssiden, admin-dialogen). En soesterkolonne faar praecis samme skrivere og
--     laesere med samme kode — den atomiske gate (UPDATE ... WHERE <ret> IS NULL, 409 ved
--     nul raekker), den guardede rollback paa samme ts, og admin-afkrydsningen der bevarer
--     tidspunktet.
--   * En separat tabel (company_id, advisor, used_at) ville IKKE fjerne asymmetrien — den
--     ville flytte den: Mortens ret i en kolonne, Jonas' i en tabel, to gates af forskellig
--     form. Symmetrien mellem de to rettigheder er vigtigere end at undgaa endnu en kolonne
--     med et raadgivernavn i.
--   * Kolonnen intro_session_used_at ROERES IKKE (navnet bliver — det koster mere end det
--     giver, jf. recon §7(i)).
--
-- Per virksomhed, ikke per bruger — som Mortens. NULL = ikke brugt; timestamp = brugt (og
-- hvornaar). Nullable uden default, saa alle eksisterende virksomheder starter med retten
-- intakt. Ingen RLS-aendring: "Advisors can update all companies" daekker admin-afkrydsningen,
-- og edge functionen skriver med service role.
--
-- Koeres i Lovable -> SQL editor efter merge (supabase db push virker ikke, se CLAUDE.md).
-- Verificer: SELECT column_name FROM information_schema.columns
--            WHERE table_name = 'companies' AND column_name = 'jonas_session_used_at';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS jonas_session_used_at timestamptz NULL;

COMMENT ON COLUMN public.companies.jonas_session_used_at IS
  'Tidspunkt hvor virksomhedens inkluderede session med Jonas blev brugt (soester til intro_session_used_at, som er Mortens). NULL = ikke brugt. Saettes af create-free-intro-booking (advisor=jonas) eller admin-markering; nulstilles ved host-aflysning i calendly-webhook.';
