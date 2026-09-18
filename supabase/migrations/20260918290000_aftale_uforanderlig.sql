-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge.
--
-- E-underskriften: det underskrevne dokument skal være et BEVIS, ikke en påstand
-- (recon-pengene §3, 18/9-2026). I dag kan service role ændre dokument_tekst og
-- dokument_aftryk sammen, uden at nogen kan se det i tabellen; aftale_spor er
-- «append-only» kun i RLS-politikken, som service role omgår. Beviset stod kun i
-- kvitteringsmailene og PDF'en. Nu står det også i databasen:
--
--   protect_aftale_immutable_fields()  BEFORE UPDATE på aftale_underskrift
--     ALTID låst: token, ansoegning_id, company_id, skabelon_id, dokument_titel,
--       dokument_tekst, dokument_aftryk, prisniveau_oere, modtager_email,
--       modtager_navn, sendt_at, sendt_af, created_at.
--     Efter underskrift (OLD.status = 'underskrevet'): status, underskrevet_at,
--       underskrevet_navn, underskrevet_ip, underskrevet_user_agent låst; pdf_sti,
--       pdf_aftryk og kvittering_sendt_at må KUN gå fra NULL til en værdi (det er
--       de to skrivninger aftale-underskrift gør EFTER status-skiftet), aldrig
--       ændres bagefter.
--     Efter annullering (OLD.status = 'annulleret'): status og annulleret_* låst.
--     Fra 'sendt': underskrevet_* må kun sættes SAMMEN med status → 'underskrevet'
--       (CHECK aftale_underskrift_underskrift_hel kræver navn + tidspunkt).
--   protect_aftale_spor()  BEFORE UPDATE OR DELETE på aftale_spor
--     UPDATE afvises altid. DELETE afvises når den er DIREKTE (pg_trigger_depth() <= 1 inde i triggeren);
--     en DELETE der følger af at aftalen slettes (ON DELETE CASCADE fra
--     aftale_underskrift — persondata-sletning via companies/ansoegninger) tillades,
--     for der kører den inde i RI-triggeren (depth 2).
--
-- Samme mønster som husets protect_message_immutable_fields / protect_handout_
-- immutable_fields (BEFORE UPDATE, RAISE EXCEPTION, SET search_path = public).
-- Det er NYE triggere — de fredede protect_*-triggere på messages/handouts og
-- has_role/user_company_id røres ikke. Ingen SECURITY DEFINER.
--
-- HVAD KODEN SKRIVER, og som stadig virker (målt 18/9 i aftale-underskrift og
-- send-til-underskrift, låst af src/lib/__tests__/aftaleUforanderlig.guard.test.ts):
--   sendt → underskrevet + underskrevet_at/navn/ip/user_agent + updated_at   (underskriften)
--   underskrevet: pdf_sti + pdf_aftryk (NULL → værdi)                          (PDF'en)
--   underskrevet: kvittering_sendt_at (NULL → værdi)                           (kvitteringen)
--   sendt → annulleret + annulleret_at/af/grund + updated_at                  (erstat / linkmail fejlede)
--   aftale_spor: kun INSERT
-- Testet i en WASM-Postgres (udkastets test/aftale-uforanderlig.test.mjs): 15 afvisninger, 6 tilladte, 0 fejl.
--
-- FØR-SQL (gem svaret):
--   select tgname, tgrelid::regclass, tgtype from pg_trigger
--    where tgrelid in ('public.aftale_underskrift'::regclass, 'public.aftale_spor'::regclass) and not tgisinternal;
--   -- forventet: ingen rækker (evt. kun updated_at-triggere, hvis sådanne findes).

create or replace function public.protect_aftale_immutable_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Identiteten og dokumentet: låst fra afsendelsen.
  if new.token is distinct from old.token then raise exception 'aftale_underskrift.token cannot be changed'; end if;
  if new.ansoegning_id is distinct from old.ansoegning_id then raise exception 'aftale_underskrift.ansoegning_id cannot be changed'; end if;
  if new.company_id is distinct from old.company_id then raise exception 'aftale_underskrift.company_id cannot be changed'; end if;
  if new.skabelon_id is distinct from old.skabelon_id then raise exception 'aftale_underskrift.skabelon_id cannot be changed'; end if;
  if new.dokument_titel is distinct from old.dokument_titel then raise exception 'aftale_underskrift.dokument_titel cannot be changed'; end if;
  if new.dokument_tekst is distinct from old.dokument_tekst then raise exception 'aftale_underskrift.dokument_tekst cannot be changed'; end if;
  if new.dokument_aftryk is distinct from old.dokument_aftryk then raise exception 'aftale_underskrift.dokument_aftryk cannot be changed'; end if;
  if new.prisniveau_oere is distinct from old.prisniveau_oere then raise exception 'aftale_underskrift.prisniveau_oere cannot be changed'; end if;
  if new.modtager_email is distinct from old.modtager_email then raise exception 'aftale_underskrift.modtager_email cannot be changed'; end if;
  if new.modtager_navn is distinct from old.modtager_navn then raise exception 'aftale_underskrift.modtager_navn cannot be changed'; end if;
  if new.sendt_at is distinct from old.sendt_at then raise exception 'aftale_underskrift.sendt_at cannot be changed'; end if;
  if new.sendt_af is distinct from old.sendt_af then raise exception 'aftale_underskrift.sendt_af cannot be changed'; end if;
  if new.created_at is distinct from old.created_at then raise exception 'aftale_underskrift.created_at cannot be changed'; end if;

  -- Efter underskrift: underskriften er et faktum. Kun de to efterfølgende
  -- skrivninger (PDF, kvittering) må ske — og kun én gang, fra NULL.
  if old.status = 'underskrevet' then
    if new.status is distinct from old.status then raise exception 'aftale_underskrift.status cannot leave underskrevet'; end if;
    if new.underskrevet_at is distinct from old.underskrevet_at then raise exception 'aftale_underskrift.underskrevet_at cannot be changed after signing'; end if;
    if new.underskrevet_navn is distinct from old.underskrevet_navn then raise exception 'aftale_underskrift.underskrevet_navn cannot be changed after signing'; end if;
    if new.underskrevet_ip is distinct from old.underskrevet_ip then raise exception 'aftale_underskrift.underskrevet_ip cannot be changed after signing'; end if;
    if new.underskrevet_user_agent is distinct from old.underskrevet_user_agent then raise exception 'aftale_underskrift.underskrevet_user_agent cannot be changed after signing'; end if;
    if old.pdf_sti is not null and new.pdf_sti is distinct from old.pdf_sti then raise exception 'aftale_underskrift.pdf_sti cannot be changed once set'; end if;
    if old.pdf_aftryk is not null and new.pdf_aftryk is distinct from old.pdf_aftryk then raise exception 'aftale_underskrift.pdf_aftryk cannot be changed once set'; end if;
    if old.kvittering_sendt_at is not null and new.kvittering_sendt_at is distinct from old.kvittering_sendt_at then raise exception 'aftale_underskrift.kvittering_sendt_at cannot be changed once set'; end if;
  end if;

  -- Efter annullering: annulleringen er et faktum.
  if old.status = 'annulleret' then
    if new.status is distinct from old.status then raise exception 'aftale_underskrift.status cannot leave annulleret'; end if;
    if new.annulleret_at is distinct from old.annulleret_at or new.annulleret_af is distinct from old.annulleret_af or new.annulleret_grund is distinct from old.annulleret_grund then
      raise exception 'aftale_underskrift.annulleret_* cannot be changed after cancellation';
    end if;
  end if;

  -- Fra sendt: en underskrift skrives kun sammen med status-skiftet — aldrig «lidt» underskrift.
  if old.status = 'sendt' and new.status = 'sendt' and (
       new.underskrevet_at is distinct from old.underskrevet_at
    or new.underskrevet_navn is distinct from old.underskrevet_navn
    or new.underskrevet_ip is distinct from old.underskrevet_ip
    or new.underskrevet_user_agent is distinct from old.underskrevet_user_agent
    or new.pdf_sti is distinct from old.pdf_sti
    or new.pdf_aftryk is distinct from old.pdf_aftryk
  ) then
    raise exception 'aftale_underskrift.underskrevet_*/pdf_* can only be set together with status = underskrevet';
  end if;

  return new;
end;
$$;

comment on function public.protect_aftale_immutable_fields() is
  'BEFORE UPDATE på aftale_underskrift: tekst, aftryk, token, ejer, modtager og sendt_* er låst fra afsendelsen; underskriften og status er låst efter underskrift (pdf_*/kvittering_sendt_at kun NULL → værdi); annulleringen er låst efter annullering. Gør det underskrevne dokument til et bevis i tabellen — ikke kun i mailene og PDF''en.';

drop trigger if exists protect_aftale_immutable_fields on public.aftale_underskrift;
create trigger protect_aftale_immutable_fields
before update on public.aftale_underskrift
for each row
execute function public.protect_aftale_immutable_fields();

create or replace function public.protect_aftale_spor()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'aftale_spor is append-only: rows cannot be updated';
  end if;
  -- DELETE: kun som følge af en cascade (aftalen slettes — persondata-sletning).
  -- pg_trigger_depth() er 1 INDE i denne trigger ved en direkte DELETE; ved en
  -- cascade fra aftale_underskrift kører den inde i RI-triggeren og er 2 (målt i
  -- WASM-Postgres, udkastets test: depth 1 → afvist, cascade → tilladt).
  if pg_trigger_depth() <= 1 then
    raise exception 'aftale_spor is append-only: rows cannot be deleted directly';
  end if;
  return old;
end;
$$;

comment on function public.protect_aftale_spor() is
  'BEFORE UPDATE OR DELETE på aftale_spor: ingen UPDATE; DELETE kun som cascade fra aftale_underskrift (pg_trigger_depth() > 1) — aldrig direkte. Revisionssporet rettes ikke.';

drop trigger if exists protect_aftale_spor on public.aftale_spor;
create trigger protect_aftale_spor
before update or delete on public.aftale_spor
for each row
execute function public.protect_aftale_spor();

-- EFTER-SQL:
--   select tgname, tgrelid::regclass from pg_trigger
--    where tgname in ('protect_aftale_immutable_fields','protect_aftale_spor');            -- 2 rækker
--   select proname, prosecdef from pg_proc where proname in ('protect_aftale_immutable_fields','protect_aftale_spor');  -- 2 rækker, prosecdef = false
--   -- prøven (i en transaktion, rulles tilbage):
--   begin;
--     update public.aftale_underskrift set dokument_tekst = dokument_tekst || ' ' where status = 'underskrevet' limit 1;  -- forventet: ERROR … cannot be changed
--   rollback;
--
-- ROLLBACK:
--   drop trigger if exists protect_aftale_immutable_fields on public.aftale_underskrift;
--   drop trigger if exists protect_aftale_spor on public.aftale_spor;
--   drop function if exists public.protect_aftale_immutable_fields();
--   drop function if exists public.protect_aftale_spor();
