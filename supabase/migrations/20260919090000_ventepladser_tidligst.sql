-- Ventelisten: en «tidligst»-dato på ventepladsen (18/9-2026, Jonas ordret om ABC
-- hundeudstyr/Doggybed: «De skal tilbydes når Doggybed er ude, så tingene er efter
-- bogen.»). MÅLT i C's dom (ventelisteDom.erPladsLedig): pladsen regnes som ledig
-- ved fornyelsesstatus klar_til_afsked — dvs. så snart beslutningen er «tilbyd
-- ikke», FØR slutdatoen. Doggybed (aktiv til 13/10-2026, tilbyd_ikke) viser derfor
-- «Pladsen er ledig» og knappen «Tilbyd pladsen» I DAG. Datoen her holder køen
-- tilbage: naesteIKoen springer rækker over, hvis tidligst_tilbud_at er i fremtiden
-- (dansk dato), i functionen (tilbydPladsen), på virksomhedssiden og på forsiden.
--
-- FØR-SQL (forventet: 0 rækker — kolonnen findes ikke):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='ventepladser' and column_name='tidligst_tilbud_at';
-- ROLLBACK:
--   alter table public.ventepladser drop column if exists tidligst_tilbud_at;

alter table public.ventepladser
  add column if not exists tidligst_tilbud_at date;

comment on column public.ventepladser.tidligst_tilbud_at is
  'Tidligste danske dato pladsen må tilbydes denne ansøger (null = så snart pladsen er ledig). Køen (ventelisteDom.klarTilTilbud) springer rækken over før datoen. Jonas 18/9: «De skal tilbydes når Doggybed er ude, så tingene er efter bogen.»';

-- EFTER-SQL (forventet: én række, data_type date, is_nullable YES):
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name='ventepladser' and column_name='tidligst_tilbud_at';
