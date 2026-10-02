-- KØRT i prod 2/10-2026 kl. 18:43 (Claude via Lovables query_database, efter merge af #1248). FØR: låsen ikke sat · indekset findes ikke · 0 rækker af typen · job 566 «30 4 * * *» active. EFTER: låsen false · indekset som forventet · 0 rækker · job uændret. stille-klokker-cron udrullet 18:44 («Successfully deployed edge functions: stille-klokker-cron»); tørkørsel kald 29849: 200, «dag1_klokke»: «skive-1», kandidater 2, tavse hilst_paa 2.
-- (Omdøbt fra 20261002276000 ved kørslen: metaSend.guard dom 11 — en ikke-kørt migration må ikke sortere før en kørt; 280000 og 290000 venter på mandag.)
--
-- DAG-1-KLOKKEN (2/10-2026, aftenlisten a1002-velkomst; Jonas: «Klokke i
-- morgenmailen, vi skriver selv»). Et nyt medlem, der kom ind i går og ikke har
-- hørt fra os, ringer klokken venter_paa_velkomst hos hver rådgiver kl. 04:30 UTC
-- (stille-klokker-cron, job 566 «30 4 * * *» — 06:30 dansk sommertid, 05:30
-- vintertid), så den når samme morgens morgenmail (klokke-mail-cron, første
-- kørsel efter kl. 07 dansk på en hverdag). Dommen: supabase/functions/_shared/
-- dag1Klokke.ts (forsidens venterPaaVelkomst, spejlet). CLAUDE.md «Klokkerne som
-- mail» → «Dag-1-klokken»; rækkefølgen i docs/OVERLEVERING.md DEL 3.
--
-- KUN TILFØJENDE: én ny nøgle i app_config og ét nyt delvist unikt indeks.
-- Ingen tabel, kolonne, politik, trigger eller SECURITY DEFINER røres. INTET
-- NYT CRON-JOB: klokken er et tredje pas i stille-klokker-cron, hvis job 566
-- allerede kører {"dry_run": false} hver morgen — LÅSEN nedenfor er kontakten.
--
-- ── HVAD DER OPRETTES ───────────────────────────────────────────────────────
-- (a) app_config['dag1_klokke_aktiv'] = false — LÅSEN. Fail-closed: ikke sat =
--     false. Uden den ringer passet ALDRIG, heller ikke med dry_run: false —
--     det dømmer og tæller kun (svaret: dag1.holdt_af_laas). Skrives eksplicit
--     som false (en lås, man ikke kan se, bliver glemt — lærestreg 22/9).
--     Åbnes, når en tørkørsel er læst, med (guarded — en allerede åben lås
--     rammer nul rækker):
--       UPDATE public.app_config SET config_value = 'true'::jsonb, updated_at = now()
--        WHERE config_key = 'dag1_klokke_aktiv' AND config_value = 'false'::jsonb;
--
-- (b) advisor_notifications_venter_paa_velkomst_uidx — HØJST ÉN KLOKKE PR.
--     (RÅDGIVER, VIRKSOMHED) i databasen: unik på (advisor_id, company_id) for
--     type = 'venter_paa_velkomst'. Lag (c) af tre (dag1Klokke.ts filhoved):
--     cronen spørger først, om virksomheden har en sådan række (a), og
--     skrivRaadgiverBesked dedupper pr. rådgiver på titlen (b). Typen er ny —
--     FØR-SQL'en skal vise 0 rækker, ellers kan indekset ikke bygges.
--
-- ── FØR (kør først; ét resultatsæt — Lovables editor eksporterer kun det sidste) ──
--   select '1 laasen' as sektion, 'dag1_klokke_aktiv' as hvad,
--          coalesce((select config_value::text from public.app_config where config_key = 'dag1_klokke_aktiv'), 'ikke sat') as svar
--   union all
--   select '2 indekset', 'advisor_notifications_venter_paa_velkomst_uidx',
--          coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'advisor_notifications_venter_paa_velkomst_uidx'), 'findes ikke')
--   union all
--   select '3 raekker af typen', 'venter_paa_velkomst',
--          (select count(*)::text from public.advisor_notifications where type = 'venter_paa_velkomst')
--   union all
--   select '4 job 566', coalesce((select jobname || ' · ' || schedule || ' · active=' || active::text from cron.job where jobname = 'stille-klokker'), 'findes ikke'),
--          coalesce((select left(command, 200) from cron.job where jobname = 'stille-klokker'), '');
--   FORVENTET FØR: 1 «ikke sat» · 2 «findes ikke» · 3 «0» · 4 «stille-klokker · 30 4 * * * · active=true».
--   Står der andet i 3 end 0: STOP (indekset kan ikke bygges over dubletter).
--   Står der andet i 4: STOP — klokken når ikke morgenmailen uden jobbet.
--
-- ── EFTER (samme forespørgsel) ──────────────────────────────────────────────
--   FORVENTET: 1 «false» · 2 «CREATE UNIQUE INDEX advisor_notifications_venter_paa_velkomst_uidx
--   ON public.advisor_notifications USING btree (advisor_id, company_id) WHERE (type = 'venter_paa_velkomst'::text)»
--   · 3 «0» · 4 uændret.
--
-- REVERT:
--   drop index if exists public.advisor_notifications_venter_paa_velkomst_uidx;
--   delete from public.app_config where config_key = 'dag1_klokke_aktiv';

-- ── (a) Låsen ────────────────────────────────────────────────────────────────
insert into public.app_config (config_key, config_value, description)
values ('dag1_klokke_aktiv', 'false'::jsonb, 'Dag-1-klokken (stille-klokker-cron, 2/10-2026): ringer klokken venter_paa_velkomst hos rådgiverne, når et nyt medlem kom ind i går og ikke har hørt fra os? false = passet dømmer og tæller kun (standard). true sættes med én guarded UPDATE, når en tørkørsel er læst.')
on conflict (config_key) do nothing;

-- ── (b) Højst én klokke pr. (rådgiver, virksomhed) ───────────────────────────
create unique index if not exists advisor_notifications_venter_paa_velkomst_uidx
  on public.advisor_notifications (advisor_id, company_id)
  where type = 'venter_paa_velkomst';
