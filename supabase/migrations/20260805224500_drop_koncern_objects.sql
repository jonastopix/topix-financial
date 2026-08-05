-- KONCERN-FJERNELSEN SPOR 3 — DB-drop af alle koncern-objekter.
-- Eksekveret manuelt i prod 2026-08-05 ca. 22:45 (Lovable-instans) —
-- committes for historik/paritet.
-- Grundlag: hb-koncern-recon.txt §C ("SKAL DROPPES"-listen) + Jonas'
-- eksplicitte grønne lys (SECURITY DEFINER-objekter, FORBIDDEN-zonen).
-- Verificeret post-drop 22:46: 0 tabeller · 0 funktioner · 0 policies ·
-- kolonnen droppet (0·0·0·2-kvitteringen).
-- IF EXISTS overalt: migrationen er idempotent mod den allerede
-- eksekverede prod-tilstand.

-- 1) Policy på IKKE-koncern-tabel der refererede koncern-objekter.
-- Begrundelse for DROP POLICY (baseline-reglen): policyen læste
-- group_companies JOIN group_advisor_access og er funktionelt afløst af
-- den brede "Advisors can view all checkins" (20260611140000), som
-- OR-stakker ovenpå — droppet fjerner ingen reel adgang.
DROP POLICY IF EXISTS "Advisors read checkins for their companies" ON public.pulse_checkins;

-- 2) De 8 koncern-tabeller (CASCADE tager deres policies, triggers,
-- indexes og FK'er; jf. §C dør trigger-objekterne med tabellerne).
DROP TABLE IF EXISTS public.group_messages CASCADE;
DROP TABLE IF EXISTS public.group_conversations CASCADE;
DROP TABLE IF EXISTS public.group_advisor_access CASCADE;
DROP TABLE IF EXISTS public.group_feature_flags CASCADE;
DROP TABLE IF EXISTS public.group_memberships CASCADE;
DROP TABLE IF EXISTS public.group_companies CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP TABLE IF EXISTS public.budget_category_group_map CASCADE;

-- 3) De 21 koncern-funktioner (eksakte signaturer fra skabende
-- migrationer; hovedparten SECURITY DEFINER — droppet er selve
-- fjernelsen af dem).
-- Helpers
DROP FUNCTION IF EXISTS public.user_group_id(uuid);
DROP FUNCTION IF EXISTS public.is_group_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.advisor_has_group_access(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_has_group_feature(uuid);
DROP FUNCTION IF EXISTS public.is_group_subcompany(uuid);
DROP FUNCTION IF EXISTS public.user_can_access_group_conversation(uuid);
-- Summaries/RPC'er
DROP FUNCTION IF EXISTS public.get_my_group_financial_summary();
DROP FUNCTION IF EXISTS public.get_group_financial_summary_for_advisor(uuid);
DROP FUNCTION IF EXISTS public.get_group_financial_summary_for_admin(uuid);
DROP FUNCTION IF EXISTS public.get_admin_group_list();
DROP FUNCTION IF EXISTS public.get_my_group_budget_summary(text);
-- Muteringer
DROP FUNCTION IF EXISTS public.create_group(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.admin_create_group(uuid, text, uuid, uuid[], jsonb, uuid[]);
DROP FUNCTION IF EXISTS public.admin_add_company_to_group(uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.owner_add_company_to_group(uuid, text, text);
-- Trigger-funktioner (deres triggers døde m. tabellerne i trin 2)
DROP FUNCTION IF EXISTS public.protect_group_anchor_company();
DROP FUNCTION IF EXISTS public.protect_group_membership_fields();
DROP FUNCTION IF EXISTS public.protect_group_conversation_ops_fields();
DROP FUNCTION IF EXISTS public.protect_group_message_immutable_fields();
DROP FUNCTION IF EXISTS public.create_group_conversation();
DROP FUNCTION IF EXISTS public.update_group_conversation_reply_state();

-- 4) Koncern-kolonnen på notifications (plain uuid, ingen FK).
ALTER TABLE public.notifications DROP COLUMN IF EXISTS group_id;
