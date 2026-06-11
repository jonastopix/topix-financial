-- Snit 1: holdbar, virksomheds-bred "Kvitter" på advisor-dashboardet.
--
-- I dag er dashboard-"Kvitter, ser det" = ren lokal React-state (dismissItem) der
-- forsvinder ved reload. Denne tabel persisterer en kvittering på VIRKSOMHEDS-niveau
-- (advisor_id + company_id), så den dækker alle action-bunker på én gang og også
-- virker for rent finansielle signaler (bankovertræk, MoM-fald, alert) der ikke har
-- en konversationsrække at hænge på.
--
-- Semantik:
--   snoozed_until IS NULL   → "Klaret indtil noget nyt": virksomheden skjules fra
--                             action-bunkerne sålænge intet signal er NYERE end
--                             basis_at (se nedenfor).
--   snoozed_until > now()   → "Påmind om N dage": virksomheden skjules indtil dette
--                             tidspunkt, uanset signaler.
--   basis_at                → snapshot af det nyeste signal-tidsstempel på
--                             kvitteringstidspunktet (max af conversations.
--                             last_member_message_at, notifications.created_at,
--                             financial_report_facts.committed_at,
--                             financial_reports.uploaded_at for virksomheden).
--                             Køen sammenligner mod basis_at, så kvitteringen
--                             "slipper" virksomheden fri når et NYERE signal opstår.
--
-- Én aktiv kvittering pr. (advisor_id, company_id) — opdateres ved ny kvittering via
-- upsert (ON CONFLICT). Mønster (gen_random_uuid, RLS, has_role-gate) matcher
-- public.advisor_financial_actions (migration 20260407172908).

CREATE TABLE public.advisor_company_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMPTZ,            -- NULL = "Klaret indtil noget nyt"; fremtid = "Påmind om N dage"
  basis_at TIMESTAMPTZ NOT NULL,        -- nyeste signal-tidsstempel da der blev kvitteret
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (advisor_id, company_id)       -- én aktiv kvittering pr. advisor+virksomhed (upsert)
);

ALTER TABLE public.advisor_company_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Kun den ejende advisor må læse/skrive sine egne kvitteringer, og kun hvis
-- vedkommende har advisor-rollen (samme has_role-gate som husets øvrige
-- advisor-policies, fx public.advisor_financial_actions og conversations).
-- Medlemmer har ingen adgang (ingen policy matcher dem). advisor_id = auth.uid()
-- gør rækken ejer-scoped; admin arver advisor via has_role og ser/skriver kun
-- sine egne rækker.
CREATE POLICY "Advisors manage own company acknowledgments"
  ON public.advisor_company_acknowledgments
  FOR ALL
  TO authenticated
  USING (advisor_id = auth.uid() AND public.has_role(auth.uid(), 'advisor'))
  WITH CHECK (advisor_id = auth.uid() AND public.has_role(auth.uid(), 'advisor'));
