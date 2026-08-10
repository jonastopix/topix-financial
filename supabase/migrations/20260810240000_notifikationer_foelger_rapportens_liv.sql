-- Spærre: en notifikation må aldrig overleve sin rapport som et krav.
--
-- Baggrund: 11 kodeveje får en rapport til at forsvinde (7 soft-delete,
-- 4 hard-delete) fordelt på 5 filer i klient og server. De to
-- eksisterende værn dækker ikke: klientsidens clearReportReviewNotification
-- er RLS-begrænset og rammer 0 rækker når en rådgiver sletter et medlems
-- rapport (fejlspor 2026-07-22), og serversidens dispose i
-- send-notification-email sætter kun email_sent_at — aldrig
-- in-app-tilstanden. Der er ingen fremmednøgle fra reference_id.
--
-- Derfor databaseniveau: en spærre der kan glemmes, er ingen spærre.
--
-- Dispose, aldrig slet: papirkurven har en gendan-vej, og datatab er
-- uigenkaldeligt hvor inertitet ikke er.
--
-- Deep-linket afvæbnes ved at strippe querystringen: /reports?reportId=X
-- bliver /reports, /members/<uid>?reportId=X bliver /members/<uid>.
-- Hver sti er gyldig alene. Feltet sættes ALDRIG til null.

CREATE INDEX IF NOT EXISTS idx_notifications_report_reference
  ON public.notifications (reference_id)
  WHERE reference_type = 'report';

CREATE OR REPLACE FUNCTION public.dispose_report_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _report_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _report_id := OLD.id;
  ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    _report_id := NEW.id;
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.notifications
  SET seen_at       = COALESCE(seen_at, now()),
      read_at       = COALESCE(read_at, now()),
      email_sent_at = COALESCE(email_sent_at, now()),
      deep_link     = COALESCE(
                        NULLIF(regexp_replace(COALESCE(deep_link, ''), '\?.*$', ''), ''),
                        deep_link
                      )
  WHERE reference_type = 'report'
    AND reference_id = _report_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_dispose_notifications_soft_delete ON public.financial_reports;
CREATE TRIGGER trigger_dispose_notifications_soft_delete
  AFTER UPDATE OF deleted_at ON public.financial_reports
  FOR EACH ROW EXECUTE FUNCTION public.dispose_report_notifications();

DROP TRIGGER IF EXISTS trigger_dispose_notifications_hard_delete ON public.financial_reports;
CREATE TRIGGER trigger_dispose_notifications_hard_delete
  AFTER DELETE ON public.financial_reports
  FOR EACH ROW EXECUTE FUNCTION public.dispose_report_notifications();

-- Backfill 1: soft-deletede rapporter. Kørt manuelt 10-08-2026 kl. 22.20,
-- gentaget her så en genopbygget base ender samme sted.
UPDATE public.notifications n
SET seen_at       = COALESCE(n.seen_at, now()),
    read_at       = COALESCE(n.read_at, now()),
    email_sent_at = COALESCE(n.email_sent_at, now()),
    deep_link     = COALESCE(
                      NULLIF(regexp_replace(COALESCE(n.deep_link, ''), '\?.*$', ''), ''),
                      n.deep_link
                    )
FROM public.financial_reports r
WHERE r.id = n.reference_id
  AND n.reference_type = 'report'
  AND r.deleted_at IS NOT NULL;

-- Backfill 2: forældreløse. Rapporten er HARD-deletet, så et JOIN mod
-- financial_reports kan ikke se dem — de blev overset i den manuelle
-- oprydning.
UPDATE public.notifications n
SET seen_at       = COALESCE(n.seen_at, now()),
    read_at       = COALESCE(n.read_at, now()),
    email_sent_at = COALESCE(n.email_sent_at, now()),
    deep_link     = COALESCE(
                      NULLIF(regexp_replace(COALESCE(n.deep_link, ''), '\?.*$', ''), ''),
                      n.deep_link
                    )
WHERE n.reference_type = 'report'
  AND n.reference_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_reports r WHERE r.id = n.reference_id
  );

-- Kontrol: begge tal skal være 0.
SELECT
  (SELECT count(*) FROM public.notifications n
     JOIN public.financial_reports r ON r.id = n.reference_id
    WHERE n.reference_type = 'report'
      AND r.deleted_at IS NOT NULL
      AND n.read_at IS NULL)                       AS softdeletede_ulaeste,
  (SELECT count(*) FROM public.notifications n
    WHERE n.reference_type = 'report'
      AND n.reference_id IS NOT NULL
      AND n.read_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.financial_reports r
                       WHERE r.id = n.reference_id)) AS foraeldreloese_ulaeste;
