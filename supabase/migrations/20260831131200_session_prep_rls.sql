-- Rådgiverens forberedelse til sessionen er skrevet til rådgiverens
-- øjne ("Founderen ser IKKE denne forberedelse", run-company-agent).
-- Indtil nu var beskyttelsen ét klient-filter i CompanyChatPane:
-- rækkerne blev hentet ned i medlemmets browser og kun skjult i
-- renderingen. Målt 31/8 som medlemmet selv: 18 af 44 beskeder i en
-- samtale var rådgiver-interne og hentbare.
--
-- ALTER frem for DROP + CREATE: der må ikke findes et vindue hvor
-- medlemmer ingen SELECT-politik har.
--
-- Rådgiverens egen SELECT ("Advisors can view all messages", has_role)
-- er permissiv og urørt — rådgivere ser dem fortsat, også i "Se som
-- medlem", hvor klient-filteret stadig skjuler dem.
--
-- Kørt manuelt i Lovable SQL editor 2026-08-31 13:12 UTC.
-- Verificeret: 44 → 26 synlige, 18 → 0 session_prep.

alter policy "Members can view own messages" on public.messages
using (
  context_type is distinct from 'session_prep'
  and exists (
    select 1 from conversations
    where conversations.id = messages.conversation_id
      and (
        conversations.member_id = auth.uid()
        or conversations.company_id = user_company_id(auth.uid())
      )
  )
);
