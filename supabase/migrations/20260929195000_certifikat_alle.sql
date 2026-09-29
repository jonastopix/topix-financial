-- KØRT i prod — 29/9-2026 kl. 18:31 dansk tid (Lovable SQL editor). FØR (målt 18:30): 52 virksomheder · certificate_eligible ja 4 (BRILLEVÆRK, Capture IT A/S, PHILBERT ApS, Topix.dk ApS) · standard false. Samme måling: 22 udløbne og 2 uden startdato ser intet; 28 aktive med startdato, heraf 3 allerede åbne med 3 medlemmer (certifikat-klokkens første kørsel) og 2, der åbner inden for 30 dage. EFTER (18:31, samme kørsel): standard true · ja 52 · nej 0.
--
-- «DIT CERTIFIKAT» TIL ALLE VIRKSOMHEDER (29/9-2026). Jonas kl. 18:29: «Jeg synes
-- da klart, at alle virksomheder skal have certifikatet, nu hvor det er lavet.»
--
-- FLAGET ER NU ET FRAVALG: companies.certificate_eligible (20260929190000) var et
-- tilvalg for det første hold (standard false). Fra denne migration er standarden
-- true, og alle 52 virksomheder har flaget. Skal en virksomhed IKKE have
-- certifikatet, sættes flaget til false for netop den:
--   UPDATE public.companies SET certificate_eligible = false WHERE id = '<company_id>';
-- Fladen (src/lib/certifikat/dom.ts), forhåndsvisningen og certifikat-klokken
-- (_shared/certifikatKlokke.ts) læser flaget som før — ingen kode ændret. Hvem der
-- ser området, afgøres stadig også af tier (fuldt medlem), en gyldig startdato og
-- 12-månedersdatoen.
--
-- Topix.dk ApS fik ja kl. 18:28 som testkonto (kontakt@topix.dk), FØR alle fik det
-- — derfor står den blandt de fire i FØR og i rollbackens undtagelse.
--
-- SÆTNINGERNE herunder er de kørte, ordret. Begge er idempotente: en ny kørsel
-- sætter standarden igen og ændrer ingen rækker (der er ingen false tilbage).
--
-- ROLLBACK (tilbage til de fire fra før 18:31 — Topix.dk ApS med):
--   ALTER TABLE public.companies ALTER COLUMN certificate_eligible SET DEFAULT false;
--   UPDATE public.companies SET certificate_eligible = false WHERE certificate_eligible = true AND name NOT IN ('BRILLEVÆRK', 'Capture IT A/S', 'PHILBERT ApS', 'Topix.dk ApS');

ALTER TABLE public.companies ALTER COLUMN certificate_eligible SET DEFAULT true;
UPDATE public.companies SET certificate_eligible = true WHERE certificate_eligible = false;
