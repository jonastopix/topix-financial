-- Migration: aktive opgavers forfalds-cron — 'active' -> 'expired' når
-- fristen har været passeret i mere end FORFALDSHENSTAND_DAGE (14) dage.
-- Bygget 11/9 2026 (de-tyve nr. 12: «Fristen var 4. september» var kun en
-- tekst; opgave-udloeb (20260901090000) rører kun proposed).
--
-- AFGJORT 11/9: 14 dages henstand EFTER due_date. En opgave der udløber
-- PÅ fristen straffer den der er en dag forsinket. 14 er B11's egen tid:
-- den der svarer «Ikke endnu» får 14 dage (opgaveEngine.udskyd) — den der
-- intet svarer, får det samme vindue, og ikke mere. Så er tavshed og
-- første udskydelse lige lange; efter det er tavsheden svaret.
--
-- STATUS 'expired', ikke not_done: not_done er medlemmets EGET udfald
-- («nåede det ikke», opgave-luk KLIENT_UDFALD) — en cron må ikke lægge
-- det ord i munden på nogen. expired er tavshedens udfald (design §7).
-- Overgangen active -> expired er tilføjet motoren i samme PR
-- (OVERGANGE i src/lib/opgaveEngine.ts og Deno-spejlet); den er stadig
-- ikke et klient-udfald. En udløbet OPGAVE kendes fra et udløbet FORSLAG på
-- accepted_at IS NOT NULL — det bruger opgoerTilstand og virksomhedssidens
-- «udløbne forslag»-tal (useVirksomhed), så de to ikke blandes.
--
-- REN SQL-CRON — samme beslutning som opgave-udloeb (1/9). Prædikatet
-- spejler motorens erUdloebetEfterForfald ORDRET (kalenderdag, ikke
-- tidspunkt; skarpt <, ligesom erForfalden — forfald er dagen EFTER
-- fristen, udløb er dagen efter de 14):
--   status = 'active' AND due_date IS NOT NULL
--   AND due_date + 14 < (now() AT TIME ZONE 'Europe/Copenhagen')::date
-- Frist 4/9: forfalden fra 5/9, udløber 19/9 (18/9 er dag 14 og IKKE
-- udløbet). Pariteten låses af
-- src/lib/__tests__/opgaveForfaldsCron.paritet.test.ts, som læser DENNE
-- fil — det eksisterende værn (opgaveUdloebsCron.paritet) læser
-- 20260901090000 og rører vi ikke; derfor et NYT jobnavn, ikke et andet
-- UPDATE under 'opgave-udloeb' (som ville erstatte den levende body uden
-- at det gamle værn så det — recon §1c).
--
-- KALENDERDAG I DANSK TID: due_date er en date, og motoren dømmer i
-- browserens dag. current_date i pg_cron er UTC-dagen — mellem 00:00 og
-- 02:00 dansk tid én dag for lidt. (now() AT TIME ZONE 'Europe/Copenhagen')
-- ::date er medlemmets dag. Et 04:10-UTC-job (06:10 DK) ligger uden for
-- de to timer; en manuel kørsel om natten gør ikke.
--
-- SET'et spejler luk()'s stempel: status = 'expired' OG closed_at = now().
-- Indekset idx_company_actions_due (20260822220000, partielt på due_date
-- hvor status = 'active') blev lagt til «de kommende cron-job» — dette.
-- RLS blokerer ikke: pg_cron kører body'en som postgres (tabelejeren).
-- Slot 04:10 UTC: ledigt (se 20260911000000 for kortet).
--
-- HVAD MEDLEMMET SER: opgaven forlader «Dine aftaler» (BoardroomView
-- henter open/proposed/active). Rådgiveren: forsidensDom's slags
-- «forfalden» (alvor 75) ophører for rækken — den er ikke længere aktiv.
--
-- BEVIS uden at vente — SELECT-modstykke med ORDRET samme WHERE:
--
--   SELECT id, company_id, source_type, due_date, deferral_count,
--          (now() AT TIME ZONE 'Europe/Copenhagen')::date - due_date AS dage_over_frist
--   FROM public.company_actions
--   WHERE status = 'active'
--     AND due_date IS NOT NULL
--     AND due_date + 14 < (now() AT TIME ZONE 'Europe/Copenhagen')::date
--   ORDER BY due_date;
--
-- Revert: SELECT cron.unschedule('opgave-forfald');
--   Lukkede rækker genåbnes ikke — expired er en sluttilstand.
--
-- IKKE KØRT. DEPLOY: manuelt i Lovable -> SQL editor efter merge.

-- ── 1. Idempotent unschedule-værn ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'opgave-forfald') THEN
    PERFORM cron.unschedule('opgave-forfald');
  END IF;
END $$;

-- ── 2. Jobbet ──
SELECT cron.schedule(
  'opgave-forfald',
  '10 4 * * *',
  $job$
  UPDATE public.company_actions
  SET status = 'expired',
      closed_at = now()
  WHERE status = 'active'
    AND due_date IS NOT NULL
    AND due_date + 14 < (now() AT TIME ZONE 'Europe/Copenhagen')::date;
  $job$
);

-- ── 3. Efter-verifikation: jobbet står aktivt ──
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname = 'opgave-forfald';
