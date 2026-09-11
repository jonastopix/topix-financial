-- KØRT i prod — målt 11/9 kl. 09:20 (fem policies på email_send_log, «Advisors can read send log» SELECT for authenticated med).
-- Advisor må LÆSE email_send_log — den tredje ting omdøbningen 19/3 tog med sig.
--
-- HVORFOR POLICYEN MANGLEDE
--   Den oprindelige tabel (20260226224654) havde "Advisors can view send log"
--   (SELECT, has_role advisor) og "Advisors can insert send log". Den 19/3
--   blev tabellen omdøbt til email_send_log_legacy (20260319090354), og en ny
--   email_send_log blev oprettet (20260319090407) med KUN service-role-policies;
--   2/4 kom "Admins can read send log" til (20260402090243). Policies følger
--   tabellen ved omdøbning, så advisor-policyen sidder i dag på legacy-tabellen,
--   som intet skriver til. Målt i prod 7/9: fire policies på den levende tabel —
--   tre service-role og én admin. Jonas har advisor + admin; Morten har KUN
--   advisor og kan derfor ikke se e-mail-loggen nogen steder. Samme omdøbning
--   tog kolonnerne sent_at og template_id (rettet i koden 7/9, #701).
--
-- HVAD LOGGEN INDEHOLDER
--   Én række pr. statusskift pr. mail: modtager (recipient_email), emne
--   (subject), skabelon (template_name), status (pending/sent/failed/…),
--   fejltekst, message_id, tidspunkt og et lille metadata-felt. IKKE mailens
--   indhold — html'en ligger kun i køens payload og forsvinder med den.
--
-- HVAD DER GIVES
--   KUN SELECT. Ikke INSERT, ikke UPDATE: skriverne er service-role
--   (process-email-queue og afsenderfunktionerne), og en advisor skal ikke
--   kunne skrive i en log. Policyen er permissiv og lægger sig VED SIDEN AF
--   "Admins can read send log" — admin arver advisor (has_role), så admin
--   læser stadig; en advisor uden admin læser nu også.
--
-- FORUDSÆTNINGEN (besluttet af Jonas 7/9), ordret:
--   Dette gælder mens advisor betyder «Jonas eller Morten». Kommer der en
--   ekstern rådgiver, skal adgangen genovervejes — advisor er da ikke længere
--   det samme som huset. Rollerne advisor og admin findes, men bruges ikke
--   konsekvent til at skelne huset fra en tredjepart (mangellisten: «Advisor
--   og admin er ikke skilt ad»). Skal skellet bruges, er denne policy for bred
--   og skal erstattes — fx af en læsevej der kun viser rådgiverens egne
--   virksomheders mails.
--
-- Køres i hånden i Lovables SQL editor (huset deployer ikke migrationer
-- automatisk). Idempotent: samme form som de øvrige policies på tabellen.
-- Verificér før/efter:
--   SELECT policyname, cmd, roles, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'email_send_log' ORDER BY policyname;

DO $$ BEGIN
  CREATE POLICY "Advisors can read send log"
    ON public.email_send_log FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'advisor'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
