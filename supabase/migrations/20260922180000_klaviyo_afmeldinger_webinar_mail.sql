-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik),
-- og FØR webinar-afmeld udrulles. Uden den afviser CHECK'en hver eneste række,
-- webinar-afmeld prøver at skrive — og afmeldingen ville stå som en fejl i
-- loggen, mens mennesket fik at vide, at den var gået igennem.
--
-- ÉT KLIK, ÉN BETYDNING (Jonas 22/9-2026). Afmeldingslinket i platformens egne
-- før-webinar-mails afmelder nu BÅDE husets webinarmails og Klaviyos globale
-- e-mailmarkedsføring — samme regel og samme kald som en afmelding i eWebinar
-- (#1088, i drift 22/9 kl. 13:57). Sporet er det samme, `klaviyo_afmeldinger`;
-- kun kilden er ny.
--
-- HVORFOR EN EGEN KILDE OG IKKE 'webhook': de fire kilder svarer på spørgsmålet
-- «hvem bad om det?», og svaret er forskelligt. `webhook` er eWebinars egen
-- besked, `import` og `bagud` er vores oprydninger, og `webinar_mail` er et
-- menneske, der trykkede på et link i en mail, VI sendte. Den dag nogen
-- spørger, hvor afmeldingerne kommer fra, skal rækken kunne svare.
--
-- LISTEN STÅR TO STEDER og skal holdes i takt: her og i
-- `_shared/klaviyoAfmelding.ts` (`AFMELD_KILDER`). Kildeværnet
-- `webinarMail.guard` dom 7 sammenligner dem tegn for tegn.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
--     from pg_constraint
--    where conrelid = 'public.klaviyo_afmeldinger'::regclass and conname like '%kilde%'
--   union all
--   select '2 kilder i brug', coalesce(kilde, '(ingen)'), count(*)::text
--     from public.klaviyo_afmeldinger group by kilde
--   order by 1, 2;
--   FACIT FØR: sektion 1 = CHECK med ('webhook', 'import', 'bagud') — uden
--   'webinar_mail'. Sektion 2 = de kilder, der faktisk står i tabellen i dag.
-- EFTER-SQL: samme. FACIT EFTER: sektion 1's CHECK nævner alle FIRE; sektion 2
--   er uændret (migrationen rører ingen rækker).
--
-- ROLLBACK (kun muligt, hvis ingen række bruger den nye værdi):
--   alter table public.klaviyo_afmeldinger drop constraint klaviyo_afmeldinger_kilde_check;
--   alter table public.klaviyo_afmeldinger add constraint klaviyo_afmeldinger_kilde_check
--     check (kilde in ('webhook', 'import', 'bagud'));

alter table public.klaviyo_afmeldinger
  drop constraint if exists klaviyo_afmeldinger_kilde_check;

alter table public.klaviyo_afmeldinger
  add constraint klaviyo_afmeldinger_kilde_check
  check (kilde in ('webhook', 'import', 'bagud', 'webinar_mail'));

comment on column public.klaviyo_afmeldinger.kilde is
  'Hvem bad om afmeldingen: webhook (eWebinars egen besked) · import · bagud (vores oprydninger) · webinar_mail (et menneske trykkede på afmeldingslinket i platformens før-webinar-mail, 22/9-2026).';

-- EFTER-tjek (kør og gem CSV):
select '1 check' as sektion, conname as noegle, pg_get_constraintdef(oid) as vaerdi
  from pg_constraint
 where conrelid = 'public.klaviyo_afmeldinger'::regclass and conname like '%kilde%'
union all
select '2 kilder i brug', coalesce(kilde, '(ingen)'), count(*)::text
  from public.klaviyo_afmeldinger group by kilde
 order by 1, 2;
