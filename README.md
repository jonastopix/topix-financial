# The Boardroom

Finansiel rådgivnings-platform for SMV'er bygget på Supabase + Vite/React. Brugere er medlemmer (SMV-ejere/CFO'er) og advisors der hjælper dem med økonomi-overblik, milepæle og strategi.

Prod: `app.theboardroom.dk`

## Stack

- Frontend: Vite, React 18, TypeScript, shadcn-ui, Tailwind
- Backend: Supabase (Postgres + Auth + Edge Functions/Deno)
- Hosting: Lovable Cloud
- Observability: Sentry
- Data: TanStack Query, react-hook-form + zod
- Integrationer: Stripe, Slack, Circle, Monday.com webhook

For komplet liste: se CLAUDE.md.

## Setup

```sh
git clone <repo-url>
cd topix-financial
bun install
bun dev
```

## Kommandoer

- `bun dev` — dev-server (Vite)
- `bun test` — vitest
- `bun lint` — eslint
- `bun install` — installer dependencies

## Dokumentation

- `CLAUDE.md` — arkitektur, deploy-model, RLS-mønstre, edge function-buckets, FORBIDDEN-zoner
- `supabase/SECURITY_BASELINE.md` — autoritativ security-checklist
- `BACKLOG.md` — prioriteret arbejdsliste (P0–P3)

## Deploy

Tre-lags asymmetri på Lovable Cloud:

- **Edge functions** (`supabase/functions/`): auto fra git-merge til main
- **Frontend** (`src/`): manuel via Lovable "Update"-knap
- **Migrationer** (`supabase/migrations/`): manuel via Lovable → SQL editor

Se CLAUDE.md's "Deployment af ..."-afsnit for det fulde billede (inklusive verificerings-trin og UI-quirks).

## Branch-flow

`main` er Lovable's skrive-target. Lokalt arbejde foregår på feature-branches → PR → merge til main.

Detaljerede regler (FORBIDDEN-zoner, deploy-disciplin, PR-konventioner): se CLAUDE.md.
