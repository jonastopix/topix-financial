import { describe, expect, it } from "vitest";
import { VAGT_DOED_EFTER_MIN, grundTekst, klokken, stribensStart, vagtLinje, type VagtRaekke } from "@/lib/cronVagt";

// Cron-vagten (9/9): dommen bor i SQL; her testes formuleringen af linjen
// på forsiden — de fem tilstande, tiderne og grundenes ord.

const NU = new Date(2026, 8, 10, 9, 30); // 10/9 kl. 09:30
const t = (timerSiden: number, minutter = 7) => new Date(NU.getFullYear(), NU.getMonth(), NU.getDate(), NU.getHours() - timerSiden, minutter).toISOString();
let id = 0;
const r = (timerSiden: number, dom: VagtRaekke["dom"], grunde: string[] = [], tal: VagtRaekke["tal"] = {}): VagtRaekke => ({
  id: ++id,
  tid: t(timerSiden),
  dom,
  grunde,
  tal,
});

describe("klokken", () => {
  it("lokal tid med to cifre", () => {
    expect(klokken(new Date(2026, 8, 10, 7, 7).toISOString())).toBe("kl. 07:07");
  });
});

describe("vagtLinje — de fem tilstande", () => {
  it("ingen rækker: vagten har ikke kørt endnu (soft)", () => {
    expect(vagtLinje([], NU)).toEqual({ tone: "soft", tekst: "Driften: vagten har ikke kørt endnu." });
  });
  it("seneste række ældre end to timer: vagten selv er død (rust)", () => {
    const l = vagtLinje([r(3, "groen"), r(4, "groen")], NU);
    expect(l.tone).toBe("rust");
    expect(l.tekst).toBe("Driften: vagten har ikke kørt siden kl. 06:07 — cron kører ikke.");
    expect(VAGT_DOED_EFTER_MIN).toBe(120);
  });
  it("rød: grundene og starten på den ubrudte røde stribe", () => {
    const tal = { jobs_ikke_200: 9, koder: { "401": 77 }, vault_noegler: 0 };
    const raekker = [r(0, "roed", ["vault_mangler", "flere_jobs_ikke_200"], tal), r(1, "roed", ["vault_mangler"], tal), r(2, "roed", ["vault_mangler"], tal), r(3, "groen")];
    const l = vagtLinje(raekker, NU);
    expect(l.tone).toBe("rust");
    expect(l.tekst).toBe("Driften: nøglen mangler i vault · 9 cron-jobs svarede ikke 200 (77 × 401) — siden kl. 07:07.");
  });
  it("gul: den pausede kø er ikke rød, men den ses", () => {
    const l = vagtLinje([r(0, "gul", ["koe_pauset"], { usendte_30m: 12, koe_job_aktiv: false }), r(1, "groen")], NU);
    expect(l).toEqual({ tone: "soft", tekst: "Driften: mailjobbet er sat på pause, 12 mails venter · ellers svarede alt 200." });
  });
  it("grøn efter en rød stribe: siger hvornår det var rødt", () => {
    const l = vagtLinje([r(0, "groen"), r(1, "groen"), r(2, "roed", ["vault_mangler"]), r(3, "roed", ["vault_mangler"]), r(4, "groen")], NU);
    expect(l).toEqual({ tone: "soft", tekst: "Driften: alt svarer 200 igen — rød kl. 06:07–07:07." });
  });
  it("grøn hele døgnet: én rolig sætning", () => {
    const raekker = Array.from({ length: 24 }, (_, i) => r(i, "groen"));
    expect(vagtLinje(raekker, NU)).toEqual({ tone: "soft", tekst: "Driften: alt svarede 200 det sidste døgn." });
  });
  it("grøn, men vagten er nyere end et døgn: siger hvornår den begyndte", () => {
    expect(vagtLinje([r(0, "groen"), r(1, "groen")], NU)).toEqual({ tone: "soft", tekst: "Driften: alt har svaret 200 siden vagten begyndte kl. 08:07." });
  });
  it("rækkefølgen i input er ligegyldig — nyeste afgør", () => {
    const a = vagtLinje([r(2, "groen"), r(0, "roed", ["vault_mangler"]), r(1, "roed", ["vault_mangler"])], NU);
    expect(a.tone).toBe("rust");
    expect(a.tekst).toContain("siden kl. 08:07");
  });
});

describe("stribensStart", () => {
  it("finder den ældste række i den ubrudte stribe fra toppen", () => {
    const raekker = [r(0, "roed"), r(1, "roed"), r(2, "groen"), r(3, "roed")];
    expect(stribensStart(raekker, "roed")?.tid).toBe(raekker[1].tid);
    expect(stribensStart(raekker, "groen")).toBeNull();
  });
});

describe("grundTekst — hver kode har ord, ukendte vises som de er", () => {
  it("alle seks", () => {
    expect(grundTekst("vault_mangler", {})).toBe("nøglen mangler i vault");
    expect(grundTekst("flere_jobs_ikke_200", { jobs_ikke_200: 3, koder: { "200": 10, "500": 2, intet_svar: 1 } })).toBe("3 cron-jobs svarede ikke 200 (2 × 500, 1 × intet svar)");
    expect(grundTekst("cron_koersel_fejlet", { koersler_fejlet_60m: 2 })).toBe("2 cron-kørsler fejlede i databasen");
    expect(grundTekst("koe_staar_stille", { usendte_30m: 4, aeldste_usendt_min: 95 })).toBe("4 mails venter i køen, den ældste i 95 min");
    expect(grundTekst("koe_pauset", { usendte_30m: 1 })).toBe("mailjobbet er sat på pause, 1 mails venter");
    expect(grundTekst("koe_job_mangler", {})).toBe("mailjobbet findes ikke i cron");
    expect(grundTekst("noget_nyt", {})).toBe("noget_nyt");
  });
});
