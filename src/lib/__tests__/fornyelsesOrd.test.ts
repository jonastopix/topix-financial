import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beslutningsOrd, fornyelsesBadge, BESLUTNINGS_ORD } from "@/lib/fornyelsesOrd";
import type { FornyelseStatus } from "@/lib/fornyelse";

// Record over unionen: får motoren en tolvte status, fejler tsc her.
const ALLE_STATUSSER = Object.keys({
  ophoert: true, udloebet_tilbyd: true, udloebet_tilbyd_ikke: true, udloebet_vindue_lukket: true,
  beslutning_mangler: true, klar_til_tilbud: true, klar_til_afsked: true, uden_for_ordningen: true,
  i_god_tid: true, ingen_slutdato: true, selvbetjener: true,
} satisfies Record<FornyelseStatus, true>) as FornyelseStatus[];

describe("beslutningsOrd — databasens instruks bliver til dansk (Jonas 7/9)", () => {
  it("tilbyd → «vi tilbyder»", () => {
    expect(beslutningsOrd("tilbyd")).toBe("vi tilbyder");
  });
  it("tilbyd_ikke → «vi tilbyder ikke»", () => {
    expect(beslutningsOrd("tilbyd_ikke")).toBe("vi tilbyder ikke");
  });
  it("alt andet læses som «vi tilbyder ikke» — samme dom som fladerne havde inline", () => {
    expect(beslutningsOrd(null)).toBe("vi tilbyder ikke");
    expect(beslutningsOrd(undefined)).toBe("vi tilbyder ikke");
    expect(beslutningsOrd("noget_nyt")).toBe("vi tilbyder ikke");
  });
  it("ordbogen bærer ikke databasens ord råt", () => {
    for (const ord of Object.values(BESLUTNINGS_ORD)) {
      expect(ord).toMatch(/^vi tilbyder( ikke)?$/);
    }
  });
});

describe("fornyelsesBadge — stemplet ligger ved siden af motoren, som i forsidens dom", () => {
  it("klar_til_tilbud + varsel_1_sendt_at → klar_til_tilbud_varslet", () => {
    expect(fornyelsesBadge("klar_til_tilbud", "2026-09-07T11:57:53Z")).toBe("klar_til_tilbud_varslet");
  });
  it("klar_til_tilbud uden stempel → klar_til_tilbud", () => {
    expect(fornyelsesBadge("klar_til_tilbud", null)).toBe("klar_til_tilbud");
    expect(fornyelsesBadge("klar_til_tilbud", undefined)).toBe("klar_til_tilbud");
    expect(fornyelsesBadge("klar_til_tilbud", null, null)).toBe("klar_til_tilbud");
  });
  it("klar_til_tilbud + varsel 2 (påmindelsen) → klar_til_tilbud_paamindet — også med varsel 1 (varsel 2 vinder)", () => {
    expect(fornyelsesBadge("klar_til_tilbud", "2026-08-30T11:00:00Z", "2026-09-07T11:57:53Z")).toBe("klar_til_tilbud_paamindet");
  });
  it("CARMA STUDIO ordret (7/9 kl. 18:29): varsel 2 sat, varsel 1 null → «Påmindelse sendt», ikke «Klar til tilbud»", () => {
    expect(fornyelsesBadge("klar_til_tilbud", null, "2026-09-07T11:57:53Z")).toBe("klar_til_tilbud_paamindet");
  });
  it("alle andre statusser er uændrede, med eller uden stempel", () => {
    for (const status of ALLE_STATUSSER) {
      if (status === "klar_til_tilbud") continue;
      expect(fornyelsesBadge(status, "2026-09-07T11:57:53Z")).toBe(status);
      expect(fornyelsesBadge(status, null)).toBe(status);
      expect(fornyelsesBadge(status, null, "2026-09-07T11:57:53Z")).toBe(status);
    }
  });
});

// Kildelæsende værn (agentforslagVenter.guard-mønstret): de tre flader der
// viser beslutningen SKAL bruge ordbogen og må ikke have databasens ord
// inline igen. forsidensDom er en ren funktion og testes direkte i
// forsidensDom.test.ts — her låses kun at teksten ikke falder tilbage.
const kilder = {
  "src/components/hjemmebane/virksomhed/VirksomhedView.tsx": "",
  "src/components/members/FornyelsesSektion.tsx": "",
  "src/lib/forsidensDom.ts": "",
};
for (const sti of Object.keys(kilder) as (keyof typeof kilder)[]) {
  kilder[sti] = readFileSync(resolve(process.cwd(), sti), "utf8");
}

describe("fladerne siger «vi tilbyder», aldrig databasens «tilbyd» råt", () => {
  it("VirksomhedView og FornyelsesSektion bruger beslutningsOrd", () => {
    for (const sti of ["src/components/hjemmebane/virksomhed/VirksomhedView.tsx", "src/components/members/FornyelsesSektion.tsx"] as const) {
      expect(kilder[sti], `${sti}: importen af beslutningsOrd mangler`).toContain('from "@/lib/fornyelsesOrd"');
      expect(kilder[sti], `${sti}: beslutningsOrd(...) kaldes ikke`).toContain("beslutningsOrd(");
      expect(kilder[sti], `${sti}: databasens ord står inline igen`).not.toMatch(/\? "tilbyd" : "tilbyd ikke"/);
    }
  });
  it("VirksomhedView slår badget op med fornyelsesBadge (stemplet ved siden af motoren)", () => {
    const k = kilder["src/components/hjemmebane/virksomhed/VirksomhedView.tsx"];
    expect(k).toContain("fornyelsesBadge(");
    expect(k, "badget for det varslede trin mangler").toMatch(/klar_til_tilbud_varslet:\s*"/);
    expect(k, "badget for påmindelsen mangler").toMatch(/klar_til_tilbud_paamindet:\s*"Påmindelse sendt"/);
    expect(k, "badget slås op uden varsel_2_sendt_at — CARMA-fejlen").toMatch(/fornyelsesBadge\([^)]*varsel_2_sendt_at/);
  });
  it("forsidens dom siger «Fornyelse besluttet: vi tilbyder»", () => {
    const k = kilder["src/lib/forsidensDom.ts"];
    expect(k).toContain("Fornyelse besluttet: vi tilbyder");
    expect(k).not.toContain("Fornyelse besluttet: tilbyd$");
  });
});
