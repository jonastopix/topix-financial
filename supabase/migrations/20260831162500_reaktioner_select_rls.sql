-- message_reactions havde RLS slået til med INSERT og DELETE, men ingen
-- SELECT-politik. Skrivningen virkede; visningen var død. Målt 31/8:
-- 53 reaktioner i tabellen, sat mellem 18. marts og 20. juli af folk der
-- aldrig så resultatet.
--
-- Reaktioner er synlige præcis når beskeden er det: RLS på messages
-- afgør allerede hvem der må se hvad (company-scoped for medlemmer,
-- has_role for rådgivere, session_prep-carve-out fra 20260831131200).
-- Ved at spørge messages arver reaktionerne den dom frem for at gentage
-- den — én sandhed, ét sted.
--
-- Kørt manuelt i Lovable SQL editor 2026-08-31.
-- Verificeret som Rallysupports medlem: 46 beskeder synlige, 3
-- reaktioner — deres egne, ikke de øvrige halvtreds.

create policy "Users can view reactions on visible messages"
on public.message_reactions
for select
using (
  message_table = 'messages'
  and exists (
    select 1 from public.messages m
    where m.id = message_reactions.message_id
  )
);
