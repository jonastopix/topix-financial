# Boardroom MCP-server (fase 1)

MCP-server til The Boardroom-platformen. **Fase 1**: stdio-transport med fire tools —
`ping`, `get_company_overview`, `get_parse_status` og `get_financial_metrics`
(read-only; skrivende tools kommer i Sprint 4).

Bygget efter beslutningerne i [`docs/mcp/RECON.md`](../docs/mcp/RECON.md) — selvstændig
Bun/Node-pakke (ikke edge function), egen streng `tsconfig` (`strict: true`), og et
`AccessContext`-lag der spejler den kodificerede tenant-scoping-kæde fra RECON §2.

## Forudsætninger

- Bun `1.3.13` (samme pin som repoets CI).
- Miljøvariabler (læses ved opstart, aldrig committet). Fase 1-auth er advisor-login
  (`signInWithPassword`, se `src/access/accessContext.ts`) — RLS er den reelle
  håndhævelse:
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY` — publishable (anon) key; bærer ingen rettigheder selv,
    advisor-JWT'en gør.
  - `MCP_ADVISOR_EMAIL` / `MCP_ADVISOR_PASSWORD` — advisor-login.
  - `SUPABASE_SERVICE_ROLE_KEY` — **valgfri og normalt fraværende**: prod-instansen er
    Lovable-ejet, så nøglen er ikke tilgængelig. Læses kun passivt hvis sat.

Kopiér `.env.example` til `mcp/.env` (gitignored) og udfyld værdierne. Serveren fejler
tydeligt ved opstart hvis en nøgle mangler — og skriver aldrig værdien i output.

> ⚠️ **`.env`-autoload er cwd-bundet.** Bun læser kun `.env` fra den aktuelle
> arbejdsmappe. Startes serveren med absolut sti fra en anden mappe, findes `mcp/.env`
> IKKE (verificeret empirisk 2026-08-04: fra repo-roden fejler opstart med manglende
> `MCP_ADVISOR_*`, mens rodens tracked `.env` delvist skygger). Brug altid `cd mcp`
> eller `bun run --cwd <sti>/mcp` — og bemærk at flag-rækkefølgen er signifikant:
> `--cwd` skal stå EFTER `run` (`bun --cwd … run` afvises af Buns CLI-parser).

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
bun run start
```

`cd mcp` er obligatorisk — Bun autoloader `mcp/.env` fra arbejdsmappen (se
cwd-advarslen under Forudsætninger). Serveren taler MCP over **stdio**. Den logger
kun til stderr (stdout er protokol-kanalen) og skriver
`[boardroom-mcp] connected via stdio as user:<advisor-uuid>` når forbindelsen er oppe.

## Tilslut til Claude Code

Registrér serveren som en lokal stdio-MCP-server. `--cwd` EFTER `run` sætter
arbejdsmappen før `.env`-autoload, så `mcp/.env` læses uanset hvor klienten spawner
processen fra — credentials skal derfor ikke stå i klient-konfigurationen:

```sh
claude mcp add boardroom -- bun run --cwd /ABSOLUT/STI/TIL/mcp start
```

Eller i en MCP-klient-konfiguration (fx `.mcp.json`):

```json
{
  "mcpServers": {
    "boardroom": {
      "command": "bun",
      "args": ["run", "--cwd", "/ABSOLUT/STI/TIL/mcp", "start"]
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
- **`src/supabase/client.ts`** — klient-fabrikker (advisor + service-role) efter
  RECON §2-mønstret; **`src/supabase/session.ts`** — `queryWithReauth` (ét retry ved
  JWT-udløb midt i et kald).
- **`src/schema/columns.ts`** — kanoniske kolonnelister fra RECON §3; tools bygger
  select-lister herfra og skriver aldrig `select *`.
- **`src/tools/`** — `ping` + de tre read-tools (`getCompanyOverview`,
  `getParseStatus`, `getFinancialMetrics`); alle med rene `run*`-handlers der afvises
  uden gyldig kontekst.

## Kendte forhold

- **Rod-`.env` er tracket i git.** I dag indeholder den kun publishable keys (klient-sikre),
  ikke service-role-nøglen. Det er flaget til **backlog/fase 2** og håndteres ikke i denne
  sprint. MCP-serverens egen `mcp/.env` er gitignored, og service-role-nøglen ligger aldrig
  i repoet.
