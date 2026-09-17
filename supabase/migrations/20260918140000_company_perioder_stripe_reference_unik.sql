-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).
--
-- UNIKHEDSREGEL på company_perioder.stripe_reference (før webinaret 22/9 —
-- recon-webinar-22-9.md §7 punkt 7; Jonas 17/9: «3. Ja»).
--
-- HVORFOR: stripe-webhookens idempotens ved indgang og fornyelse er ALENE
-- kodens opslag «findes der en periode på denne stripe_reference?»
-- (findIndgangsPeriode → maybeSingle). Kolonnen har ingen UNIQUE
-- (20260901140000_medlemsperioder.sql:22). To samtidige leverancer af samme
-- checkout.session.completed / invoice.paid (Stripe gensender ved timeout;
-- 10–15 betalinger på én dag) kan begge få «null» tilbage og begge
-- indsætte — to perioder, og næste opslag fejler i maybeSingle. Indekset
-- gør databasen til dommeren: den anden indsættelse får 23505, som webhooken
-- nu fanger (PeriodeFandtesAllerede → 200 «concurrent_duplicate», intet
-- kontraktår, ingen klokke — vinderen skriver begge).
--
-- DELVIST indeks (WHERE stripe_reference IS NOT NULL): rådgiverens manuelle
-- perioder og backfill-rækker uden Stripe-reference er ikke omfattet (flere
-- NULL er i forvejen tilladt i en UNIQUE, men et delvist indeks siger det
-- eksplicit og holder indekset lille).
--
-- STOP-VÆRN: findes der dubletter i prod i dag, fejler CREATE UNIQUE INDEX
-- alligevel — men DO-blokken nedenfor siger det FØRST med tallene, så det
-- ikke bliver en kryptisk fejl. Er der dubletter: STOP, kør FØR-SQL'ens
-- sektion 2 og beslut hvilken række der er bilaget (den ældste er den
-- webhooken skrev; den nyeste er racen). Ret i hånden, kør migrationen igen.
--
-- FØR-SQL (ét resultatsæt — gem CSV og skriv navnet her):
--   select '1 indeks' as sektion, 'findes' as noegle, count(*)::text as vaerdi
--     from pg_indexes where schemaname = 'public' and tablename = 'company_perioder'
--      and indexname = 'company_perioder_stripe_reference_uidx'
--   union all
--   select '2 dubletter', coalesce(stripe_reference, '-'), concat(count(*), ' rækker | ', string_agg(id::text, ', '))
--     from public.company_perioder where stripe_reference is not null
--     group by stripe_reference having count(*) > 1
--   union all
--   select '3 perioder', 'i alt | med reference | uden', concat(count(*), ' | ', count(stripe_reference), ' | ', count(*) - count(stripe_reference))
--     from public.company_perioder
--   union all
--   select '4 tid', 'now() dansk', to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI:SS')
--   order by 1, 2;
--   FACIT FØR: sektion 1 = 0; sektion 2 = INGEN rækker (findes én, STOP — se ovenfor); sektion 3 = 45 | 33 | 12 (16/9-tal; afvigelse er kun information).
--   FØR-CSV: (indsættes her)
--
-- EFTER-SQL: samme sæt — FACIT EFTER: sektion 1 = 1; sektion 2 = ingen rækker; sektion 3 uændret.
--   EFTER-CSV: (indsættes her)
--
-- ROLLBACK:
--   drop index if exists public.company_perioder_stripe_reference_uidx;
-- (Ingen datatab. Koden tåler begge tilstande: uden indekset er 23505-grenen
--  bare aldrig aktiv, som i dag.)

do $$
declare
  antal_dubletter integer;
  eksempel text;
begin
  select count(*), min(stripe_reference)
    into antal_dubletter, eksempel
    from (
      select stripe_reference
        from public.company_perioder
       where stripe_reference is not null
       group by stripe_reference
      having count(*) > 1
    ) d;
  if antal_dubletter > 0 then
    raise exception 'STOP: % stripe_reference(r) står på mere end én company_perioder-række (fx %). Kør FØR-SQL''ens sektion 2, ret i hånden, og kør migrationen igen.', antal_dubletter, eksempel;
  end if;
end $$;

create unique index if not exists company_perioder_stripe_reference_uidx
  on public.company_perioder (stripe_reference)
  where stripe_reference is not null;

comment on index public.company_perioder_stripe_reference_uidx is
  'Én periode pr. Stripe-reference (checkout-session eller faktura) — webhookens idempotens som databaseregel (18/9-2026). Delvist: manuelle/backfill-rækker uden reference er ikke omfattet. stripe-webhook fanger 23505 (PeriodeFandtesAllerede) og svarer 200 uden at skrive kontraktår eller klokke igen.';
