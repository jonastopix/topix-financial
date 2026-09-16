-- Svar på en konkret besked i chatten — citatet FØLGER den rigtige besked
-- (Jonas 16/9, form A; mangellisten :2258; ~/Downloads/recon-svar-paa-besked.md).
-- KØRT i prod 16/9 18:00 (SQL editor, med værn på FØR-målingen 17:58). Filen
-- er bogføringen, så laget kan genskabes fra repoet (CLAUDE.md).
--
-- HVAD JONAS BAD OM (14/9, kortet): «man skal kunne svare på en konkret
-- besked, så det tydeligt fremgår hvad der svares på — som i Slack eller
-- iMessage … trådene bliver længere når der kommer 10-15 nye medlemmer.»
-- FORM A (16/9): citatet følger den rigtige besked — rettes originalen,
-- viser citatet den nye tekst; slettes den, står der «Svar på en slettet
-- besked»; klik på citatet ruller op til beskeden. IKKE et frosset citat i
-- context_meta (det ville bevare tekst afsenderen har slettet inden for de
-- 15 minutter, beskedRegler.ts).
--
-- MÅLT I REPOET (reconen §2–§3): messages har tolv kolonner og ingen der
-- peger på en anden besked; panerne indsætter direkte med PostgREST
-- (CompanyChatPane.tsx:767, MemberChatPane.tsx:397), og INSERT-politikkerne
-- dømmer kun sender_id + samtalen — en klient kan sætte enhver kolonne.
-- Tre triggere findes: on_new_message (update_conversation_last_message,
-- SECURITY DEFINER, læser NEW.created_at/conversation_id),
-- trg_update_conversation_reply_state (SECURITY DEFINER, læser
-- NEW.message_type/sender_id/conversation_id/created_at) og
-- protect_message_immutable_fields (BEFORE UPDATE, IKKE definer, låser
-- sender_id og conversation_id). Ingen af dem rører den nye kolonne, og
-- INGEN af dem ændres her. mark_messages_read (SECURITY DEFINER) rører kun
-- read_at — urørt.
--
-- HVAD ÆNDRES:
--   (1) én ny kolonne messages.svar_paa_id uuid NULL — id'et på den besked
--       der svares på. INGEN fremmednøgle (valget forklaret nedenfor).
--   (2) et delvist indeks på kolonnen (kun rækker der ER svar).
--   (3) én ny trigger protect_message_svar_paa (BEFORE INSERT OR UPDATE,
--       SECURITY INVOKER — den kører som den der skriver, og dens SELECT på
--       originalen dømmes af skriverens egne RLS-politikker):
--         INSERT: svar_paa_id skal pege på en besked i SAMME samtale, af
--                 typen 'user', ikke session_prep, og ikke rækken selv.
--                 Kan skriveren ikke SE originalen (medlem: session_prep er
--                 skjult af «Members can view own messages»), findes den
--                 ikke for triggeren → afvist. Det er meningen.
--         UPDATE: svar_paa_id kan ikke ændres efter indsættelse (samme
--                 klasse som protect_message_immutable_fields — men i EGEN
--                 trigger: CLAUDE.md «FORBIDDEN … Ændring af
--                 protect_*_immutable_fields-triggers»). Redigering
--                 (useMessageActions.saveEdit: content + edited_at) rører
--                 den ikke.
--
-- HVORFOR INGEN FREMMEDNØGLE (chattens valg, til Jonas' godkendelse):
--   Bestillingen sagde «REFERENCES messages(id) ON DELETE SET NULL». Men
--   SET NULL sletter sporet: en slettet original giver svar_paa_id = NULL,
--   og svaret ligner et almindeligt indlæg — «Svar på en slettet besked»
--   kan så ALDRIG vises. De andre FK-former duer heller ikke: NO ACTION/
--   RESTRICT gør at et medlem ikke kan slette sin egen besked inden for de
--   15 minutter hvis nogen har nået at svare (sletningen fejler med en
--   FK-fejl i fladen); CASCADE sletter svaret med originalen. En boolsk
--   svar_paa_slettet sat af en BEFORE DELETE-trigger på originalen ville
--   kræve at triggeren opdaterer ANDRES rækker uden om RLS — dvs. en ny
--   SECURITY DEFINER-funktion (CLAUDE.md FORBIDDEN uden grønt lys), og
--   protect_message_svar_paa ville skulle lukke op for netop den ændring.
--   Derfor: kolonnen bærer id'et uden FK; sletning af originalen (hard
--   delete, ingen deleted_at — 20260911020000:19-20) efterlader et id der
--   ikke længere findes; klienten slår originalen op på id med sin RLS, og
--   nul rækker = «Svar på en slettet besked» (src/lib/chatSvar.ts,
--   citatTilstand). For et medlem kan nul rækker ikke betyde «skjult», for
--   triggeren tillod aldrig et svar på en besked medlemmet ikke kunne se.
--   Prisen: et «dinglende» uuid i kolonnen for slettede originaler. Det er
--   det ærlige spor. Ønsker Jonas senere den boolske form, er det en egen
--   migration med grønt lys.
--
-- HVAD DER IKKE ÆNDRES: RLS-politikkerne på messages (SELECT/INSERT/UPDATE/
-- DELETE som 20260831131200, 20260227181624, 20260223152943, 20260903233000,
-- 20260911020000); de tre eksisterende triggere; mark_messages_read;
-- notifikationer (send-slack-chat-notification, notify-chat-reply,
-- send-notification-email læser content, ikke svar_paa_id — reconen §6).
--
-- LOVABLE OG types.ts (OVERLEVERING DEL 4): når migrationen er kørt,
-- regenererer Lovable src/integrations/supabase/types.ts og committer den
-- selv til main («Lovable update» — set 16/9 12:19 og 12:20 UTC efter #918,
-- «ingen commits» holdt ikke). Kør `git fetch` og `git log origin/main -3`
-- FØR næste build i et vindue; typerne skal bære `svar_paa_id: string | null`
-- i messages.Row/Insert/Update. Indtil da bruger klienten `as any` på
-- kolonnen ét sted (insertData er allerede `any`, CompanyChatPane.tsx:758).
--
-- FØR (kør i SQL editor, ÉT resultatsæt — se README «Køreplan» for den
-- fulde UNION ALL):
--   messages: tolv kolonner, ingen svar_paa_id
--     SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='messages' ORDER BY ordinal_position;
--   triggere på messages: on_new_message, protect_message_immutable_fields,
--     trg_update_conversation_reply_state — og INGEN protect_message_svar_paa
--     SELECT tgname FROM pg_trigger WHERE tgrelid='public.messages'::regclass AND NOT tgisinternal ORDER BY 1;
--   md5 af de to DEFINER-triggerfunktioner og mark_messages_read (bogføres,
--   skal være ens EFTER):
--     SELECT proname, md5(pg_get_functiondef(oid)) FROM pg_proc
--      WHERE oid IN ('public.update_conversation_last_message()'::regprocedure,
--                    'public.update_conversation_reply_state()'::regprocedure,
--                    'public.protect_message_immutable_fields()'::regprocedure,
--                    'public.mark_messages_read(uuid)'::regprocedure);
--   FØR MÅLT 16/9 17:58: 12 kolonner, ingen svar_paa_id; tre triggere;
--     mark_messages_read               7f9f7955fdc886c06b7d7099f5629bc1
--     protect_message_immutable_fields 16e4cc4983f1f5c002ab506d6983669d
--     update_conversation_last_message c5cd4bbff4e9e851e94b3cb22127f815
--     update_conversation_reply_state  124d3d14e8a86fbbf8b0d20bb119b861
--   8 policies; indeks: kun messages_pkey. FUND: messages har intet indeks på
--   conversation_id (panernes hentning filtrerer på den) — eget kort.
--
-- EFTER (kør med det samme):
--   samme tre SELECT'er: tretten kolonner (svar_paa_id sidst, uuid, nullable);
--   fire triggere (protect_message_svar_paa ny); de fire md5'er UÆNDREDE;
--   dertil: SELECT indexname FROM pg_indexes WHERE tablename='messages' AND indexname='messages_svar_paa_id_idx';
--   og prøven (som en rådgiver i SQL editor kan den ikke køres — RLS/auth.uid
--   er NULL; prøven er skærm-beviset).
--   EFTER MÅLT 16/9 18:00: svar_paa_id uuid | YES | 13; fire triggere
--   (protect_message_svar_paa prosecdef=f); de fire md5'er UÆNDREDE; 8 policies;
--   messages_svar_paa_id_idx findes; 0 rækker med svar_paa_id.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS svar_paa_id uuid NULL;

COMMENT ON COLUMN public.messages.svar_paa_id IS
  'Svar på en konkret besked (Jonas 16/9, form A): id på den besked der svares på, i samme samtale. Ingen FK med vilje — slettes originalen (hard delete), står id''et tilbage, og klienten viser «Svar på en slettet besked» når opslaget på id giver nul rækker (src/lib/chatSvar.ts). Sættes kun ved INSERT; kan ikke ændres (protect_message_svar_paa).';

CREATE INDEX IF NOT EXISTS messages_svar_paa_id_idx
  ON public.messages (svar_paa_id)
  WHERE svar_paa_id IS NOT NULL;

-- Værnet: samme samtale, en besked der kan besvares, og aldrig ændret bagefter.
-- SECURITY INVOKER (default) — SELECT'en på originalen dømmes af skriverens RLS.
CREATE OR REPLACE FUNCTION public.protect_message_svar_paa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.svar_paa_id IS DISTINCT FROM OLD.svar_paa_id THEN
      RAISE EXCEPTION 'svar_paa_id cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW.svar_paa_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.svar_paa_id = NEW.id THEN
    RAISE EXCEPTION 'svar_paa_id cannot point to the message itself';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messages o
    WHERE o.id = NEW.svar_paa_id
      AND o.conversation_id = NEW.conversation_id
      AND o.message_type = 'user'
      AND o.context_type IS DISTINCT FROM 'session_prep'
  ) THEN
    RAISE EXCEPTION 'svar_paa_id must reference a user message in the same conversation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_message_svar_paa ON public.messages;
CREATE TRIGGER protect_message_svar_paa
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.protect_message_svar_paa();

COMMENT ON FUNCTION public.protect_message_svar_paa() IS
  'Svar på besked (16/9): ved INSERT skal svar_paa_id pege på en ''user''-besked i samme samtale (ikke session_prep, ikke rækken selv) som skriveren selv kan se (SECURITY INVOKER → skriverens RLS); ved UPDATE må svar_paa_id ikke ændres. Egen trigger — protect_message_immutable_fields er urørt (CLAUDE.md FORBIDDEN).';

-- ── VERIFIKATION (EFTER) ────────────────────────────────────────────────
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='messages' AND column_name='svar_paa_id';
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid='public.messages'::regclass AND NOT tgisinternal ORDER BY 1;
-- Forventet: kolonnen uuid/YES; fire triggere inkl. protect_message_svar_paa.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS protect_message_svar_paa ON public.messages;
--   DROP FUNCTION IF EXISTS public.protect_message_svar_paa();
--   DROP INDEX IF EXISTS public.messages_svar_paa_id_idx;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS svar_paa_id;
-- (Kolonnen kan droppes uden datatab ud over svarenes henvisning; types.ts
--  rettes i hånden — Lovable regenererede den IKKE efter kørslen 16/9 18:00,
--  så de tre linjer i messages.Row/Insert/Update er skrevet i hånden i samme PR.)
