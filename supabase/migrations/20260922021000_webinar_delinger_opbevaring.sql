-- KØRT i prod — 21/9-2026 kl. 21:15 (Jonas, Lovable SQL editor), efter merge, med en vagt først. EFTER: job 570, '52 4 * * *', aktiv.
-- TIDSSTEMPLET er 02:10 (omnummereret 21/9, da udkastet blev flyttet over på det nye grundlag;
-- det oprindelige «240000» er ikke et gyldigt klokkeslæt).
-- RÆKKEFØLGEN: EFTER 20260922020000_webinar_delinger.sql (tabellerne og protect_webinar_deling_spor
-- med cascade-undtagelsen — uden den ville denne DELETE fejle på sporet). Ingen edge function, ingen
-- udrulning: ren SQL i et cron-job.
--
-- BESLUTNING (Jonas 21/9-2026): OPBEVARING 12 MÅNEDER. En delings række og dens spor (IP, user-agent
-- for hver visning) slettes automatisk 12 måneder efter, at delingen er lukket eller udløbet — det
-- tidligste af lukket_at og udloeber_at, der er passeret:
--   least(coalesce(lukket_at, udloeber_at), udloeber_at) < now() - interval '12 months'
-- Ikke lukket → udloeber_at (skal være passeret, ellers er 12 måneder ikke gået). Lukket → det
-- tidligste af lukket_at og udloeber_at (lukket før udløb: lukket_at; lukket efter udløb: udloeber_at).
-- Et aktivt link (udloeber_at i fremtiden, ikke lukket) rammes aldrig — grænsen ligger 12 måneder
-- tilbage i tiden. Sporet tages af cascaden (webinar_deling_spor.deling_id on delete cascade;
-- protect_webinar_deling_spor tillader DELETE ved pg_trigger_depth() > 1).
--
-- ANTALLET I CRON-LOGGEN: sætningen er en BAR DELETE — pg_cron skriver kommandotag'et «DELETE n» i
-- cron.job_run_details.return_message, så antallet står i loggen uden en funktion.
--
-- SLOTTET: dagligt 04:52 UTC — målt 21/9 mod alle cron.schedule i migrationerne (inkl. udkastenes
-- klokke-mail 4-59/15 = :04/:19/:34/:49 og klaviyo-profil :17): minut 52 rammes af ingen plan, hverken
-- hver time (*/5, */15, 1-59/5, :07, :17, klokke-mail) eller på en fast tid (04:05, 04:10, 04:30,
-- 04:33 er de andre kl. 04). Låst af webinarDeling.guard dom 10 (kolliderer()).
-- cron.schedule med kendt jobname OPDATERER jobbet — husets form (10/9).

SELECT cron.schedule(
  'webinar-delinger-opbevaring',
  '52 4 * * *',
  $job$
  DELETE FROM public.webinar_delinger
   WHERE least(coalesce(lukket_at, udloeber_at), udloeber_at) < now() - interval '12 months';
  $job$
);

-- Efter-verifikation:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'webinar-delinger-opbevaring';
--   -- Næste morgen: antallet står i return_message («DELETE 0» de første 12 måneder):
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'webinar-delinger-opbevaring') ORDER BY start_time DESC LIMIT 3;
--   -- Prøven på udvælgelsen (rulles tilbage): en lukket deling fra for 13 måneder siden slettes med sit spor, en aktiv rammes ikke.
-- Revert: SELECT cron.unschedule('webinar-delinger-opbevaring');
