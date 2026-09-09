-- «Siden sidst» i forsidens højre spalte (Jonas 8/9-2026): hvad der er
-- sket mens rådgiveren ikke kiggede — pr. rådgiver, syv dages loft.
--
-- TO TING:
--   1. forside_sidst_set — stemplet «hvornår så du sidst listen», én række
--      pr. bruger, upsert på konflikt, self-only RLS. Mønstret er
--      conversation_last_seen (20260317143551), med brugeren som eneste
--      nøgle. Sættes af forsiden ved åbning (hooks/sidenSidst.ts).
--   2. get_siden_sidst(siden) — ÉN RPC frem for fire nye klientkald oven i
--      forsidens nitten. Besluttet 9/9: modsat pulsen (lib/pulsen, ren
--      funktion) er dette et TIDSFILTER, ikke en dom — «hvad har flyttet
--      sig siden X» har ingen tærskel at drive fra motorernes. Det eneste
--      der ligner en regel er hvad der TÆLLER som hændelse, og det er
--      kolonnernes betydning: en committet MÅLT rapport, en besked fra et
--      medlem, et svar på et forslag (accepted_at / closed_at med
--      done|not_done|dropped, som opgaveEngine.accepter/luk), en betaling
--      (company_traek betalt, company_perioder oprettet), et nyt medlem.
--      Navnene skæres til i SQL (højst SEKS pr. slags, nyeste først), så
--      klienten aldrig ser rækkerne — og tallet er det fulde antal.
--
-- Universet er forsidens: ikke legat, er_kunde ≠ false. Syv-dages-loftet
-- håndhæves i kode (lib/sidenSidst.sidenAf) FØR kaldet; funktionen tager
-- det `siden` den får.
--
-- Advisor-only som get_users_last_login (20260507120000): EXECUTE til
-- authenticated, kroppen kræver has_role(auth.uid(), 'advisor') og giver
-- nul rækker ellers. SECURITY DEFINER fordi messages/company_actions/
-- company_traek læses på tværs af virksomheder i én forespørgsel.
--
-- IKKE KØRT i prod. Køres i Lovable → SQL editor efter merge.

CREATE TABLE IF NOT EXISTS public.forside_sidst_set (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.forside_sidst_set IS
  'Hvornår rådgiveren sidst åbnede forsiden (8/9). Én række pr. bruger; «siden sidst» viser hændelser efter set_at, højst syv dage tilbage (src/lib/sidenSidst.ts).';

ALTER TABLE public.forside_sidst_set ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'forside_sidst_set' AND policyname = 'Users read own forside_sidst_set') THEN
    CREATE POLICY "Users read own forside_sidst_set" ON public.forside_sidst_set
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'forside_sidst_set' AND policyname = 'Users insert own forside_sidst_set') THEN
    CREATE POLICY "Users insert own forside_sidst_set" ON public.forside_sidst_set
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'forside_sidst_set' AND policyname = 'Users update own forside_sidst_set') THEN
    CREATE POLICY "Users update own forside_sidst_set" ON public.forside_sidst_set
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_siden_sidst(siden timestamptz)
RETURNS TABLE (slags text, antal integer, navne text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH univers AS (
    SELECT c.id, c.name
    FROM companies c
    WHERE COALESCE(c.is_legat, false) = false
      AND COALESCE(c.er_kunde, true) = true
  ),
  haendelser AS (
    -- rapporter: committede MÅLTE tal (et estimat er ikke en rapport der kom ind)
    SELECT 'rapporter'::text AS slags, f.company_id, f.committed_at AS tid
    FROM financial_report_facts f
    WHERE f.committed_at > siden AND f.data_basis = 'measured'
    UNION ALL
    -- beskeder: menneskelige beskeder fra nogen der IKKE er rådgiver/admin
    SELECT 'beskeder', c.company_id, m.created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.created_at > siden
      AND m.message_type = 'user'
      AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = m.sender_id AND r.role IN ('advisor','admin'))
    UNION ALL
    -- svar: accepteret, eller lukket med et svar (opgaveEngine.accepter/luk)
    SELECT 'svar', a.company_id, COALESCE(a.closed_at, a.accepted_at)
    FROM company_actions a
    WHERE (a.accepted_at > siden)
       OR (a.closed_at > siden AND a.status IN ('done','not_done','dropped'))
    UNION ALL
    -- betalinger: et betalt træk, eller en periode oprettet af en betaling (indgang/fornyelse)
    SELECT 'betalinger', t.company_id, t.betalt_at
    FROM company_traek t
    WHERE t.betalt_at > siden AND t.status = 'betalt'
    UNION ALL
    SELECT 'betalinger', p.company_id, p.created_at
    FROM company_perioder p
    WHERE p.created_at > siden AND p.stripe_reference IS NOT NULL
    UNION ALL
    -- medlemmer: nye rækker i company_members
    SELECT 'medlemmer', cm.company_id, cm.created_at
    FROM company_members cm
    WHERE cm.created_at > siden
  ),
  i_univers AS (
    SELECT h.slags, h.company_id, u.name, h.tid
    FROM haendelser h JOIN univers u ON u.id = h.company_id
  ),
  pr_virksomhed AS (
    SELECT slags, company_id, name, max(tid) AS nyeste, count(*) AS antal
    FROM i_univers GROUP BY slags, company_id, name
  )
  SELECT p.slags,
         sum(p.antal)::integer AS antal,
         (ARRAY(SELECT q.name FROM pr_virksomhed q WHERE q.slags = p.slags ORDER BY q.nyeste DESC LIMIT 6))::text[] AS navne
  FROM pr_virksomhed p
  WHERE has_role(auth.uid(), 'advisor'::app_role)
  GROUP BY p.slags;
$$;

GRANT EXECUTE ON FUNCTION public.get_siden_sidst(timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_siden_sidst(timestamptz) IS
  'Advisor-only by design (has_role i WHERE — nul rækker for andre). Hændelser efter `siden` pr. slags: antal og højst seks virksomhedsnavne, nyeste først. Ingen tærskler: et tidsfilter, ikke en dom (src/lib/sidenSidst.ts).';
