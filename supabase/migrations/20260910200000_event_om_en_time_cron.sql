-- «Om en time» til de tilmeldte (10/9-2026, recon-eventmails.md §4).
--
-- event-reminders kører dagligt kl. 07 med tom body (vinduerne A «Om en uge»
-- og B «I morgen» — urørte). Dette job kalder SAMME funktion hvert kvarter
-- med body { "vindue": "time" }, som kører KUN vindue C: tilmeldte til events
-- der starter om 60–90 minutter (_shared/eventMails.ts: erOmEnTime). Kvarters-
-- kadencen sikrer at ethvert event rammes mindst én gang i vinduet; dedup_key
-- event_reminder:{id}:c gør et andet ramt harmløst.
--
-- PRISEN: 96 kørsler i døgnet mod 1. Hver kørsel er ét events-opslag (og et
-- registrations-opslag kun for events i vinduet) — de fleste kørsler skriver
-- intet. Kaldet går gennem kald_edge (URL, vault-nøgle, timeout ét sted);
-- timeout 30 s, interval 15 min, så to kørsler aldrig overlapper.
--
-- MAILEN: notifikationen mailes af send-notification-email (hvert 5. min,
-- 15 min forsinkelse, vinduet 07–20). En «om en time» til et event efter
-- ca. kl. 21 skrives, men mailes ikke — og forældes (12 t-reglen for
-- event_reminder) før køen åbner igen. Klokken i appen viser den straks.
--
-- Revert: SELECT cron.unschedule('event-reminders-time');
SELECT cron.schedule(
  'event-reminders-time',
  '*/15 * * * *',
  $job$ SELECT public.kald_edge('event-reminders', '{"vindue":"time"}'::jsonb, 30000, 900000) $job$
);
