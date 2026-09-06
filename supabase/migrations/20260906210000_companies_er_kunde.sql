-- er_kunde: er virksomheden en KUNDE, eller er den vores egen?
--
-- BAGGRUND (6/9-2026). Topix.dk ApS er vores egen virksomhed. Den er
-- status active, ikke legat, ikke demo, har facts, en samtale og en
-- kontrakt til 2030 -- og staar derfor i raadgiverens koeer, i
-- virksomhedslisten og i alle taellere som var den en kunde. Det er den
-- ikke. Medlemskontoen kontakt@topix.dk (owner) skal virke NOEJAGTIG
-- som i dag.
--
-- HVORFOR ET NYT FELT og ikke et af de tre der findes
-- (maalt 6/9, recon-skjul-topix.md):
--   is_legat = true    tager community, indhold, events og storage fra
--                      medlemmet (har_aktivt_medlemskab).
--   status <> active   stopper rapportpaamindelser, ugeagenten og
--                      berigelsen for medlemmet.
--   is_demo = true     filtrerer kun i EEN restriktiv RLS-policy, som
--                      undtager admin. Jonas ER admin (maalt 6/9), saa
--                      den ville ikke skjule noget for ham -- kun for
--                      Morten.
-- Alle tre aendrer noget for medlemmet eller rammer den forkerte person.
--
-- HVORFOR NAVNET. Feltet siger en kendsgerning, ikke en virkning. Et
-- felt der hed "skjul_for_raadgiver" kan ikke svare paa om
-- virksomheden skal taelles med som kunde, og saa ender vi med felt
-- nummer to.
--
-- RAEKKEVIDDE, besluttet 6/9 paa recon-agentens-skrivninger.md: feltet
-- laeses KUN i raadgiverens LAESESTIER (forsidens datalag,
-- /virksomheder, /members, taellerne). Det gater INGEN cron og INGEN
-- edge function. Saerligt: det maa ikke gate run-weekly-agent, som
-- koerer LIVE (dry_run: false) og skriver weekly_focus,
-- company_actions og milestones -- alle tre ser medlemmet paa Dit
-- Boardroom og /milestones. Slukkes agenten, aendres medlemmets
-- hverdag, og det var netop kravet at den ikke maatte.

alter table public.companies
  add column if not exists er_kunde boolean not null default true;

comment on column public.companies.er_kunde is
  'Falsk = vores egen virksomhed, ikke en kunde. Laeses KUN af raadgiverens laesestier (forside, virksomhedsliste, /members, taellere). Aendrer intet for virksomhedens eget medlem og gater ingen cron eller edge function.';

-- Topix.dk ApS. Guardet paa id, navn og nuvaerende vaerdi, saa en
-- gentagen koersel rammer nul raekker frem for at overskrive.
update public.companies
   set er_kunde = false
 where id = '3ffccc0f-f6a9-4a23-9515-db2e22e8ad49'
   and name = 'Topix.dk ApS'
   and er_kunde = true;
