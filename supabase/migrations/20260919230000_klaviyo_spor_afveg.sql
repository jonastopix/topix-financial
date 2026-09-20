-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor, FØR den nye udgave af
-- klaviyo-motor udrulles. `skrivSpor` indsætter hele SporPost-objektet, så en
-- manglende kolonne får PostgREST til at afvise HVER ENESTE sporskrivning —
-- ikke kun den nye oplysning. Rækkefølgen er derfor ikke til forhandling:
-- migration først, merge derefter.
--
-- HVORFOR KOLONNEN FINDES (målt 19/9-2026 kl. 23:17):
-- Klaviyo KLONER en skabelon, når den kobles på en flowmail. Vi sendte
-- TVbT4b; svaret bar SYKyM6 — en kopi med samme navn, oprettet i selve
-- PATCH-øjeblikket. Originalen er frakoblet fra det sekund, og en rettelse i
-- den ændrer intet i flowet. Kaldet lykkes, så intet råber op af sig selv.
--
-- Værst af alt kan klonen ikke findes med GET /api/templates: både
-- any(id,[...]) og et filter på created giver tom liste. Den findes KUN, hvis
-- man kender id'et. Derfor skal begge id'er stå i sporet — det er den eneste
-- vej tilbage til klonen bagefter, og den skal kunne søges i.
--
-- Formen er den samme som `aendringer`, men betydningen er den modsatte:
-- `aendringer` er hvad VI bad om, `klaviyo_afveg` er hvad KLAVIYO gjorde
-- uden at vi bad om det.

alter table public.klaviyo_spor
  add column if not exists klaviyo_afveg jsonb not null default '[]'::jsonb;

comment on column public.klaviyo_spor.klaviyo_afveg is
  'Hvad Klaviyo lavede om af sig selv: [{felt, vi_sendte, klaviyo_satte}]. Tom liste betyder, at svaret var det, vi sendte. Den kendte afvigelse er skabelon-klonen ved kobling på en flowmail — klonen kan ikke findes i skabelonlisten, så begge id''er her er den eneste vej tilbage til den.';

-- Find alle kloner, en agent har fremkaldt:
--   select created_at, klaviyo_id, klaviyo_afveg
--   from public.klaviyo_spor
--   where klaviyo_afveg <> '[]'::jsonb
--   order by created_at desc;
create index if not exists klaviyo_spor_afveg_idx
  on public.klaviyo_spor (created_at desc)
  where klaviyo_afveg <> '[]'::jsonb;
