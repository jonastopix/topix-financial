-- Migration: content_items.handout_module
-- Lektion→handout-kobling (Projekt Hjemmebane, fase 1 — envejs).
-- Arkitektbeslutning 2026-08-05 (jf. hb-handouts-recon §4): dedikeret
-- nullable kolonne på content_items — IKKE attachments-kind (ville kræve
-- CHECK-udvidelse + tredje render/oprettelses-gren), IKKE metadata-jsonb
-- (ingen integritet, ingen kolonne-synlighed).
-- CHECK'en spejler handouts.module-CHECK'en (migration 20260224071122):
-- samme fem værdier, så DB'en afviser ukendte moduler. INGEN FK — handout-
-- definitionerne er kode (src/lib/handoutConfig.ts), ikke rækker; der
-- findes ingen definitions-tabel at pege på. NULL = ingen kobling (default
-- for alt eksisterende og nyt indhold; ingen backfill).
-- RLS: ingen ændringer — kolonnen arver content_items' eksisterende
-- policies. Ingen baseline-påvirkning.
-- DEPLOY: køres manuelt i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). FØR-query, kørsel og bevis-queries m. facit står i
-- docs/hjemmebane/c0-datamodel.md §9 / design-blokken
-- hb-handout-kobling-design.md afsnit 1b. Rækkefølge er bindende:
-- migration + bevis FØR frontend-"Update" (PostgREST-skema-cache; ellers
-- PGRST204 ved gem med handout_module).

ALTER TABLE public.content_items
  ADD COLUMN handout_module TEXT
  CONSTRAINT content_items_handout_module_valid CHECK (
    handout_module IN ('overordnet', 'bogholderi', 'administration', 'salg', 'marketing')
  );
