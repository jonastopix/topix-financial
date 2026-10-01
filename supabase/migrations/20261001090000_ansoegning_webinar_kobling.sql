-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- WEBINARKOBLINGEN (udkast 1/10-2026 — Jonas 1/10 08:25: «forslag + klik»).
--
-- PROBLEMET (målt i prod 30/9 nat): en ansøger, der blev medlem, har
-- `kilde = direkte`, og ingen webinartilmelding har hendes mail — men en
-- sandsynlig tilmelding findes under en anden (privat) mail. Tragten på
-- /webinar kobler ansøgning ↔ tilmelding KUN på lower(email), så hun tæller ikke.
--
-- LØSNINGEN: platformen FORESLÅR en kobling (src/lib/webinar/kobling.ts:
-- foreslaaWebinarKobling — navn og/eller telefon, højst 90 dage før ansøgningen),
-- en RÅDGIVER bekræfter med ét klik, og først da tæller tragten den
-- (dashboard.ts: medWebinarKobling — som om mailen matchede). Denne tabel er
-- klikket: én række pr. ansøgning (UNIQUE), og en fejlkobling kan fjernes (DELETE).
--
-- ADGANG: rådgivere (has_role(auth.uid(), 'advisor') — admin arver advisor)
-- SELECT/INSERT/DELETE. INGEN medlemsadgang, ingen UPDATE (en kobling rettes
-- ved at fjerne den og koble igen — så `koblet_af`/`koblet_at` altid er klikkets).
-- anon intet. Ingen SECURITY DEFINER, ingen trigger, ingen ny funktion;
-- has_role / user_company_id / handle_new_user røres ikke. Policies er
-- PERMISSIVE og giver kun JA til rådgivere — der er intet at nægte, så ingen
-- RESTRICTIVE er nødvendig (SECURITY_BASELINE §5).
--
-- `koblet_af` = auth.uid() (default), og INSERT-policyen KRÆVER det — en
-- rådgiver kan ikke koble i en andens navn.
--
-- FK'erne: ansoegning_id ON DELETE CASCADE (ansøgningen væk → koblingen væk);
-- tilmelding_id ON DELETE CASCADE også — en slettet tilmelding (persondata) må
-- aldrig blive holdt tilbage af en kobling, og uden tilmeldingen er der intet
-- at koble til.
--
-- webinar-delt (service role) læser tabellen gennem sin egen nøgle; RLS gælder
-- ikke service role, og der gives ingen ekstra policy til den.
--
-- RÆKKEFØLGEN: denne migration KØRT og MÅLT (EFTER-SELECT'en herunder) →
-- eksplicit udrulning af `webinar-delt` (beviset: et delt-svar svarer stadig
-- 200 — functionen er fail-soft på en manglende tabel, så beviset for den NYE
-- kode er, at en kobling flytter delingens tal) → Update. Fladen og
-- dashboard-hooken er ligeledes fail-soft på en manglende tabel
-- (erManglendeTabel), så en Update før migrationen lægger intet ned — men
-- knappen «Kobl til webinaret» vises først, når tabellen findes.
--
-- ─── FØR (forventet: tabel 0) ────────────────────────────────────────────────
-- SELECT 'foer' AS sektion, count(*)::text AS vaerdi
-- FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'ansoegning_webinar_kobling';
--
-- ─── EFTER (forventet: tabel 1 · rls true · policies 3 (SELECT, INSERT, DELETE;
--     alle {authenticated}) · unik 1 · grant_anon false · grant_update false) ──
-- SELECT 'tabel' AS sektion, count(*)::text AS vaerdi FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'ansoegning_webinar_kobling'
-- UNION ALL
-- SELECT 'rls', relrowsecurity::text FROM pg_class WHERE oid = 'public.ansoegning_webinar_kobling'::regclass
-- UNION ALL
-- SELECT 'policy', concat(policyname, ' | ', cmd, ' | ', roles::text, ' | ', permissive) FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'ansoegning_webinar_kobling'
-- UNION ALL
-- SELECT 'unik', count(*)::text FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'ansoegning_webinar_kobling' AND indexdef ILIKE '%UNIQUE%(ansoegning_id)%'
-- UNION ALL
-- SELECT 'grant_anon', has_table_privilege('anon', 'public.ansoegning_webinar_kobling', 'SELECT')::text
-- UNION ALL
-- SELECT 'grant_update', has_table_privilege('authenticated', 'public.ansoegning_webinar_kobling', 'UPDATE')::text;

CREATE TABLE IF NOT EXISTS public.ansoegning_webinar_kobling (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ansoegning_id uuid NOT NULL REFERENCES public.ansoegninger(id) ON DELETE CASCADE,
  tilmelding_id uuid NOT NULL REFERENCES public.webinar_tilmeldinger(id) ON DELETE CASCADE,
  koblet_af     uuid NOT NULL DEFAULT auth.uid(),
  koblet_at     timestamptz NOT NULL DEFAULT now(),
  -- Forslagets grund i ord, som rådgiveren så den («Samme fulde navn — men en anden mail»).
  grund         text,
  CONSTRAINT ansoegning_webinar_kobling_en_pr_ansoegning UNIQUE (ansoegning_id)
);

CREATE INDEX IF NOT EXISTS ansoegning_webinar_kobling_tilmelding_idx
  ON public.ansoegning_webinar_kobling (tilmelding_id);

COMMENT ON TABLE public.ansoegning_webinar_kobling IS
  'Webinarkoblingen (1/10-2026): en rådgiverbekræftet kobling mellem en ansøgning og en webinartilmelding under en ANDEN mail. Foreslås af src/lib/webinar/kobling.ts (navn/telefon, ≤ 90 dage før), tæller i tragten som et mail-match (dashboard.ts: medWebinarKobling). Én pr. ansøgning; rådgivere SELECT/INSERT/DELETE, ingen medlemsadgang.';

ALTER TABLE public.ansoegning_webinar_kobling ENABLE ROW LEVEL SECURITY;

-- DROP POLICY IF EXISTS herunder: KUN for at kunne køre filen igen (idempotens) på
-- en tabel, denne migration selv opretter — ingen eksisterende policy fjernes.

REVOKE ALL ON public.ansoegning_webinar_kobling FROM anon;
REVOKE ALL ON public.ansoegning_webinar_kobling FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.ansoegning_webinar_kobling TO authenticated;

DROP POLICY IF EXISTS "Advisors can view webinar kobling" ON public.ansoegning_webinar_kobling;
CREATE POLICY "Advisors can view webinar kobling"
  ON public.ansoegning_webinar_kobling FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

DROP POLICY IF EXISTS "Advisors can insert webinar kobling" ON public.ansoegning_webinar_kobling;
CREATE POLICY "Advisors can insert webinar kobling"
  ON public.ansoegning_webinar_kobling FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor') AND koblet_af = auth.uid());

DROP POLICY IF EXISTS "Advisors can delete webinar kobling" ON public.ansoegning_webinar_kobling;
CREATE POLICY "Advisors can delete webinar kobling"
  ON public.ansoegning_webinar_kobling FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));
