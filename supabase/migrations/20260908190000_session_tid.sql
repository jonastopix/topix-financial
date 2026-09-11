-- KØRT i prod — målt 11/9 kl. 11:18 (session_bookings: kolonnerne start_tid og slut_tid timestamptz; policyen «Advisors read all session bookings» SELECT has_role(auth.uid(), 'advisor')).
-- Intro-sessionens tidspunkt (Jonas 8/9-2026, ~/Downloads/recon-introsessionen.md):
-- «hvem har afholdt deres intro-session med Morten — uden manuel markering.»
--
-- FUNDET: starttiden ANKOMMER allerede i Calendly-webhooken som
-- payload.scheduled_event.start_time / end_time (UTC) ved hver
-- invitee.created — og blev kastet væk (calendly-webhook/index.ts:92 gemte
-- kun status og calendly_event_uri). Statusserne siger ikke det man tror:
--   intro_session_used_at  «retten er brugt» — sat ved KLIK på book, før
--                          link, før tid, før møde; også i hånden af admin;
--                          nulstilles ved host-aflysning. RØRES IKKE — den
--                          er gaten mod to gratis.
--   booked                 «tid er valgt», ikke afholdt. Kun gratis-vejen.
--   (afholdt)              fandtes ikke. Nu: booked OG slut_tid passeret
--                          (src/lib/introSession.ts). «Udeblev» kan stadig
--                          ikke vides (kræver invitee_no_show i Calendly-
--                          abonnementet — ikke på plads).
--
-- TO KOLONNER, nullable: sat af calendly-webhook i SAMME update som
-- status = 'booked'. Null = rækken er fra før 8/9, eller payloaden bar ingen
-- scheduled_event (webhooken læser defensivt — en booking uden tid er bedre
-- end en webhook der kaster). Ved flytning sender Calendly invitee.canceled
-- (rescheduled=true), som webhooken lader ligge, og en ny invitee.created,
-- som overskriver status, URI og tid — den nye tid følger med af sig selv.
--
-- HISTORIK: rækker der allerede er 'booked' har URI men ingen tid. De kan
-- hentes bagud med ét kald pr. række: GET {calendly_event_uri} med Mortens
-- nøgle (MORTEN_CALENDLY_API_KEY) → resource.start_time / end_time.
-- Ikke bygget.
--
-- RLS: session_bookings havde kun «egen bruger» og «admin» på SELECT
-- (20260407114258:17-25). Virksomhedssiden er rådgiverens, og Morten er
-- ikke nødvendigvis admin — så rådgivere får SELECT på alle rækker (samme
-- mønster som 20260908150000). Ingen skriveadgang; ingen policy droppes.
-- SECURITY_BASELINE.md er opdateret i samme PR.
--
-- IKKE KØRT i prod. Køres i Lovable → SQL editor efter merge.

ALTER TABLE public.session_bookings
  ADD COLUMN IF NOT EXISTS start_tid TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slut_tid TIMESTAMPTZ;

COMMENT ON COLUMN public.session_bookings.start_tid IS
  'Mødets start (UTC) fra Calendly-webhookens payload.scheduled_event.start_time ved invitee.created. NULL = før 8/9-2026 eller ukendt. Rådgiver: se advisor-kolonnen.';
COMMENT ON COLUMN public.session_bookings.slut_tid IS
  'Mødets slut (UTC) fra payload.scheduled_event.end_time. «Afholdt» = status booked OG slut_tid passeret (src/lib/introSession.ts). NULL = ukendt, ikke afholdt.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_bookings'
      AND policyname = 'Advisors read all session bookings'
  ) THEN
    CREATE POLICY "Advisors read all session bookings"
      ON public.session_bookings
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'));
  END IF;
END $$;
