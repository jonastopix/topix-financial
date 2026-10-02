-- KØRT i prod 30/9-2026 ca. 18:35 via Lovable-MCP'en. FØR: tabellen null. EFTER: webinar_video_klik findes · rls true · policies «Advisors can view … [SELECT authenticated]» og «Service role can manage … [ALL service_role]» (anon har tabel-INSERT som Supabase-standard, men ingen policy → afvist af RLS).
--
-- KLIKKENE PÅ MORTENS HILSEN I MAILEN «DAGEN FØR» (udkast 30/9-2026). Én ny tabel og
-- intet andet. Skal være KØRT, FØR webinar-video udrulles: uden tabellen fejler
-- functionens insert (42P01) — viderestillingen virker stadig (fail-soft), men
-- klikket er tabt.
--
-- RECON (30/9): huset havde INGEN måling af klik i webinarmails. Mailgun-sporingen
-- er slået fra med vilje (_shared/mailgunAfsendelse.ts: o:tracking/-clicks/-opens
-- = «no» — Mailgun ville skrive de personlige links om til sit eget domæne), og
-- webinar_mails bærer kun afsendelsen. Derfor den mindste korrekte løsning her.
--
-- ANONYMT PR. MAIL-RÆKKE: en række pr. klik (GET) med mail_id og tidspunkt — INGEN
-- ip, ingen user agent, ingen adresse. Mail-rækken (webinar_mails.id) er det, der
-- knytter klikket til en mail; id'et står i linket i stedet for en adresse
-- (webinar-mail-cron trækker det FØR mailen bygges og skriver sporet med samme id).
-- Unikke klikkere = count(distinct mail_id). Forbehold: mailsikkerhed (Safe Links
-- o.l.) kan «klikke» før mennesket — et klik er et GET fra nogen med mailen.
--
-- FREMMEDNØGLEN er dommen: et klik findes kun for en rigtig mail-række, og slettes
-- mail-rækken (fx prøverækken, eller en persons data), går klikkene med (cascade).
--
-- RLS: rådgivere LÆSER (samme politik som webinar_mails); kun service role skriver
-- (webinar-video). Ingen klient-mutation.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 tabel' as sektion, table_name as noegle, '' as vaerdi
--     from information_schema.tables where table_schema = 'public' and table_name = 'webinar_video_klik'
--   union all
--   select '2 webinar_mails.id', data_type, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'webinar_mails' and column_name = 'id'
--   order by 1, 2;
--   FACIT FØR: sektion 1 TOM; sektion 2 = uuid | gen_random_uuid().
--
-- EFTER-SQL (ét resultatsæt):
--   select '1 kolonne' as sektion, column_name as noegle, data_type as vaerdi
--     from information_schema.columns where table_schema = 'public' and table_name = 'webinar_video_klik'
--   union all
--   select '2 politik', polname, polcmd::text
--     from pg_policy where polrelid = 'public.webinar_video_klik'::regclass
--   union all
--   select '3 rls', relname, relrowsecurity::text from pg_class where oid = 'public.webinar_video_klik'::regclass
--   order by 1, 2;
--   FACIT EFTER: sektion 1 = id uuid · klikket_at timestamptz · mail_id uuid;
--   sektion 2 = de to politikker (r og *); sektion 3 = true.
--
-- ROLLBACK (kun før webinar-video er udrullet — ellers taber functionen sine klik):
--   drop table if exists public.webinar_video_klik;

create table if not exists public.webinar_video_klik (
  id          uuid primary key default gen_random_uuid(),
  -- Mailen, der blev klikket i. Aldrig en adresse.
  mail_id     uuid not null references public.webinar_mails (id) on delete cascade,
  klikket_at  timestamptz not null default now()
);

create index if not exists webinar_video_klik_mail_idx on public.webinar_video_klik (mail_id);

comment on table public.webinar_video_klik is
  'Klik på Mortens hilsen i webinarmailen «dagen før» (30/9-2026). Én række pr. GET på webinar-video med et kendt mail-id — anonymt: kun mail_id og tidspunkt, ingen ip, user agent eller adresse. Kun webinar-video (service role) skriver; rådgivere læser.';

alter table public.webinar_video_klik enable row level security;

create policy "Advisors can view webinar video klik"
  on public.webinar_video_klik for select to authenticated
  using (public.has_role(auth.uid(), 'advisor'));

create policy "Service role can manage webinar video klik"
  on public.webinar_video_klik for all to service_role
  using (true) with check (true);
