
-- Migration 1: Koncern v1 — Core tables
-- groups, group_memberships, group_companies, group_advisor_access, group_feature_flags

-- Groups table
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL,
  anchor_company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Group memberships (one user = one group max)
CREATE TABLE public.group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_memberships_user_id_unique UNIQUE (user_id)
);

-- Group companies (one company = one group max)
CREATE TABLE public.group_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_companies_company_id_unique UNIQUE (company_id)
);

-- Advisor access to groups (v1: all advisors seeded on creation)
CREATE TABLE public.group_advisor_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  advisor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_advisor_access_unique UNIQUE (group_id, advisor_user_id)
);

-- Feature flags for group access (invite-only)
CREATE TABLE public.group_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_feature_flags_user_id_unique UNIQUE (user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_advisor_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_feature_flags ENABLE ROW LEVEL SECURITY;
