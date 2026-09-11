-- KØRT i prod — målt 11/9 kl. 09:20 (pg_policies på messages: «Advisors can delete messages», «Users can delete own messages within 15 min»).
-- Sletning af chatbeskeder får samme grænse som redigering (10/9-2026,
-- recon-sikkerhed-og-toast.md §1). SKREVET, IKKE KØRT. Deploy manuelt i
-- Lovable → SQL editor efter merge (CLAUDE.md). Idempotent (DROP IF EXISTS).
--
-- MÅLT I REPOET: to DELETE-policies lå oven på hinanden —
--   «Members can delete own messages»  (20260310193358:29)
--       sender_id = auth.uid() AND EXISTS (samtalen er min)
--   «Users can delete own messages»    (20260317143551:28)
--       sender_id = auth.uid() OR has_role(auth.uid(), 'advisor')
-- Permissive policies stakker med OR, så den bredeste vandt alene: enhver
-- egen besked, uanset alder og message_type — mens UPDATE siden 3/9 har
-- «within 15 min». Fladen var enig (useMessageActions.canDelete = sender).
-- Et medlem kunne fjerne en tre måneder gammel besked om en aftale, også
-- for rådgiveren der havde svaret på den. messages har ingen deleted_at og
-- ingen slette-log — en sletning efterlader intet spor.
--
-- AFGJORT (Jonas/Claude 10/9): sletning = redigering. Medlemmer: egne
-- beskeder af typen 'user', inden for 15 minutter. Rådgivere: uændret bredt
-- (papirkurven i RapporteringView rydder rapportbeskeder op ad den vej, og
-- fladen viser stadig kun slet på egne). Reglen ERSTATTER de to gamle —
-- en indskrænkning kan ikke tilføjes som en ny permissive policy
-- (SECURITY_BASELINE §5, 3/9-lærdommen). Klienten har samme regel i
-- src/lib/beskedRegler.ts (kanSletteBesked), så knappen forsvinder når
-- databasen ville sige nej.
--
-- Revert: kør ROLLBACK-blokken nederst.

DROP POLICY IF EXISTS "Members can delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own messages within 15 min" ON public.messages;
DROP POLICY IF EXISTS "Advisors can delete messages" ON public.messages;

CREATE POLICY "Users can delete own messages within 15 min"
ON public.messages
FOR DELETE
TO authenticated
USING (
  sender_id = auth.uid()
  AND message_type = 'user'
  AND created_at > now() - interval '15 minutes'
);

CREATE POLICY "Advisors can delete messages"
ON public.messages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'advisor'::app_role));

-- ── VERIFIKATION ─────────────────────────────────────────────────────────
--   SELECT policyname, roles, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'DELETE'
--   ORDER BY policyname;
-- Forventet: præcis 2 rækker — «Advisors can delete messages» og
-- «Users can delete own messages within 15 min».
--
-- ── ROLLBACK (genåbner sletning uden tidsgrænse) ─────────────────────────
--   DROP POLICY IF EXISTS "Users can delete own messages within 15 min" ON public.messages;
--   DROP POLICY IF EXISTS "Advisors can delete messages" ON public.messages;
--   CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE
--     USING (sender_id = auth.uid() OR public.has_role(auth.uid(), 'advisor'::app_role));
