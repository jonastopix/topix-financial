-- KØRT i prod 17/9-2026 13:21 (Jonas' SQL editor; EFTER-CSV
-- query-results-export-2026-09-17_13-21-17.csv: enum app_role har member,
-- advisor, admin, partner). Kørt som SIN EGEN KØRSEL, FØR
-- 20260918120000_partner_roller_og_oekonomi_rpc.sql (kørt 13:22).
-- Jonas 17/9 (ordret): «Ja, hvis du mener det er den stærkeste vej at gå
-- med det bedste og holdbareste resultat, så gør vi det.»
-- DEPLOY (historik): manuelt i Lovable → SQL editor (Ø2 migration A).
--
-- Rollen «partner» (Ø2, 18/9-2026 — recon-oekonomi-dashboard.md §6 og §10.4).
-- Jonas 17/9 (ordret): «1. Kun mig og Morten» og «Vi går med dine
-- anbefalinger». Ny værdi i enum'en app_role — samme greb som 'admin' fik
-- 27/2 (20260227183816: «ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS
-- 'admin';»).
--
-- HVORFOR EN EGEN MIGRATION: en ny enum-værdi kan ikke BRUGES i samme
-- transaktion som den tilføjes («unsafe use of new value» — Postgres
-- afviser has_role(uid, 'partner'), INSERT … 'partner' og policies med
-- 'partner' indtil transaktionen er committet). Migration B bruger værdien
-- og skal derfor køres som en NY kørsel bagefter.
--
-- ARV: has_role (20260227184013) matcher «role = _role OR (role = 'admin'
-- AND _role = 'advisor')». Partner arves af ingen (admin er ikke partner),
-- og partner arver intet (Jonas og Morten har advisor i forvejen; Jonas
-- også admin). has_role ændres IKKE (FORBIDDEN uden grønt lys — og det er
-- ikke nødvendigt).
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 enum' as sektion, e.enumlabel as noegle, e.enumsortorder::text as vaerdi
--     from pg_enum e where e.enumtypid = 'public.app_role'::regtype
--   union all
--   select '2 roller', r.role::text, count(*)::text from public.user_roles r group by r.role
--   union all
--   select '3 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 3, 2;
--   FACIT FØR: sektion 1 = member, advisor, admin (tre rækker, ingen partner).
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt.
--   FACIT EFTER: sektion 1 = member, advisor, admin, partner (fire rækker);
--   sektion 2 uændret (ingen har rollen endnu — den gives i migration B).
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK: FINDES IKKE. Postgres kan ikke fjerne en enum-værdi (ingen
-- «ALTER TYPE … DROP VALUE»); det ville kræve at typen genskabes og alle
-- kolonner (user_roles.role) og funktioner (has_role) skrives om. En ubrugt
-- værdi er harmløs: uden rækker i user_roles med 'partner' er has_role(uid,
-- 'partner') falsk for alle. Migration B's rollback fjerner rækkerne,
-- politikken og funktionen — værdien bliver stående.

alter type public.app_role add value if not exists 'partner';

select e.enumlabel, e.enumsortorder
  from pg_enum e
 where e.enumtypid = 'public.app_role'::regtype
 order by e.enumsortorder;
