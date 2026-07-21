# Boardroom MCP-server (fase 1 — skelet)

MCP-server til The Boardroom-platformen. **Fase 1** er et skelet: stdio-transport
og ét `ping`-tool. Databehandlings-tools kommer i senere sprints.

Bygget efter beslutningerne i [`docs/mcp/RECON.md`](../docs/mcp/RECON.md) — selvstændig
Bun/Node-pakke (ikke edge function), egen streng `tsconfig` (`strict: true`), og et
`AccessContext`-lag der spejler den kodificerede tenant-scoping-kæde fra RECON §2.

## Forudsætninger

- Bun `1.3.13` (samme pin som repoets CI).
- Miljøvariabler (læses ved opstart, aldrig committet):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` — bypasser RLS; hentes fra Supabase/Lovable-dashboardet.

Kopiér `.env.example` til `mcp/.env` (gitignored) og udfyld værdierne. Serveren fejler
tydeligt ved opstart hvis en nøgle mangler — og skriver aldrig værdien i output.

## Installation

```sh
cd mcp
bun install
```

## Kør testene

```sh
cd mcp
bun run test
```

Dette er `vitest run` (IKKE `bun test` — Buns indbyggede runner forstår ikke vitest).
Testene er tilkoblet CI via et dedikeret job i `.github/workflows/test.yml`.

## Start lokalt

```sh
cd mcp
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run start
```

Serveren taler MCP over **stdio**. Den logger kun til stderr (stdout er
protokol-kanalen) og skriver `[boardroom-mcp] connected via stdio as service-role:local`
når forbindelsen er oppe.

## Tilslut til Claude Code

Registrér serveren som en lokal stdio-MCP-server:

```sh
claude mcp add boardroom \
  --env SUPABASE_URL=... \
  --env SUPABASE_SERVICE_ROLE_KEY=... \
  -- bun run /ABSOLUT/STI/TIL/mcp/src/index.ts
```

Eller i en MCP-klient-konfiguration (fx `.mcp.json`). Brug env-ekspansion — så
leveres værdierne fra shell-miljøet og står aldrig i klartekst i filen:

```json
{
  "mcpServers": {
    "boardroom": {
      "command": "bun",
      "args": ["run", "/ABSOLUT/STI/TIL/mcp/src/index.ts"],
      "env": {
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}
```

> ⚠️ **En `.mcp.json` med rigtige værdier må ALDRIG committes.** Brug env-ekspansion
> som ovenfor, eller hold filen uden for git. Rodens `.gitignore` ignorerer `.mcp.json`
> som defensivt værn, men det fritager ikke for at holde hemmeligheder ude af filen.

Kald derefter `ping`-toolet — det returnerer serverens navn, version og den aktive
`actor` fra `AccessContext`.

## Arkitektur (fase 1)

- **`src/index.ts`** — entrypoint: bygger kontekst → server → stdio-transport. Eneste
  sted transporten vælges; fase 3 skifter til Streamable HTTP + OAuth her uden at røre tools.
- **`src/access/accessContext.ts`** — `AccessContext`-laget. `dbFor(companyId)` er den
  eneste vej til tenant-tabeller og kører tenant-gaten internt; `dbGlobal()` er kun til
  tabeller uden `company_id` (kræver manuel scoping i kaldet). Ingen tool rører `env` eller
  `createClient` direkte.
- **`src/supabase/client.ts`** — service-role-klient efter RECON §2-mønstret.
- **`src/tools/ping.ts`** — `ping`-toolet + en ren `runPing`-handler der afvises uden
  gyldig kontekst.

## Kendte forhold

- **Rod-`.env` er tracket i git.** I dag indeholder den kun publishable keys (klient-sikre),
  ikke service-role-nøglen. Det er flaget til **backlog/fase 2** og håndteres ikke i denne
  sprint. MCP-serverens egen `mcp/.env` er gitignored, og service-role-nøglen ligger aldrig
  i repoet.
