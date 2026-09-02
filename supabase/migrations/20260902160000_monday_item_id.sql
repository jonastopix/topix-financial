-- Monday-item'et som nøgle: ét item = én virksomhed, uanset om CVR er udfyldt.
-- Skrevet 2/9; køres MANUELT i Lovable -> SQL editor (CLAUDE.md —
-- migrationer auto-deployer aldrig). Denne fil er bogføringen.
--
-- PROBLEMET, målt 2/9: monday-webhook havde ingen event-dedup. Ved
-- «Godkendt» to gange UDEN gyldigt CVR blev der oprettet to virksomheder,
-- to linkrækker, to tokens og to dag 0-mails for samme ansøger. Med CVR
-- kunne to SAMTIDIGE kald begge passere CVR-opslaget før den andens insert
-- (race) — samme udfald.
--
-- HVORFOR MONDAY-ITEM'ET: det er den eneste nøgle der findes for en
-- ansøger FØR virksomheden eksisterer. CVR kan være tomt, mailen kan
-- ændres, navnet kan staves om — item-id'et er det samme fra ansøgning til
-- godkendelse.
--
-- PARTIEL UNIK-INDEX, ikke en constraint: rækker oprettet ad andre veje
-- (rådgiverens import, manuelle) har null og skal kunne være mange.
-- Indekset er samtidig værnet mod racen: taber den anden af to samtidige
-- inserts på det, får webhooken 23505 og svarer «allerede behandlet».

alter table public.company_betalingslink
  add column if not exists monday_item_id bigint;

create unique index if not exists company_betalingslink_monday_item_unik
  on public.company_betalingslink (monday_item_id)
  where monday_item_id is not null;

comment on column public.company_betalingslink.monday_item_id is
  'Monday-item''et (pulseId) der udløste «Godkendt». Den eneste nøgle der findes for en ansøger FØR virksomheden eksisterer: CVR kan være tomt, mailen kan ændres, navnet kan staves om. Partielt unikt (where not null): ét item giver højst én linkrække, mens rækker fra import/manuel oprettelse har null. monday-webhook slår op her før noget oprettes.';
