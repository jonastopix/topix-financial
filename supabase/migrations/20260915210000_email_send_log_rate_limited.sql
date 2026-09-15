-- email_send_log: statusreglen skal tillade 'rate_limited' (15/9-2026).
-- KØRES MANUELT i Lovable → SQL editor (CLAUDE.md: db push virker ikke).
-- Denne fil er bogføringen, så laget kan genskabes fra repoet.
--
-- HVORFOR: siden #857 (14/9) dømmer _shared/managedEmail.ts et 429 fra
-- Lovables mail-API som rate_limited (mailFejl.ts:71-75) og forsøger at
-- logge rækken med den status (managedEmail.ts:139). log() indsætter
-- (:105) og gør ved fejl kun console.error (:106-110) — filhovedet :64
-- siger «Kaster aldrig». Prod HAR en CHECK på status uden rate_limited, så
-- rækken afvises og forsvinder: køen stopper korrekt (skalKoeStoppe), men
-- et 429 efterlader intet spor i email_send_log. Målt 15/9: sent 216,
-- failed 11, ingen rate_limited de sidste 7 dage.
--
-- FØR (målt i prod 15/9-2026, query-results-export-2026-09-15_20-58-05.csv), ordret:
--   email_send_log_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])))
--
-- OPRINDELSEN: reglen stammer fra 20260319090407_email_infra.sql (CREATE
-- TABLE :32 og backfill :79-83), som Lovable-commit 68d86a46 slettede 8/9
-- — filen forsvandt, reglen blev i prod. Ingen migration i repoet nævnte
-- constrainten før denne (grep 15/9). Kommentarerne «text uden CHECK» i
-- dagskvote.ts og mailFejl.ts pegede på 20260226224654 (CREATE TABLE uden
-- CHECK) og var forkerte om prod.
--
-- HVAD: kun 'rate_limited' tilføjes. Koden skriver i dag sent, failed,
-- rate_limited og suppressed (managedEmail.ts:139 og :152 via
-- mailFejl.ts:71-75) samt bounced, complained og suppressed
-- (handle-email-events/index.ts:49-55). pending og dlq er arv fra den
-- gamle kø og beholdes. Ingen anden ændring.
--
-- BEVIS, før og efter:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'email_send_log_status_check';
-- Værn i repoet: src/lib/__tests__/emailSendLogStatus.guard.test.ts.

BEGIN;

ALTER TABLE public.email_send_log
  DROP CONSTRAINT IF EXISTS email_send_log_status_check;

ALTER TABLE public.email_send_log
  ADD CONSTRAINT email_send_log_status_check
  CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq', 'rate_limited'));

COMMIT;
