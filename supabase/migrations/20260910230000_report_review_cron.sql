-- «{periode} — gennemgå dine tal» når måneden er omme (10/9-2026, de-tyve nr. 10).
--
-- extract-financial-data skriver review-notifikationen kun ved parsingen, og
-- kun når resolveren siger eligible. En rapport uploadet i sin egen måned er i
-- regel 6 i det øjeblik og fik aldrig beskeden — heller ikke da måneden var omme
-- (mangelliste-kortet «En rapport for indeværende måned får aldrig sin
-- 'gennemgå dine tal'-mail», de 73 ventende). report-review-cron spørger
-- resolveren igen hver morgen for parsede rapporter uden facts og skriver den
-- SAMME besked (type, prioritet action_required, tekst, dedup_key) til dem der
-- nu kan godkendes. Dedup gør daglig kørsel harmløs; kl. 07:20 dansk tid, efter
-- report-reminder (09 UTC) er der luft — cron.timezone afgør UTC/dansk, se
-- kald_edge-migrationen. Kaldet går gennem kald_edge (URL, vault-nøgle, timeout).
--
-- FØRSTE KØRSEL rammer bagloggen: alle parsede-uden-facts fra afsluttede
-- måneder der er eligible og ikke blokerede (recon-tallene-tre.md §3c). Læs
-- tørkørslen først — den lister kandidaterne uden at skrive:
--   SELECT public.kald_edge('report-review-cron');  -- tom body = tørkørsel
--   SELECT status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 1;
--
-- SKREVET 10/9, IKKE KØRT. Kør 20260910220000 (regel 6 i dansk tid) FØRST.
-- Revert: SELECT cron.unschedule('report-review-cron');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'report-review-cron') THEN
    PERFORM cron.unschedule('report-review-cron');
  END IF;
END $$;

SELECT cron.schedule(
  'report-review-cron',
  '20 5 * * *',
  $job$ SELECT public.kald_edge('report-review-cron', '{"dry_run": false}'::jsonb) $job$
);
