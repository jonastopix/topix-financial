-- Migration: advisor-write-policies på member_progress
-- Advisor-fremdriftsværktøjet (Projekt Hjemmebane): advisors skal kunne
-- markere medlemmers lektioner som gennemført — ægte member_progress-
-- rækker (acknowledged_at), så medlemsfladen viser Gennemført uændret.
-- Baggrund: Circle Admin API v2 kan ikke levere per-lektion-fremdrift
-- (probet 2026-08-05: 404 på fremdrifts-endpoints) — migreringen af ~35
-- kursister sker manuelt via værktøjet.
--
-- PRÆCIS TO nye policies — ingen andre ændringer:
-- - INSERT m. WITH CHECK (upsert'ens insert-gren),
-- - UPDATE m. USING + WITH CHECK (upsert'ens conflict-gren + toggle/clear;
--   WITH CHECK jf. arkitektafgørelse 5 — symmetri med handouts patch 7).
-- Mønstret spejler "Advisors can update all handouts" (20260310194637) og
-- content-lagets advisor-write (20260804120000). Policies stakker
-- permissivt (OR) — self-only-policyen ("Users can manage own progress")
-- er urørt og fortsat medlemmernes eneste vej.
-- Advisor-SELECT ("Advisors can view all progress") FINDES allerede
-- (20260804120000) — overblikslæsning kræver intet nyt.
-- BEVIDST VILKÅR (godkendt 2026-08-05): acknowledged_at er kildeløs — der
-- er intet audit-spor af, om medlem eller advisor satte markeringen (kun
-- updated_at). Bogført i SECURITY_BASELINE i samme PR.
-- DEPLOY: køres manuelt i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). FØR-query, kørsel og bevis-queries m. facit i
-- design-blokken hb-fremdrift-design.md afsnit 1b. Rækkefølge: migration
-- FØR frontend-"Update".

CREATE POLICY "Advisors can insert progress"
  ON public.member_progress FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update progress"
  ON public.member_progress FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'))
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));
