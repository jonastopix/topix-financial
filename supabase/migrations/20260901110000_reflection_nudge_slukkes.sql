-- Reflection-nudgen slukkes for godt (beslutning: Jonas, 2026-09-01).
--
-- En maskine der skriver i rådgiverens navn, uden at rådgiveren har set
-- beskeden, er ikke en påmindelse — det er en falsk besked fra et
-- menneske. Huset har afgjort det én gang før, da send-engagement-nudge
-- blev nedlagt ("creates false impressions of human contact and damages
-- trust"). Reflection-nudgen er samme klasse — nudge-report-no-reflection
-- poster en chat-besked MED den tildelte rådgivers sender_id — og P5 i
-- docs/email-flows.md efterlyste netop denne afgørelse
-- ("Policy-beslutning om reflection-nudgens persona … jf. princippet der
-- nedlagde engagement-nudgen").
--
-- Tilstand målt 1/9: jobbet daily-reflection-nudge er allerede fjernet
-- MANUELT i prod (cron.job indeholder ni jobs; dette er ikke et af dem)
-- — men repoet schedulerer det stadig i
-- 20260810230000_cron_oprydning.sql:58-71, så en gendannelse eller
-- genkørsel af oprydningen ville tænde det igen. Denne migration er
-- værnet: den kan køres uden effekt i dag (jobbet findes ikke) og
-- slukker det i morgen, hvis det genopstår.
--
-- Fokus-slot (g) på forsiden ("Tag stilling til dine tal", ærligt
-- afsender-løst) er fortsat refleksions-nudgens levende, ærlige form.
--
-- Funktionen nudge-report-no-reflection røres ikke i denne migration —
-- dens skæbne er rapporteret separat (cron-bogførings-PR'en).
--
-- Revert: kræver en NY beslutning, ikke en genkørsel af
-- 20260810230000 — og i så fald med en anden afsender-model end
-- rådgiverens navn.
--
-- DEPLOY: manuelt i Lovable -> SQL editor efter merge (CLAUDE.md —
-- migrationer auto-deployer aldrig). Forventet resultat i dag: 0 jobs
-- fjernet, SELECT'en nederst returnerer 0 rækker.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-reflection-nudge') THEN
    PERFORM cron.unschedule('daily-reflection-nudge');
  END IF;
END $$;

-- Efter-verifikation: jobbet findes ikke.
SELECT jobid, jobname FROM cron.job WHERE jobname = 'daily-reflection-nudge';
