-- KØRT i prod — 21/9-2026 kl. 12:37 (Jonas, Lovable SQL editor), FØR merge. FØR-måling 12:24: ansoegning_beslutninger_handling_check med 16 værdier inkl. betalte_ikke, uden ikke_moedt; EFTER 12:37: 17 værdier med ikke_moedt lige efter afholdt. Calendly-hullet lukket fra 12:37.
-- Kan køres FØR merge — den tilføjer kun en værdi til en CHECK-liste, og motoren skriver
-- allerede handlingen (ansoegningMotor.ts:759–770, betingelsesløst h.art). Den SKAL være
-- kørt, før knappen «Kom ikke» bruges, og den lukker et hul, der findes i dag for Calendlys
-- no-show: beslutningsrækken for ikke_moedt afvises af basen (23514), overgangen udføres,
-- og sporet får ingen linje — logget som «beslutning kunne ikke skrives (overgangen er udført)».
--
-- MÅLT I PROD 21/9-2026 kl. 12:24 (Jonas) — ansoegning_beslutninger_handling_check, ordret:
--   CHECK ((handling = ANY (ARRAY['tal_med_dem','afvis','book','aflys_booking','afholdt','tilbud','afslag','underskrevet','svarer_ikke','udloeb','ikke_nu','luk','genaabn','saet_pause','genoptag','betalte_ikke'])))
--   16 værdier, betalte_ikke med (migrationen 20260919120000 er altså kørt), ikke_moedt mangler.
--
-- HVORFOR (Jonas 21/9, udkast-kom-ikke): «Kom ikke» bliver en knap på «afholdt» — køen markerer
-- afholdt ved samtalens sluttid, uanset om ansøgeren kom, og et «Giv afslag» ville takke for en
-- snak, der aldrig fandt sted. ikke_moedt står nu i BEGGE handlingslister i koden (som afholdt:
-- menneske OG system), sporet har ordet, og databasen skal kende værdien. Kildeværnet
-- enumsMatcherDatabasen.guard læser den SENESTE liste i migrationerne og kræver, at den er lig
-- MENNESKE_HANDLINGER ∪ SYSTEM_HANDLINGER (17 værdier).
--
-- FØR-SQL (én række — gem CSV):
--   select conname, pg_get_constraintdef(oid) as def
--     from pg_constraint
--    where conrelid = 'public.ansoegning_beslutninger'::regclass and conname = 'ansoegning_beslutninger_handling_check';
--   FACIT FØR: 16 værdier som ovenfor, uden 'ikke_moedt'.
--
-- ROLLBACK (kun hvis ingen række bærer ikke_moedt — ellers afviser add'et):
--   alter table public.ansoegning_beslutninger drop constraint if exists ansoegning_beslutninger_handling_check;
--   alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
--     check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn', 'saet_pause', 'genoptag', 'betalte_ikke'));

alter table public.ansoegning_beslutninger drop constraint if exists ansoegning_beslutninger_handling_check;
alter table public.ansoegning_beslutninger add constraint ansoegning_beslutninger_handling_check
  check (handling in ('tal_med_dem', 'afvis', 'book', 'aflys_booking', 'afholdt', 'ikke_moedt', 'tilbud', 'afslag', 'underskrevet', 'svarer_ikke', 'udloeb', 'ikke_nu', 'luk', 'genaabn', 'saet_pause', 'genoptag', 'betalte_ikke'));

-- EFTER-SQL (samme som FØR): def skal indeholde 'ikke_moedt' — 17 værdier.
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.ansoegning_beslutninger'::regclass and conname = 'ansoegning_beslutninger_handling_check';
