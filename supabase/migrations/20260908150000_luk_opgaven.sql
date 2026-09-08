-- Lukningen af en opgave på rådgiverens forside (Jonas 8/9-2026):
-- «Færdiggjort» og «Ikke relevant». Ingen «Udsæt».
--
-- advisor_company_acknowledgments (20260611101500) bar en snooze-model
-- (snoozed_until / basis_at) som AdvisorDashboard læste og skrev 11/6–21/8;
-- siden 21/8 (84936ca9) læser og skriver INGEN den. Den genbruges nu som
-- en LOG over lukninger, ikke en tilstand:
--   udfald      'faerdiggjort' | 'ikke_relevant' — de to handlinger, skelnet
--               i data (loggen skal kunne måle om en signaltype systematisk
--               fravælges, forsiden-design §7).
--   grundlag    jsonb: grundens nøgle → det dommen byggede på, for hver grund
--               på linjen da den blev lukket (src/lib/opgaveLukning.ts).
--               Dommen læser den NYESTE række med grundlag pr. virksomhed
--               og lukker en grund KUN når dens grundlag er præcis det
--               gemte — noget nyt gør den levende igen.
-- Gamle rækker (udfald/grundlag NULL) er den gamle model og ignoreres af
-- dommen; de røres ikke.
--
-- UNIQUE (advisor_id, company_id) FJERNES: den lå til upsert af én tilstand
-- pr. rådgiver+virksomhed; loggen skal have én række pr. lukning. Ingen
-- policy droppes.
--
-- LÆSNING PÅ TVÆRS AF RÅDGIVERE (ny SELECT-policy): opgaven er
-- VIRKSOMHEDENS, ikke rådgiverens — lukker Morten Doggybed, skal Jonas ikke
-- se «Tag det op med Doggybed». Skrivning er stadig kun egne rækker
-- (advisor_id = auth.uid()) via den eksisterende FOR ALL-policy; den nye
-- policy er kun SELECT, kun has_role advisor (admin arver). Medlemmer har
-- fortsat ingen policy der matcher. SECURITY_BASELINE.md er opdateret i
-- samme PR.

ALTER TABLE public.advisor_company_acknowledgments
  ADD COLUMN IF NOT EXISTS udfald TEXT
    CHECK (udfald IS NULL OR udfald IN ('faerdiggjort', 'ikke_relevant')),
  ADD COLUMN IF NOT EXISTS grundlag JSONB;

COMMENT ON COLUMN public.advisor_company_acknowledgments.udfald IS
  'Lukningen (8/9): faerdiggjort | ikke_relevant. NULL = gammel snooze-række, ignoreres af dommen.';
COMMENT ON COLUMN public.advisor_company_acknowledgments.grundlag IS
  'Grundens nøgle → grundlag da linjen blev lukket (src/lib/opgaveLukning.ts). NULL = gammel række.';

-- Kræver prod-tjek af navnet: SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.advisor_company_acknowledgments'::regclass AND contype = 'u';
ALTER TABLE public.advisor_company_acknowledgments
  DROP CONSTRAINT IF EXISTS advisor_company_acknowledgments_advisor_id_company_id_key;

CREATE INDEX IF NOT EXISTS advisor_company_acknowledgments_company_nyeste_idx
  ON public.advisor_company_acknowledgments (company_id, acknowledged_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'advisor_company_acknowledgments'
      AND policyname = 'Advisors read all company acknowledgments'
  ) THEN
    CREATE POLICY "Advisors read all company acknowledgments"
      ON public.advisor_company_acknowledgments
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'));
  END IF;
END $$;
