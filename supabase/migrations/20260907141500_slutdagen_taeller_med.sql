-- Slutdatoen er den SIDSTE DAG MED ADGANG — ogsaa i SQL.
--
-- BAGGRUND (7/9-2026). computeMembershipTier er rettet i #698: tier
-- skifter til expired kl. 00:00 UTC dagen EFTER contract_end_date, ikke
-- paa selve slutdagen. De to SQL-domme sagde stadig den gamle graense
-- (contract_end_date > now()), og saa ville et medlem paa sin slutdag
-- have en AABEN skal med LUKKET community, indhold, events og storage.
-- De to hoerer sammen: enten flytter begge graenser, eller ingen af dem.
--
-- MAALT I PROD 7/9 FOER AENDRINGEN:
--   Sessionens tidszone er UTC, saa date + 1 > now() er praecis samme
--   graense som TypeScript-reglen (midnat UTC dagen efter).
--   CARMA STUDIO, slutdato 2026-09-07 (i dag):
--     gammel  contract_end_date > now()      -> false
--     ny      contract_end_date + 1 > now()  -> true
--   Aendringen rammer praecis EEN virksomhed i dag og giver dem den dag
--   de har betalt for. Ingen udloeben virksomhed faar adgang igen; de
--   naermeste er 2 og 6 dage forbi slutdatoen.
--
-- HVEM DET RAMMER, maalt i prod:
--   har_aktivt_medlemskab: 14 RLS-policies (community_traade,
--     community_svar, community_reaktioner, community_visninger,
--     content_items, content_collections, content_item_attachments,
--     events, event_registrations) plus storage-policyen «Members can
--     read content assets» paa bucket content-assets.
--   is_membership_active: ingen policies, men tre DEFINER-funktioner —
--     get_member_directory, get_event_participants,
--     get_event_non_responders. CARMA staar altsaa ogsaa i netvaerket
--     og paa deltagerlister paa deres slutdag, hvilket er rigtigt: de
--     ER medlemmer den dag.
--
-- IKKE ROERT: hent_betalingstilbud og hent_betalingsdata_til_checkout
-- laeser ogsaa contract_end_date, men de afgoer om en NY virksomhed
-- allerede har betalt (indgangen) — ikke om adgangen er aaben. Deres
-- graense betyder noget andet og staar uaendret.
--
-- Begge funktioner genskabes med CREATE OR REPLACE: samme signatur,
-- samme SECURITY DEFINER, samme search_path, samme krop — kun
-- sammenligningen aendres. Definitionerne herunder er hentet fra PROD
-- med pg_get_functiondef og kopieret TEGN FOR TEGN, ikke fra
-- migrationsfilerne.

CREATE OR REPLACE FUNCTION public.har_aktivt_medlemskab(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE cm.user_id = _user_id
      AND c.is_legat = false
      AND c.contract_end_date IS NOT NULL
      -- Slutdagen taeller med (7/9): adgang til og med contract_end_date,
      -- lukket fra kl. 00:00 UTC dagen efter. + 1 paa en date giver dagen
      -- efter kl. 00:00; sessionens tidszone er UTC (maalt 7/9).
      AND c.contract_end_date + 1 > now()
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_membership_active(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN c.contract_end_date IS NULL THEN true
        -- Slutdagen taeller med (7/9) — se har_aktivt_medlemskab.
        WHEN c.contract_end_date + 1 > now() THEN true
        WHEN c.subscription_status = 'active'
         AND c.subscription_current_period_end > now() THEN true
        ELSE false
      END
      FROM public.companies c
      WHERE c.id = p_company_id
    ),
    true
  )
$function$;
