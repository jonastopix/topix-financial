-- KØRT i prod — 30/9-2026 kl. 15:59 dansk tid (Jonas, Lovable SQL editor), FØR merget af #1172 og FØR Update. EFTER (15:59): efter_tabel 1 · efter_rls true · efter_policies 2 · efter_grant_authenticated true · efter_grant_anon false. Trin 2 (claude@topix.dk) er IKKE kørt endnu.
--
-- ⚠ RÆKKEFØLGEN ER IKKE VALGFRI: Update FØR denne migration lægger rådgivernes
-- forside og Netværket ned. Klienten læser public.tjenestekonti gennem
-- kraevRaekker (src/hooks/tjenestekonti.ts: hentTjenestekonti) — en manglende
-- tabel er en HentningsFejl, og hver liste, der filtrerer tjenestekonti
-- (Netværket, «Dine rådgivere», vælgerne, @-nævnelser), viser fejlteksten i
-- stedet for rækkerne. Filtret er fail-closed med vilje: hellere husets
-- fejltekst end kontoen vist som person.
--
-- MÅLINGEN FØR Update-klik (CLAUDE.md «Nye migrations»): EFTER-SELECT'en
-- nederst i trin 1 — forventet 1 · true · 2 · true · false. Den sidste række
-- (efter_grant_anon) er grunden til, at REST-målingen med anon-nøglen IKKE
-- duer her: `GET /rest/v1/tjenestekonti?select=user_id&limit=0` med anon-
-- nøglen kan ikke give 200, fordi anon bevidst ikke har SELECT (REVOKE ALL
-- herunder) — forventet 401 med kode 42501 «permission denied», mod 404
-- PGRST205 for en manglende tabel (IKKE MÅLT). Klienten læser som
-- authenticated; efter_grant_authenticated = true er det, der skal stå.
--
-- TJENESTEKONTI (30/9-2026 — Jonas' ja kl. 10:01): en rådgiverkonto for
-- claude@topix.dk, som Claude bruger i Claude-appens browser til at SE design og
-- opdateringer. KUN læsning; Jonas logger den ind én gang. To krav:
--   (1) kontoen logges IKKE ud efter 30 min inaktivitet (useInactivityLogout) —
--       alle andre beholder reglen uændret;
--   (2) kontoen optræder ikke som en PERSON nogen steder (netværket, «Dine
--       rådgivere», vælgere, @-nævnelser, klokke-mails …), men kan SE alt, en
--       rådgiver ser.
--
-- VALGET: en lille tabel, ikke en kolonne på profiles. Begrundelse:
--   * Filtret skal køre i KLIENTEN (get_all_advisor_profiles, get_member_directory
--     og get_community_medlemmer er SECURITY DEFINER og må ikke ændres — CLAUDE.md
--     FORBIDDEN). Klienten skal derfor kunne læse, HVEM der er tjenestekonto — også
--     et medlem, der ser netværket. profiles har self-only-læsning for medlemmer, så
--     en kolonne dér kunne kun læses af rådgivere; tabellen får sin egen, smalle
--     læseregel (kun user_id, intet andet).
--   * Skriveværnet bliver en policy alene: kun admin må indsætte/ændre/slette. En
--     kolonne på profiles ville kræve en ny BEFORE UPDATE-trigger, fordi profiles'
--     UPDATE-policy tillader egen række. Tabellen har INGEN klient-skrivevej for
--     andre end admin — ingen trigger, ingen ny funktion.
--   * Tilføjende: ingen eksisterende tabel, policy eller funktion røres.
--
-- HVAD ER SYNLIGT: user_id på tjenestekonti, for enhver indlogget. Et uuid på en
-- servicekonto er ikke en persondata-oplysning om et medlem; det er netop det,
-- klienten skal bruge til at lade kontoen ude. anon ser intet.
--
-- ─── TRIN 1 — kør hele blokken herunder (FØR, skriv, EFTER) ───────────────────

-- FØR: tabellen findes ikke (forventet: 0 rækker).
SELECT 'foer' AS sektion, count(*)::text AS vaerdi
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'tjenestekonti';

CREATE TABLE IF NOT EXISTS public.tjenestekonti (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  formaal text NOT NULL,
  oprettet_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tjenestekonti IS
  'Tjenestekonti (30/9-2026): rådgiverkonti, der bruges af en maskine (claude@topix.dk) til at SE platformen. Undtaget fra inaktivitets-logud (useAuth) og filtreret fra alle steder, hvor rådgivere vises som personer (src/lib/tjenestekonto.ts: erSynligRaadgiver; kildeværn tjenestekonto.guard). Kun admin skriver.';

ALTER TABLE public.tjenestekonti ENABLE ROW LEVEL SECURITY;

-- Læsning: enhver indlogget (medlemmer filtrerer netværket og «Dine rådgivere»).
CREATE POLICY "Indloggede ser tjenestekonti"
  ON public.tjenestekonti
  FOR SELECT
  TO authenticated
  USING (true);

-- Skrivning: KUN admin. has_role kaldes, den ændres ikke.
CREATE POLICY "Admin skriver tjenestekonti"
  ON public.tjenestekonti
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Rettighederne skrives ud i stedet for at lænes på projektets standard-
-- privilegier: klienten læser som authenticated (policyen afgør rækkerne),
-- admin skriver som authenticated (policyen afgør hvem); anon får intet.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tjenestekonti TO authenticated;
REVOKE ALL ON public.tjenestekonti FROM anon;

-- EFTER: tabellen, RLS, de to policies, og at klientens rolle (authenticated)
-- må læse, mens anon ikke må (forventet: 1 · true · 2 · true · false).
-- DETTE er målingen før Update-klik — se filhovedet.
SELECT 'efter_tabel' AS sektion, count(*)::text AS vaerdi
FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tjenestekonti'
UNION ALL
SELECT 'efter_rls', relrowsecurity::text FROM pg_class WHERE oid = 'public.tjenestekonti'::regclass
UNION ALL
SELECT 'efter_policies', count(*)::text FROM pg_policy WHERE polrelid = 'public.tjenestekonti'::regclass
UNION ALL
SELECT 'efter_grant_authenticated', has_table_privilege('authenticated', 'public.tjenestekonti', 'SELECT')::text
UNION ALL
SELECT 'efter_grant_anon', has_table_privilege('anon', 'public.tjenestekonti', 'SELECT')::text;

-- ─── TRIN 2 — SEPARAT, først når claude@topix.dk er oprettet som rådgiver ─────
-- Kør de tre udsagn herunder hver for sig (Lovables editor eksporterer kun
-- sidste resultatsæt). Indsættelsen er guarded: ON CONFLICT DO NOTHING, så en
-- allerede sat konto rammer 0 rækker og intet overskrives; en konto uden
-- advisor/admin-rolle rammer også 0 rækker (en tjenestekonto er en rådgiverkonto).
--
-- FØR (forventet: én række med user_id, har_rolle = true, er_tjenestekonto = false):
--   SELECT u.id AS user_id, u.email,
--          EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role IN ('advisor','admin')) AS har_rolle,
--          EXISTS (SELECT 1 FROM public.tjenestekonti t WHERE t.user_id = u.id) AS er_tjenestekonto
--   FROM auth.users u WHERE lower(u.email) = 'claude@topix.dk';
--
-- SKRIV (forventet: INSERT 0 1):
--   INSERT INTO public.tjenestekonti (user_id, formaal)
--   SELECT u.id, 'Claude — læser platformen i Claude-appens browser (Jonas 30/9-2026)'
--   FROM auth.users u
--   WHERE lower(u.email) = 'claude@topix.dk'
--     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role IN ('advisor','admin'))
--   ON CONFLICT (user_id) DO NOTHING;
--
-- EFTER (forventet: én række):
--   SELECT t.user_id, u.email, t.formaal, t.oprettet_at
--   FROM public.tjenestekonti t JOIN auth.users u ON u.id = t.user_id;
--
-- TILBAGERULNING (kun trin 2): DELETE FROM public.tjenestekonti
--   WHERE user_id = (SELECT id FROM auth.users WHERE lower(email) = 'claude@topix.dk');
