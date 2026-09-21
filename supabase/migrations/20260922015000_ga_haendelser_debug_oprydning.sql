-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
-- RÆKKEFØLGEN: EFTER 20260922010000_ga_haendelser.sql (kørt i prod 21/9 kl. 17:48) og FØR
-- udrulningen af den rettede ga-send-cron. Den skal køres, INDEN beviset tages om.
--
-- TIDSSTEMPLET er 01:50 — mellem ga-send (20260922011000) og webinar-delingen (20260922020000).
-- Den hører kronologisk dér: den retter ga-send og skal køres i aften, før de to øvrige udkast.
--
-- HVORFOR (rettelse 21/9 aften, fejl i #1073): en debug-kørsel af ga-send-cron
-- (dry_run: false + debug: true) rammer Googles VALIDERINGSSERVER — «Events sent to the
-- validation server don't show up in reports» — men den skrev alligevel sporet med udfald
-- «sendt» og sendt_at sat. maaForsoeges dømmer på udfaldet, så den RIGTIGE afsendelse bagefter
-- sprang hændelsen over som «allerede_sendt». README's egen bevisrækkefølge (bevis 2 debug →
-- bevis 3 rigtig) ville altså have spist sig selv: valideringen ville have blokeret beviset.
--
-- Koden er rettet (skalSkriveSpor: en debug-kørsel skriver kun valideringens NEJ), men en
-- allerede skrevet række bliver ikke rigtig af det. Denne migration fjerner dem.
--
-- IDEMPOTENT OG UFARLIG: den rører kun rækker, der ER en debug-validering (debug = true) OG
-- står som «sendt». Rigtige afsendelser har debug = false og røres aldrig. Har ingen kørt
-- bevis 2 endnu, sletter den nul rækker — og så er det bare en bogført no-op.
--
-- FØR-SQL (gem svaret):
--   select event_id, art, udfald, debug, sendt_at from public.ga_haendelser order by sidste_forsoeg_at desc;
--   FACIT FORVENTET: enten tom, eller rækker med debug = true og udfald = 'sendt'.

delete from public.ga_haendelser
 where debug = true
   and udfald = 'sendt';

-- EFTER-tjek (kør og gem):
--   select count(*) as debug_sendt_tilbage from public.ga_haendelser where debug = true and udfald = 'sendt';  -- 0
--   select event_id, udfald, debug, sendt_at from public.ga_haendelser order by sidste_forsoeg_at desc limit 10;
-- ROLLBACK: ingen — de slettede rækker var usande (de sagde «sendt» om noget, Google aldrig
-- modtog). Skal beviset tages om, køres det bare igen mod den rettede function.
