-- Migration: advisor-write-policies på kpi_targets + kpi_benchmarks
-- Mål-adgang på /noegletal (Projekt Hjemmebane, beslutning 2026-08-05):
-- BÅDE rådgiver og medlem skal kunne sætte mål/benchmarks. I dag har
-- advisors kun SELECT ("Advisors can view all ...") — upsertens
-- UPDATE-gren fejler m. 42501 så snart rækken findes (recon
-- hb-ai-maal-recon.txt §1e; det skæve self-insert-hul uden company-tjek
-- er bogført SEPARAT som BACKLOG [P4], ikke del af denne migration).
--
-- PRÆCIS FIRE nye policies — ingen andre ændringer, ingen DROP:
-- INSERT m. WITH CHECK + UPDATE m. USING + WITH CHECK pr. tabel.
-- Ingen DELETE: saveAdvanced upserter kun, sletter aldrig.
-- Mønstret spejler 20260805200000_member_progress_advisor_write.sql.
-- Policies stakker permissivt (OR) — self-only- og company-policies er
-- urørte og fortsat medlemmernes veje.
-- BEVIDST VILKÅR (godkendt 2026-08-05): user_id er "sidste skriver" —
-- upsert m. onConflict (company_id, kpi_key) FLIPPER rækkens user_id
-- til den skrivende bruger. Uskadeligt for adgang (medlemmets
-- læse-/skriveadgang er company-baseret), og giver et groft spor af
-- hvem der sidst satte målet. Bogført i SECURITY_BASELINE i samme PR.
-- DEPLOY: køres manuelt i Lovable -> SQL editor efter merge
-- (migrationer auto-deployer aldrig). Rækkefølge: migration FØR
-- frontend-"Update" (UI'en åbner Avanceret for advisors).

CREATE POLICY "Advisors can insert kpi targets"
  ON public.kpi_targets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update kpi targets"
  ON public.kpi_targets FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'))
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert benchmarks"
  ON public.kpi_benchmarks FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update benchmarks"
  ON public.kpi_benchmarks FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'))
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));
