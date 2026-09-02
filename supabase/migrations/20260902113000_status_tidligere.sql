-- Oprydning: otte udloebne virksomheder markeret 'tidligere'.
-- KOERT MANUELT i Lovable SQL editor 2026-09-02. Denne fil er bogfoeringen.
--
-- companies.status (text default 'active', migration 20260225104718) var en
-- FUNGERENDE kontakt som ingen havde brugt. Maalt 2/9: den LAESES fire
-- steder — Members.tsx:445 (raadgiverens medlemsliste filtrerer paa
-- 'active' eller NULL), send-report-reminder:309, run-weekly-agent:14-16 og
-- run-company-agent:786-791 (branche-sammenligningsgrundlaget) — men
-- SKRIVES af ingen. Alle 40 virksomheder stod 'active', fordi det er
-- kolonnens default og intet havde roert den siden februar.
--
-- Konsekvensen af at saette den: virksomheden forsvinder fra
-- raadgiverlisten, faar ikke rapport-paamindelser, og taeller ikke med i
-- branche-sammenligningen. For en udloebet virksomhed er alle tre rigtige.
--
-- Alina Beauty og LineAlmegaard blev foerst holdt tilbage, fordi de har
-- data (13 rapporter / 93 beskeder) og saa ud som kandidater til
-- exit-abonnementet. Jonas 2/9: exit-abonnementet saelger TAL, ikke
-- beskeder, og ordningen gaelder foerst fremadrettet. Derfor er de med.
--
-- FOER-vaerdi for alle otte: 'active'.
--
-- ÅBENT: kolonnen har INGEN CHECK-constraint. 'tidligere' er en vaerdi der
-- blev defineret her; naeste gang kan nogen skrive 'Tidligere' eller
-- 'inaktiv', og filtrene virker saa tilfaeldigt. Boer bindes fast.

update public.companies set status = 'tidligere'
where id in (
  '8929ee5f-5e6c-4326-965a-a261b71d74f5',  -- Coskun Holding ApS      06/05
  '93e8d101-b625-405c-83de-c3af3bc2527d',  -- Regnskabsvikar ApS      06/05
  '57e41335-f91f-42fe-a2e9-7f85dca6f46f',  -- Sebastian & Amalie      06/05
  '017b9fad-9708-4fca-b35f-abec08c916c0',  -- Stadio                  06/05
  'fbec75bb-6e3f-4b90-b937-7522bde76917',  -- Startkoerekort          21/05
  '778c7899-feff-4f8a-a11e-83dac1bd39f5',  -- Alina Beauty & Skincare 29/05
  '32379181-f2c6-4ad9-92ca-aaed860f3e53',  -- Friends & Fries ApS     22/08
  '652dfff9-95b1-4bf6-b891-0fb43fb716d9'   -- LineAlmegaard           01/09
)
  -- To vaern: en allerede rettet raekke rammer nul, og et forkert id kan
  -- ikke ramme en aktiv virksomhed.
  and status = 'active'
  and contract_end_date < current_date;

-- Slettet samme dag: 'Jonas login tests virksomhed'
-- (4e06c019-65de-467b-8b79-0a6ad19ddb9e) — levn fra en test i nat, nul
-- rapporter, nul beskeder, nul milepaele, én tom samtale. Auth-brugeren
-- jonas+test45login@topix.dk staar tilbage uden virksomhed og rammer
-- CompanyLinkFailedGate; den kan kun slettes fra Supabases Auth-side.
