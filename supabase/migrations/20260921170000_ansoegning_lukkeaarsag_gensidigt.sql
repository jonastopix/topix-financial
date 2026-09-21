-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- Kan køres FØR eller EFTER merge: den tilføjer kun en værdi til en CHECK-liste. Men den
-- SKAL være kørt, før Update klikkes — ellers afviser basen «Luk uden svar» med årsagen
-- «Gensidigt ikke et match» (23514), og rådgiveren får en fejl-toast.
--
-- NY LUKKEÅRSAG «gensidigt_ikke_match» (Jonas 21/9-2026, udkast-afslag-luk): efter
-- afklaringssamtalen kan ansøgeren og vi være enige om, at det ikke er et match. Det er
-- IKKE et afslag (afslag sender altid afslagsmailen, 20/9) — det er en lukning UDEN mail,
-- med en årsag, der siger det, som det er. Knappen hedder «Luk uden svar».
--
-- DEN FULDE LISTE SKRIVES — også «betalte_ikke»: migrationen 20260919120000 (#1011), der
-- tilføjede den, er bogført IKKE KØRT (mangellisten «Fjorten migrationer»; OVERLEVERING DEL 2
-- «18. september» §14), og prod er umålt. Denne migration virker uanset: drop if exists + add
-- med alle ni værdier = LUKKEAARSAGER i koden (enumsMatcherDatabasen.guard læser den SENESTE
-- liste i migrationerne og kræver, at den er lig koden).
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select conname, pg_get_constraintdef(oid) as def
--     from pg_constraint
--    where conrelid = 'public.ansoegninger'::regclass and conname = 'ansoegninger_lukkeaarsag_check';
--   FACIT FØR: én række; def indeholder 'andet' og ENTEN 7 værdier (uden betalte_ikke — 20260919120000
--   ikke kørt) ELLER 8 (med). Skriv hvilket her: ______
--
-- ROLLBACK (kun hvis ingen række bærer den nye værdi — ellers afviser add'et):
--   alter table public.ansoegninger drop constraint if exists ansoegninger_lukkeaarsag_check;
--   alter table public.ansoegninger add constraint ansoegninger_lukkeaarsag_check
--     check (lukkeaarsag is null or lukkeaarsag in ('afslag_efter_ansoegning', 'afslag_efter_samtale', 'svarer_ikke', 'udloebet', 'trak_sig', 'dublet', 'andet', 'betalte_ikke'));

alter table public.ansoegninger drop constraint if exists ansoegninger_lukkeaarsag_check;
alter table public.ansoegninger add constraint ansoegninger_lukkeaarsag_check
  check (lukkeaarsag is null or lukkeaarsag in ('afslag_efter_ansoegning', 'afslag_efter_samtale', 'svarer_ikke', 'udloebet', 'trak_sig', 'dublet', 'gensidigt_ikke_match', 'andet', 'betalte_ikke'));

-- EFTER-SQL (samme som FØR): def skal indeholde 'gensidigt_ikke_match' OG 'betalte_ikke' — ni værdier.
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.ansoegninger'::regclass and conname = 'ansoegninger_lukkeaarsag_check';
