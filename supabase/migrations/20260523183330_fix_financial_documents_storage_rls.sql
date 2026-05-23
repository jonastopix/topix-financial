-- Migration: fix_financial_documents_storage_rls
-- Date: 2026-05-23
-- Branch: fix/storage-financial-documents-rls
--
-- WHAT THIS DOES
-- Closes a cross-tenant write hole on the `financial-documents` storage
-- bucket and cleans up three dead/unsafe RLS policies on storage.objects.
--
-- HOLE BEING CLOSED
-- The original INSERT policy "Authenticated users can upload financial
-- documents" (from migration 20260223141214) had
--     WITH CHECK (bucket_id = 'financial-documents')
-- — no path or tenant check. A second INSERT policy "Members can upload to
-- own company" (from migration 20260226070216) adds the correct tenant
-- check, but storage.objects policies are PERMISSIVE (OR-stacked, not
-- AND), so the loose policy always wins. Any authenticated user could
-- upload to any company's prefix. Confidentiality was not directly
-- exposed (SELECT-policy is correctly tenant-scoped), but integrity was:
-- combined with `upsert: true` in the client code (FileUploadZone.tsx,
-- reportFileAccess.ts), an attacker with knowledge of a target
-- company's UUID could overwrite that company's existing report files.
--
-- VERIFIED AGAINST LIVE STATE (not just migration history)
-- Live policy state on storage.objects was inspected via Lovable SQL
-- editor before this migration was written. The three policies dropped
-- here all exist live. The three new policies created here do not.
--
-- WHY AN ADVISOR-BRANCH IS REQUIRED (do not "clean up" this policy)
-- Advisors use the same UI as members to upload financial documents on
-- behalf of customers. See Reports.tsx handleAnnualUpload (line 251) and
-- the two FileUploadZone renders (lines 763, 794) — none of those are
-- gated on isAdvisor. In an advisor session, useAuth's companyId
-- resolves to the customer's company UUID via overrideCompanyId
-- (useAuth.tsx:113), and the upload path becomes {customer_company_id}/...
-- But auth.uid() is the advisor's UUID, and advisors typically have no
-- company_members row, so user_company_id(auth.uid()) returns NULL.
-- A members-only INSERT policy would therefore false-deny every
-- legitimate advisor upload. Policy #4 below is what keeps advisor
-- uploads working once the loose policy is gone. has_role(_, 'advisor')
-- also returns true for admins (admin inherits advisor in has_role's body).
--
-- DEPLOY NOTE
-- Storage policies do not auto-deploy. After merge to main, this SQL
-- must be pasted into Lovable -> SQL editor and run manually. The
-- migration file is the canonical history; Lovable is the deploy channel.


-- ─────────────────────────────────────────────────────────────────────────
-- 1. DROP loose INSERT policy (the actual hole)
-- ─────────────────────────────────────────────────────────────────────────
-- WHY: WITH CHECK is bucket_id only — no path or tenant check. Permissive
-- OR-stack means this policy alone allowed cross-tenant writes regardless
-- of the company-scoped INSERT policy that exists alongside it.
-- WHAT TAKES OVER: "Members can upload to own company" (already live, from
-- migration 20260226070216) for member uploads + new policy #4 below for
-- advisor uploads.
DROP POLICY IF EXISTS "Authenticated users can upload financial documents"
  ON storage.objects;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. DROP dead SELECT policy
-- ─────────────────────────────────────────────────────────────────────────
-- WHY: USING clause is
--     auth.uid()::text = (storage.foldername(name))[1]
-- All actual file paths in this bucket are {company_id}/... (current) or
-- uploads/{user_id}/... (legacy from the pre-20260226 era). In both
-- formats, (storage.foldername(name))[1] is never equal to auth.uid()::text
-- (legacy paths start with the literal "uploads"). The policy has never
-- matched a single real row. Dead since day one.
-- WHAT TAKES OVER: "Members can view own company files" and "Advisors can
-- view all files" (both already live from migration 20260226070216)
-- deliver the actual SELECT access.
DROP POLICY IF EXISTS "Users can view their own financial documents"
  ON storage.objects;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. DROP dead DELETE policy
-- ─────────────────────────────────────────────────────────────────────────
-- WHY: Same form and same problem as the dead SELECT — never matches a
-- real path. Side effect of being dead: Reports.tsx handlePermanentDelete
-- (line 615, called via the trash UI at line 1743) has been silently
-- orphan-leaking storage files since launch, because no DELETE policy
-- actually allowed the storage.remove() call.
-- WHAT TAKES OVER: new policy #5 below (advisor-branch — the only branch
-- exercised by current UI) and new policy #6 below (members-parity — no
-- current UI flow, kept for symmetry with the INSERT/SELECT pattern).
DROP POLICY IF EXISTS "Users can delete their own financial documents"
  ON storage.objects;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. CREATE advisor INSERT-branch
-- ─────────────────────────────────────────────────────────────────────────
-- WHY: Required to keep advisor uploads working after policy #1 is
-- dropped. See top-of-file note "WHY AN ADVISOR-BRANCH IS REQUIRED".
-- DO NOT REMOVE without first removing every advisor upload path in the
-- frontend, or this will break Reports.tsx handleAnnualUpload and every
-- FileUploadZone render reached in advisor mode.
CREATE POLICY "Advisors can upload to any company"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'financial-documents'
    AND public.has_role(auth.uid(), 'advisor')
  );


-- ─────────────────────────────────────────────────────────────────────────
-- 5. CREATE advisor DELETE-branch
-- ─────────────────────────────────────────────────────────────────────────
-- WHY: Reports.tsx handlePermanentDelete (which calls storage.remove())
-- is rendered exclusively inside {isAdvisor && (...)} (Reports.tsx:1699).
-- Members never call storage.remove() for this bucket — they soft-delete
-- via deleted_at only. This policy lets advisor permanent-delete actually
-- remove the storage file, fixing a pre-existing orphan-storage bug as a
-- side effect of closing the larger RLS gap.
CREATE POLICY "Advisors can delete any files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND public.has_role(auth.uid(), 'advisor')
  );


-- ─────────────────────────────────────────────────────────────────────────
-- 6. CREATE members DELETE-parity
-- ─────────────────────────────────────────────────────────────────────────
-- WHY: Mirrors the existing pattern from INSERT ("Members can upload to
-- own company") and SELECT ("Members can view own company files"). No UI
-- flow currently triggers member-side storage.remove() for this bucket;
-- members only soft-delete via deleted_at on the financial_reports row.
-- This policy exists for symmetry and future-proofing: if a future
-- member-facing hard-delete is added, tenant isolation is already
-- enforced at the storage layer.
CREATE POLICY "Members can delete own company files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND (storage.foldername(name))[1] = public.user_company_id(auth.uid())::text
  );
