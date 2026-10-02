-- KØRT i prod 2/10-2026 ca. 12:50 (efter 20261002260000; Claude via Lovable-MCP). FØR: triggeren fandtes ikke, kolonnen fandtes, 5 politikker. EFTER: triggeren O, ikke DEFINER, 5 politikker. Tørprøve (rullet tilbage): medlem skriver egen position ok · medlem markerer selv → afvist · rådgiver skriver acknowledged_at → afvist · rådgiver markerer → ok · rådgiver fortryder en batch-række → ok. NB: den gamle frontends «Markér hele modulet» (batchAcknowledge) fejler nu højt for rådgivere, indtil F0's Update.
--
-- AKADEMIET F0, VÆRNET — medlemmets felter i member_progress skrives kun af
-- medlemmet selv (2/10-2026; grundlag docs/akademi-grundlag.md §4 F0).
--
-- HVORFOR EN TRIGGER: RLS er pr. række, ikke pr. kolonne. «Advisors can insert/
-- update progress» (20260805200000) lader en rådgiver skrive HELE rækken — det
-- var præcis vejen, batchAcknowledge tog, da den skrev acknowledged_at som
-- medlemmet. Klienten (batchMarker) skriver nu kun markeret_*, og kildeværnet
-- akademiF0.guard låser det — men «UI'et er aldrig forsvarslinjen»
-- (adminContentApi.ts, filhovedet). Samme form som protect_weekly_focus_seen_only
-- (20260911060000) og companies_medlem_kolonnevaern (20260930090000): en
-- kolonnelås i en BEFORE-trigger.
--
-- DOMMEN (kun når skriveren er en ANDEN AUTENTIFICERET bruger end rækkens ejer):
--   * auth.uid() IS NULL → forbi. Det er service role (slet-medlemsdata-cron
--     sletter; ingen function skriver rækkerne i dag) OG SQL editoren
--     (postgres; backfills og rettelser i hånden skal kunne køre).
--     auth.role() = 'service_role' → forbi, af samme grund (bælte og seler).
--   * auth.uid() = NEW.user_id → medlemmet må alt på egen række som før
--     (self-only-policyen «Users can manage own progress») — UNDTAGEN
--     markeret_at/markeret_af: dem kan medlemmet ikke sætte eller ændre
--     (ellers kunne hun selv skrive «gennemgået med rådgiver»). Ingen
--     medlemskode sender felterne (ProgressPatch nævner dem ikke).
--   * Ellers (en rådgiver på et medlems række):
--       INSERT: seen_at, acknowledged_at, skipped_at, last_position_seconds,
--               brugbar, brugbar_at skal være NULL. markeret_* er frie.
--       UPDATE: de seks må ikke ændres — med ÉN undtagelse, som
--               fortrydMarkeringPatch (progressState.ts) bruger: acknowledged_at
--               og seen_at må sættes til NULL, når de ER rådgiverens stempel,
--               dvs. lig OLD.markeret_at (de backfillede batch-rækker fra 5/8
--               og 12/8). user_id og content_item_id må aldrig flyttes.
--               Og en backfillet batch-række (acknowledged_at/seen_at lig
--               OLD.markeret_at) må ikke få et NYT markeret_at uden at
--               stemplet ryddes i samme skrivning — ellers ville det gamle
--               stempel blive «medlemmets eget» i klientens dom (≠-reglen).
--               ProgressView gen-markerer aldrig en gennemgået lektion.
--   Brud → RAISE EXCEPTION (fejlen vises i ProgressView som skrivefejl).
--
-- KRÆVER DEN JONAS' GRØNNE LYS? Vurderet 2/10 mod CLAUDE.md «FORBIDDEN uden
-- eksplicit grønt lys»: NEJ. Ingen SECURITY DEFINER oprettes eller ændres
-- (funktionen er SECURITY INVOKER, search_path låst, som husets øvrige
-- kolonnelåse); has_role/user_company_id/handle_new_user/protect_*_immutable_
-- fields røres ikke; ingen policy oprettes, ændres eller droppes (de fem på
-- member_progress står — FØR/EFTER-SQL tæller dem). Triggeren INDSNÆVRER kun,
-- hvad de eksisterende advisor-policies lader en rådgiver skrive. Risikoen er
-- driftsmæssig, ikke en rettighedsudvidelse: en fejl i funktionen ville
-- vælte medlemmets egne skrivninger (seen_at, kvittér, position) — derfor
-- EFTER-SQL og prøven som medlem (nedenfor) før Update. Skrivere målt i koden
-- 2/10: medlemmet (akademiApi.upsertProgress/saetBrugbar, egen række),
-- rådgiveren (adminContentApi.batchMarker/fortrydMarkering), service role
-- (slet-medlemsdata-cron sletter; run-company-agent LÆSER kun).
--
-- RÆKKEFØLGEN: 20261002260000 FØRST (kolonnerne skal findes — funktionen
-- refererer NEW.markeret_at og kompileres ved første kørsel). Derefter denne,
-- derefter EFTER-SQL, derefter Update.
--
-- FØR-SQL (ét resultatsæt — gem CSV):
--   select '1 trigger' as sektion,
--          coalesce((select tgenabled::text from pg_trigger
--                     where tgrelid = 'public.member_progress'::regclass
--                       and tgname = 'member_progress_markering_vaern'), 'findes ikke') as vaerdi
--   union all
--   select '2 kolonne markeret_at (skal findes)',
--          coalesce((select data_type from information_schema.columns
--                     where table_schema = 'public' and table_name = 'member_progress'
--                       and column_name = 'markeret_at'), 'findes ikke — KØR 20261002260000 FØRST')
--   union all
--   select '3 policies paa member_progress', count(*)::text from pg_policies where tablename = 'member_progress'
--   order by 1;
--   Forventet: 1 = «findes ikke», 2 = «timestamp with time zone», 3 = 5.
--
-- EFTER-SQL (ét resultatsæt — gem CSV):
--   select '1 trigger' as sektion,
--          coalesce((select tgenabled::text from pg_trigger
--                     where tgrelid = 'public.member_progress'::regclass
--                       and tgname = 'member_progress_markering_vaern'), 'findes ikke') as vaerdi
--   union all
--   select '2 funktionen er IKKE security definer',
--          (select (not p.prosecdef)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public' and p.proname = 'member_progress_markering_vaern')
--   union all
--   select '3 policies paa member_progress (uaendret)', count(*)::text from pg_policies where tablename = 'member_progress'
--   order by 1;
--   Forventet: 1 = «O», 2 = «true», 3 = 5.
--
-- BEVISET I DRIFT (efter Update, som rådgiver på /admin/indhold/fremdrift):
--   «Markér som gennemgået» på en lektion → rækken får markeret_at/markeret_af,
--   og acknowledged_at er stadig NULL (SQL: select markeret_at, markeret_af,
--   acknowledged_at from public.member_progress where user_id = '<medlem>' and
--   content_item_id = '<lektion>';). «Fortryd» på en backfillet batch-række →
--   alle fire er NULL. OG som MEDLEM (testkontoen): åbn en lektion og kvittér
--   «Gennemført» → ingen fejl, og rækken har eget seen_at/acknowledged_at —
--   beviset for, at værnet ikke vælter medlemmets egne skrivninger.
--
-- RUL TILBAGE:
--   DROP TRIGGER IF EXISTS member_progress_markering_vaern ON public.member_progress;
--   DROP FUNCTION IF EXISTS public.member_progress_markering_vaern();
--
-- FORUDSÆTNINGEN, MÅLT FØR ALT ANDET (rådets fund 2/10): værnets krop læser
-- markeret_at/markeret_af. Er 20261002260000 ikke kørt, ville CREATE FUNCTION
-- gå igennem (plpgsql løser kolonnerne først ved kørsel), og den FØRSTE
-- skrivning på member_progress — også medlemmets egne — ville vælte med 42703.
-- Derfor stopper filen her, før noget er oprettet.

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='member_progress' AND column_name='markeret_at') THEN RAISE EXCEPTION 'Kør 20261002260000 først'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.member_progress_markering_vaern()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Service role og SQL editoren (ingen auth.uid()) skriver frit.
  IF auth.uid() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Medlemmet på egen række: som før (self-only-policyen bærer ejerskabet) —
  -- men markeret_* er rådgiverens: medlemmet kan ikke selv skrive
  -- «gennemgået med rådgiver» (INSERT: NULL; UPDATE: uændret).
  IF auth.uid() = NEW.user_id THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.markeret_at IS NOT NULL OR NEW.markeret_af IS NOT NULL THEN
        RAISE EXCEPTION 'member_progress: markeret_at/markeret_af skrives kun af rådgiveren';
      END IF;
    ELSIF NEW.markeret_at IS DISTINCT FROM OLD.markeret_at
       OR NEW.markeret_af IS DISTINCT FROM OLD.markeret_af THEN
      RAISE EXCEPTION 'member_progress: markeret_at/markeret_af skrives kun af rådgiveren';
    END IF;
    RETURN NEW;
  END IF;

  -- En anden bruger (rådgiveren) på et medlems række.
  IF TG_OP = 'INSERT' THEN
    IF NEW.seen_at IS NOT NULL
       OR NEW.acknowledged_at IS NOT NULL
       OR NEW.skipped_at IS NOT NULL
       OR NEW.last_position_seconds IS NOT NULL
       OR NEW.brugbar IS NOT NULL
       OR NEW.brugbar_at IS NOT NULL THEN
      RAISE EXCEPTION 'member_progress: kun medlemmet selv skriver seen_at/acknowledged_at/skipped_at/last_position_seconds/brugbar — rådgiveren skriver markeret_at/markeret_af';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: identiteten flyttes aldrig.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.content_item_id IS DISTINCT FROM OLD.content_item_id THEN
    RAISE EXCEPTION 'member_progress: user_id og content_item_id kan ikke ændres';
  END IF;
  -- Medlemmets felter er låst — undtagen rydningen af rådgiverens eget stempel
  -- (fortrydMarkeringPatch): acknowledged_at/seen_at → NULL, når de er lig
  -- OLD.markeret_at (de backfillede batch-rækker).
  IF NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
     AND NOT (NEW.acknowledged_at IS NULL AND OLD.markeret_at IS NOT NULL AND OLD.acknowledged_at = OLD.markeret_at) THEN
    RAISE EXCEPTION 'member_progress: acknowledged_at er medlemmets eget — rådgiveren bruger markeret_at';
  END IF;
  IF NEW.seen_at IS DISTINCT FROM OLD.seen_at
     AND NOT (NEW.seen_at IS NULL AND OLD.markeret_at IS NOT NULL AND OLD.seen_at = OLD.markeret_at) THEN
    RAISE EXCEPTION 'member_progress: seen_at er medlemmets eget';
  END IF;
  IF NEW.skipped_at IS DISTINCT FROM OLD.skipped_at
     OR NEW.last_position_seconds IS DISTINCT FROM OLD.last_position_seconds
     OR NEW.brugbar IS DISTINCT FROM OLD.brugbar
     OR NEW.brugbar_at IS DISTINCT FROM OLD.brugbar_at THEN
    RAISE EXCEPTION 'member_progress: skipped_at/last_position_seconds/brugbar er medlemmets egne';
  END IF;
  -- En backfillet batch-række (acknowledged_at eller seen_at = OLD.markeret_at)
  -- må ikke få et NYT markeret_at, uden at rådgiverens gamle stempel ryddes i
  -- samme skrivning: så ville det gamle stempel ikke længere være lig
  -- markeret_at, og klientens dom (progressState.erRaadgiverensStempel) ville
  -- læse det som medlemmets EGET «gennemført». Fortryd (→ NULL) er tilladt.
  IF NEW.markeret_at IS NOT NULL
     AND NEW.markeret_at IS DISTINCT FROM OLD.markeret_at
     AND OLD.markeret_at IS NOT NULL
     AND ((NEW.acknowledged_at IS NOT NULL AND NEW.acknowledged_at = OLD.markeret_at)
          OR (NEW.seen_at IS NOT NULL AND NEW.seen_at = OLD.markeret_at)) THEN
    RAISE EXCEPTION 'member_progress: fortryd rådgiverens gamle stempel før en ny markering (batch-rækken ville ellers blive medlemmets egen)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_progress_markering_vaern ON public.member_progress;
CREATE TRIGGER member_progress_markering_vaern
  BEFORE INSERT OR UPDATE ON public.member_progress
  FOR EACH ROW EXECUTE FUNCTION public.member_progress_markering_vaern();
