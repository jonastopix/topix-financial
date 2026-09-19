-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
-- Rører INGEN tabel, INGEN policy og INGEN funktion — kun cron-jobbets
-- kommando. Kan køres når som helst; næste kørsel bruger den nye form.
--
-- FEMTEN PÅ DAG 31 TAGER LÆNGERE END TREDIVE SEKUNDER
-- (recon-indgangspaamindelser §4, 19/9-2026).
--
-- Jobbet `indgangs-paamindelser` (jobid 544, «0 10 * * *») kalder gennem
-- public.kald_edge UDEN at oplyse en timeout og får derfor standarden,
-- kald_edge_standard_ms() = 30.000 ms. Det er en KLIENT-timeout: pg_net
-- lukker forbindelsen, og edge-funktionen AFBRYDES midt i løkken (målt 3/9
-- og igen 10/9, hvor hvert andet kald til process-notification-emails blev
-- klippet).
--
-- Cronen behandler rækkerne sekventielt. På dag 31 koster hver række op til
-- seks Stripe-kald (liste, kunde, faktura, linje, finalize, send) plus én
-- mail. Målt i drift 16/9 (docs/OVERLEVERING.md §11, ordret): dag 25-mailen
-- 12:57:20.253, dag 31-mailen 12:57:23.730 — ca. 3,5 sekunder for ÉN rækkes
-- faktura + mail. Webinarholdet skriver under samme aften, så alle rammer
-- dag 31 samme dag: 15 × 3,5 s ≈ 50 sekunder mod et loft på 30.
--
-- Intet går tabt ved en klipning — stemplet sættes pr. række, så de klippede
-- får deres faktura og mail næste døgn. Men fakturaerne kommer for sent i
-- forhold til mailens egen tekst, jobbets svar når aldrig frem (timed_out),
-- og vagten ser rødt uden at noget er galt.
--
-- TO HALVDELE, OG DE SKAL PASSE SAMMEN:
--   1. Jobbets timeout hæves 30 s → 120 s. Grænserne i kald_edge holder:
--      120.000 < kald_edge_loft_ms() (150.000, platformens «Request idle
--      timeout») og < jobbets eget interval (86.400.000 ms = et døgn).
--   2. Funktionen får budget_ms = 100.000 og stopper SELV efter 100 sekunder
--      — så når den at stemple, at svare, og at sige hvor mange der er
--      tilbage (`afbrudt: "tid"`, `resterende`). Budgettet skal ALTID være
--      mindre end timeouten; 20 sekunders margin til at skrive svaret.
--      Uden denne migration bruger funktionen sin egen standard på 25 s,
--      som ligger under de 30 — altså ingen regression, kun et lavere loft.
--   120 s / 100 s rækker til ca. 28 dag 31-rækker i én kørsel. Bliver holdet
--   større end det, er svaret ikke en højere timeout (150 s er loftet), men
--   et batch-loft i funktionen som ansoegning-rykker-cron:67.
--
-- FØR-SQL (én række; skriv svaret ned, det er rullebilletten):
--   SELECT jobid, jobname, schedule, active, command
--     FROM cron.job WHERE jobname = 'indgangs-paamindelser';
--   FACIT FØR (målt 16/9): jobid 544, «0 10 * * *», active t, kommandoen
--   uden både timeout og budget_ms.
--
-- EFTER-SQL: samme. FACIT EFTER: samme jobid og schedule, kommandoen bærer
--   nu 120000 og "budget_ms": 100000.
--
-- BEVIS I DRIFT (efter næste kørsel kl. 10:00 UTC):
--   SELECT id, status_code, timed_out, created, left(content, 400)
--     FROM net._http_response ORDER BY id DESC LIMIT 3;
--   Forventet: status_code 200, timed_out f, og i svaret
--   "afbrudt": null, "resterende": 0, "budget_ms": 100000 samt "varighed_ms".
--
-- ROLLBACK (tilbage til standarden — funktionen falder selv til 25 s):
--   SELECT cron.schedule('indgangs-paamindelser', '0 10 * * *',
--     $job$ SELECT public.kald_edge('indgangs-paamindelser-cron', '{"dry_run": false}'::jsonb); $job$);

-- cron.schedule med et kendt jobname OPDATERER jobbet (samme jobid) — det er
-- husets form fra 20260901112000 og kald_edge-omlægningen 10/9.
SELECT cron.schedule(
  'indgangs-paamindelser',
  '0 10 * * *',
  $job$
  SELECT public.kald_edge(
    'indgangs-paamindelser-cron',
    '{"dry_run": false, "budget_ms": 100000}'::jsonb,
    120000,      -- timeout: under kald_edge_loft_ms() (150 s)
    86400000     -- jobbets eget interval (et døgn) — kald_edge afviser en timeout der ikke er kortere
  );
  $job$
);

-- Efter-verifikation (kør med det samme, bogfør svaret i dette filhoved):
SELECT jobid, jobname, schedule, active,
       (command LIKE '%120000%')          AS har_timeout,
       (command LIKE '%"budget_ms": 100000%') AS har_budget,
       command
  FROM cron.job
 WHERE jobname = 'indgangs-paamindelser';
