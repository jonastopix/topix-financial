-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter Ø2's migration B
-- (20260918120000, kørt 17/9 13:22). Ændrer en SECURITY DEFINER-funktion —
-- GRØNT LYS GIVET: JONAS 17/9 (ordret): «Ja. Hvis der kommer det bedste
-- resultat ud af det.» (CLAUDE.md FORBIDDEN uden eksplicit grønt lys.)
--
-- FØR-SQL, ét resultatsæt (md5 og definitionen af funktionen i dag — gem CSV):
--   select '1 md5' as sektion, 'hent_oekonomi_overblik()' as noegle,
--          md5(pg_get_functiondef('public.hent_oekonomi_overblik()'::regprocedure)) as vaerdi
--   union all
--   select '2 definition', 'pg_get_functiondef', pg_get_functiondef('public.hent_oekonomi_overblik()'::regprocedure)
--   union all
--   select '3 definer | search_path', 'pg_proc', concat(bool_or(p.prosecdef), ' | ', string_agg(array_to_string(p.proconfig, ','), ''))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'hent_oekonomi_overblik'
--   union all
--   select '4 grants', r.rolle, has_function_privilege(r.rolle, 'public.hent_oekonomi_overblik()', 'EXECUTE')::text
--     from (values ('anon'), ('authenticated'), ('service_role')) as r(rolle)
--   union all
--   select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 2 uden nøglen 'fornyelser'; sektion 3 «true | search_path=public»;
--   sektion 4 anon false, authenticated true, service_role true.
--   EFTER-SQL: samme sæt — sektion 1 får en ny md5, sektion 2 indeholder 'fornyelser',
--   sektion 3 og 4 uændrede.
--
-- Fornyelsesradaren (Ø3, 18/9-2026, punkt 4): kontraktår der slutter de
-- næste 90 dage skal vise rådgiverens fornyelsesbeslutning. Den står i
-- public.company_fornyelse (beslutning 'tilbyd' | 'tilbyd_ikke',
-- besluttet_at, note; docs/fornyelsesordningen.md :19-22). MÅL FØRST:
-- tabellens RLS er rådgiver-læsning (advisor SELECT) — men Ø2's regel er ÉN
-- funktion, ét adgangstjek, ét svar: siden læser KUN hent_oekonomi_overblik()
-- (kildeværnet oekonomiSide.guard). Derfor udvides RPC'en med nøglen
-- 'fornyelser' frem for et ekstra kald fra browseren.
--
-- ÆNDRINGEN mod 20260918120000: funktionens krop får én nøgle mere,
-- 'fornyelser' (company_id, beslutning, besluttet_at, besluttet_af, note,
-- varsel_1_sendt_at, varsel_2_sendt_at, vindue_1_sendt_at,
-- vindue_2_sendt_at). Alt andet er ORDRET som før: partner-tjekket som
-- første sætning, security definer, set search_path = public, de tre
-- nøgler kontrakter/betalinger/virksomheder, hentet_at. Grants røres
-- ikke (create or replace bevarer dem — EFTER-SQL'en beviser det).
-- Læseren (src/lib/oekonomi/overblik.ts laesOverblik) tåler at nøglen
-- mangler: før denne migration er kørt, siger radaren «beslutning ukendt».
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 funktionen' as sektion, 'findes | definer | search_path' as noegle,
--          concat(count(*), ' | ', bool_or(p.prosecdef), ' | ', string_agg(array_to_string(p.proconfig, ','), '')) as vaerdi
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'hent_oekonomi_overblik'
--   union all
--   select '2 noegler i svaret', 'jsonb_object_keys', string_agg(k, ', ' order by k)
--     from jsonb_object_keys(public.hent_oekonomi_overblik()) k
--   union all
--   select '3 grants', r.rolle, has_function_privilege(r.rolle, 'public.hent_oekonomi_overblik()', 'EXECUTE')::text
--     from (values ('anon'), ('authenticated'), ('service_role')) as r(rolle)
--   union all
--   select '4 fornyelser', 'raekker | beslutninger', concat(count(*), ' | ', string_agg(concat(beslutning, ':', n), ', '))
--     from (select beslutning, count(*) n from public.company_fornyelse group by beslutning) a
--   union all
--   select '5 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   (Sektion 2 kræver at kørslen sker som partner — SQL editor kører som postgres,
--   hvor auth.uid() er NULL og funktionen kaster. Så: kør sektion 2 udeladt, eller
--   som «select … from jsonb_object_keys(…)» efter «set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<jonas' uuid>"}';» i samme transaktion.)
--   FACIT FØR: sektion 1 = «1 | true | search_path=public»; sektion 2 (hvis kørt) =
--   «betalinger, hentet_at, kontrakter, virksomheder»; sektion 3 anon false,
--   authenticated true, service_role true.
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt. FACIT EFTER: sektion 2 = «betalinger, fornyelser,
--   hentet_at, kontrakter, virksomheder»; sektion 1 og 3 uændrede.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK: kør funktionsdefinitionen fra 20260918120000_partner_roller_og_oekonomi_rpc.sql
--   (create or replace … uden 'fornyelser') — grants bevares.

create or replace function public.hent_oekonomi_overblik()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'partner') then
    raise exception 'Adgang nægtet: økonomioverblikket kan kun læses af partnere (Jonas og Morten)';
  end if;

  return jsonb_build_object(
    'kontrakter', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'company_id', k.company_id,
        'periode_start', k.periode_start,
        'periode_slut', k.periode_slut,
        'grundpris_oere', k.grundpris_oere,
        'pris_eks_moms_oere', k.pris_eks_moms_oere,
        'betalingsmodel', k.betalingsmodel,
        'kilde', k.kilde,
        'periode_id', k.periode_id,
        'note', k.note,
        'created_at', k.created_at
      ) order by k.company_id, k.periode_start)
      from public.kontrakter k
    ), '[]'::jsonb),
    'betalinger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'company_id', t.company_id,
        'betalt_at', t.betalt_at,
        'status', t.status,
        'kilde', t.kilde,
        'art', t.art,
        'faktura_nummer', t.faktura_nummer,
        'beloeb_oere', t.beloeb_oere,
        'moms_oere', t.moms_oere,
        'beloeb_eks_moms_oere', t.beloeb_oere - coalesce(t.moms_oere, 0),
        'periode_start', t.periode_start,
        'periode_slut', t.periode_slut
      ) order by t.betalt_at nulls last, t.id)
      from public.company_traek t
    ), '[]'::jsonb),
    'virksomheder', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'contract_start_date', c.contract_start_date,
        'contract_end_date', c.contract_end_date,
        'er_kunde', c.er_kunde,
        'is_legat', c.is_legat
      ) order by c.name)
      from public.companies c
    ), '[]'::jsonb),
    'fornyelser', coalesce((
      select jsonb_agg(jsonb_build_object(
        'company_id', f.company_id,
        'beslutning', f.beslutning,
        'besluttet_at', f.besluttet_at,
        'besluttet_af', f.besluttet_af,
        'note', f.note,
        'varsel_1_sendt_at', f.varsel_1_sendt_at,
        'varsel_2_sendt_at', f.varsel_2_sendt_at,
        'vindue_1_sendt_at', f.vindue_1_sendt_at,
        'vindue_2_sendt_at', f.vindue_2_sendt_at
      ) order by f.company_id, f.besluttet_at)
      from public.company_fornyelse f
    ), '[]'::jsonb),
    'hentet_at', now()
  );
end;
$$;

comment on function public.hent_oekonomi_overblik() is
  'Økonomioverblikket til partnerne (Jonas og Morten) — Ø2, 18/9-2026; Ø3 tilføjede fornyelser (company_fornyelse). SECURITY DEFINER; første sætning er has_role(auth.uid(), ''partner''), ellers exception. Returnerer kontrakter (alle kolonner), betalinger fra company_traek ekskl. moms (beloeb_oere − coalesce(moms_oere, 0)), virksomheder og fornyelser. Regnes i browseren af src/lib/oekonomi/omsaetning.ts og dashboard.ts.';

select
  (select bool_or(p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'hent_oekonomi_overblik') as definer,
  has_function_privilege('anon', 'public.hent_oekonomi_overblik()', 'EXECUTE') as anon_maa_kalde,
  has_function_privilege('authenticated', 'public.hent_oekonomi_overblik()', 'EXECUTE') as authenticated_maa_kalde;
