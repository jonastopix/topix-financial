-- Månedsdigesten slukkes for godt (beslutning: Jonas, 2026-09-11, «Sluk den»).
--
-- Digesten (send-monthly-digest, d. 22. kl. 08 UTC) samlede medlemmets
-- tal, milepæle og ulæste beskeder i én mail om måneden. Beslutningen
-- 11/9 var at slukke den. Funktionen, dens gate (_shared/digestGate),
-- milepælsteksten (_shared/digestMilepaele), admin-knapperne og
-- indstillingen «Månedsoverblik» er slettet i samme PR som denne fil
-- (oprydningen del 1, 13/9). Gemte monthly_digest-værdier i
-- profiles.notification_email_prefs bevares urørt (fletPraeferencer
-- overskriver kun kendte nøgler) — ingen backfill.
--
-- Tilstand målt 11/9 kl. 12:07: jobbet send-monthly-digest er allerede
-- fjernet MANUELT i prod med cron.unschedule('send-monthly-digest')
-- (FØR: jobid 550, '0 8 22 * *'; EFTER: 0 jobs — målt igen 12:18 og
-- 13/9). Men repoet schedulerer det stadig i
-- 20260810230000_cron_oprydning.sql:73-87 (og oprindeligt
-- 20260330182519, dag 5), så en gendannelse eller genkørsel af
-- oprydningen ville tænde det igen — mod en funktion der ikke findes.
-- Denne migration er værnet, efter 20260901110000-mønstret: den kan
-- køres uden effekt i dag (jobbet findes ikke; en nøgen
-- cron.unschedule ville KASTE) og slukker det i morgen, hvis det
-- genopstår.
--
-- Revert: kræver en NY beslutning og en ny funktion — send-monthly-digest
-- er slettet fra repoet, så en genkørsel af 20260810230000 ville blot
-- poste mod en 404.
--
-- DEPLOY: manuelt i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig). Forventet resultat i dag: 0 jobs
-- fjernet, SELECT'en nederst returnerer 0 rækker.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-monthly-digest') THEN
    PERFORM cron.unschedule('send-monthly-digest');
  END IF;
END $$;

-- Efter-verifikation: jobbet findes ikke.
SELECT jobid, jobname FROM cron.job WHERE jobname = 'send-monthly-digest';
