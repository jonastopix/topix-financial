import { describe, expect, it } from "vitest";
import { erPaaPause, afgoerOvergang, erAabentTrin, genaabningsTrin, KILDER, LUKKEAARSAGER, MENNESKE_HANDLINGER, SYSTEM_HANDLINGER, TRIN, trappensTrin, type Handling, type Trin, type OvergangsKontekst } from "@/lib/ansoegningTrin";
import { KILDER as SKEMA_KILDER } from "@/lib/ansoegning/skema";

const ctx: OvergangsKontekst = { paaPause: false, lukketFraTrin: null };
const dom = (fra: Trin, h: Handling, c = ctx) => afgoerOvergang(fra, h, c);
const ok = (fra: Trin, h: Handling, c = ctx) => {
  const d = dom(fra, h, c);
  if (d.ok === false) throw new Error(`forventede ok fra ${fra} + ${h.art}: ${d.grund}`);
  return d.overgang;
};

describe("ansoegningTrin — formen", () => {
  it("syv trin, syv lukkeårsager, fem kilder; de fire ting fra Mondays statusfelt er adskilt", () => {
    expect(TRIN).toEqual(["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt", "underskrevet", "lukket"]);
    expect(TRIN.length).toBe(7);
    expect(LUKKEAARSAGER.length).toBe(8); // syv + betalte_ikke (dag 60, 18/9 aften)
    expect(LUKKEAARSAGER).toContain("betalte_ikke");
    expect(KILDER).toEqual(["webinar", "anbefaling", "linkedin", "direkte", "andet"]);
    expect([...KILDER]).toEqual([...SKEMA_KILDER]); // B's liste (ansoegningSkema) — én sandhed
    // Ingen etiket bærer et forsøgsnummer eller en rykker
    for (const t of TRIN) expect(t).not.toMatch(/rykker|\d/);
  });

  it("de to menneskebeslutninger står i MENNESKE_HANDLINGER; Calendly, køen og linket i SYSTEM_HANDLINGER", () => {
    expect(MENNESKE_HANDLINGER).toContain("tal_med_dem");
    expect(MENNESKE_HANDLINGER).toContain("afvis");
    expect(MENNESKE_HANDLINGER).toContain("tilbud");
    expect(MENNESKE_HANDLINGER).toContain("afslag");
    for (const s of ["book", "aflys_booking", "svarer_ikke", "udloeb", "ikke_nu"]) {
      expect(SYSTEM_HANDLINGER).toContain(s);
      expect(MENNESKE_HANDLINGER).not.toContain(s);
    }
  });
});

describe("ansoegningTrin — de fem trin i rækkefølge", () => {
  it("ny → indkaldt ved «tal med dem» (beslutning 1, starter indkaldt-trappen fra nu)", () => {
    expect(ok("ny", { art: "tal_med_dem" })).toMatchObject({ til: "indkaldt", start: { trappe: "indkaldt", anker: "nu" }, beslutning: true, annuller: [] });
  });
  it("ny → lukket «afslag_efter_ansoegning» ved afvis", () => {
    expect(ok("ny", { art: "afvis" })).toMatchObject({ til: "lukket", lukkeaarsag: "afslag_efter_ansoegning", annuller: "alle", beslutning: true });
  });
  it("DIREKTE TILBUD FINDES IKKE: ny + tilbud og ny + underskrevet afvises", () => {
    expect(dom("ny", { art: "tilbud" })).toMatchObject({ ok: false, grund: expect.stringContaining("direkte tilbud findes ikke") });
    expect(dom("ny", { art: "underskrevet" }).ok).toBe(false);
    expect(dom("indkaldt", { art: "tilbud" }).ok).toBe(false);
    expect(dom("booket", { art: "tilbud" }).ok).toBe(false);
  });
  it("indkaldt → booket ved Calendly-booking: indkaldt-trappen annulleres, booket-trappen starter fra samtalen", () => {
    expect(ok("indkaldt", { art: "book" })).toMatchObject({ til: "booket", annuller: ["indkaldt"], start: { trappe: "booket", anker: "samtale" }, beslutning: false });
  });
  it("indkaldt → lukket «svarer_ikke» når køen når dag 14", () => {
    expect(ok("indkaldt", { art: "svarer_ikke" })).toMatchObject({ til: "lukket", lukkeaarsag: "svarer_ikke", annuller: "alle" });
  });
  it("booket → afholdt (køen ved sluttid eller rådgiveren); aflysning → indkaldt med ny trappe; flytning → ny booket-trappe", () => {
    expect(ok("booket", { art: "afholdt" })).toMatchObject({ til: "afholdt", annuller: ["booket"] });
    // Rettelse 19/9: ingen ny dag 0-indkaldelse efter en aflysning (aflysningsmailen bærer «vælg en ny tid») — rykkerne dag 2/7/11 og dag 14 kører.
    expect(ok("booket", { art: "aflys_booking" })).toMatchObject({ til: "indkaldt", annuller: ["booket"], start: { trappe: "indkaldt", anker: "nu", fraTrinNr: 1 } });
    expect(ok("booket", { art: "book" })).toMatchObject({ til: "booket", annuller: ["booket"], start: { trappe: "booket", anker: "samtale" } });
  });
  it("afholdt → aftalegrundlag_sendt ved tilbud (beslutning 2) eller lukket «afslag_efter_samtale»", () => {
    expect(ok("afholdt", { art: "tilbud" })).toMatchObject({ til: "aftalegrundlag_sendt", start: { trappe: "aftalegrundlag", anker: "nu" }, beslutning: true });
    expect(ok("afholdt", { art: "afslag" })).toMatchObject({ til: "lukket", lukkeaarsag: "afslag_efter_samtale", beslutning: true });
  });
  it("aftalegrundlag_sendt → underskrevet (alle trapper annulleres — betalingsforløbet overtager) eller udløber dag 21", () => {
    expect(ok("aftalegrundlag_sendt", { art: "underskrevet" })).toMatchObject({ til: "underskrevet", annuller: "alle", start: null, beslutning: true });
    expect(ok("aftalegrundlag_sendt", { art: "udloeb" })).toMatchObject({ til: "lukket", lukkeaarsag: "udloebet" });
  });
  it("betalte_ikke (dag 60, 18/9 aften): KUN fra underskrevet → lukket «betalte_ikke», alle trapper annulleret; systemets, ikke menneskets; genåbning lander på afholdt", () => {
    expect(ok("underskrevet", { art: "betalte_ikke" })).toMatchObject({ til: "lukket", lukkeaarsag: "betalte_ikke", annuller: "alle", start: null });
    for (const fra of ["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt", "lukket"] as const) expect(dom(fra, { art: "betalte_ikke" }).ok).toBe(false);
    expect(SYSTEM_HANDLINGER).toContain("betalte_ikke");
    expect(MENNESKE_HANDLINGER).not.toContain("betalte_ikke");
    expect(genaabningsTrin("underskrevet")).toBe("afholdt");
    expect(ok("lukket", { art: "genaabn" }, { ...ctx, lukketFraTrin: "underskrevet" })).toMatchObject({ til: "afholdt", start: null });
  });
  it("underskrevet er slut for motoren: ingen handling tilladt, heller ikke luk", () => {
    expect(dom("underskrevet", { art: "luk", aarsag: "andet" }).ok).toBe(false);
    expect(dom("underskrevet", { art: "ikke_nu" }).ok).toBe(false);
    expect(erAabentTrin("underskrevet")).toBe(false);
    expect(erAabentTrin("lukket")).toBe(false);
    expect(erAabentTrin("indkaldt")).toBe(true);
  });
});

describe("ansoegningTrin — reaktioner annullerer, pause og lukning", () => {
  it("«ikke nu» fra de åbne trin UNDTAGEN booket: trin uændret, alle trapper annulleret, pause sat, pause-trappen startet", () => {
    for (const fra of ["ny", "indkaldt", "afholdt", "aftalegrundlag_sendt"] as const) {
      expect(ok(fra, { art: "ikke_nu" })).toMatchObject({ til: fra, annuller: "alle", start: { trappe: "pause", anker: "pause" }, saetPause: true, pauseTil: null, ophaevPause: false });
    }
    expect(dom("indkaldt", { art: "ikke_nu" }, { ...ctx, paaPause: true }).ok).toBe(false);
    // Rettelse 19/9: en booket samtale står i Jonas' kalender — pausen må ikke gemme den væk uden aflysning.
    const booket = dom("booket", { art: "ikke_nu" });
    expect(booket.ok).toBe(false);
    expect(booket.ok === false && booket.grund).toMatch(/aflys samtalen først/);
  });
  it("erPaaPause: pausen gælder til dagen før slutdatoen (dansk dato) — en dato i fortiden er ingen pause (rettelse 19/9)", () => {
    const nu = new Date("2026-12-10T08:00:00Z"); // 10/12 kl. 09 dansk
    expect(erPaaPause("2026-12-11", nu)).toBe(true);
    expect(erPaaPause("2026-12-10", nu)).toBe(false); // slutdagen: pausen er slut
    expect(erPaaPause("2026-12-09", nu)).toBe(false);
    expect(erPaaPause(null, nu)).toBe(false);
    expect(erPaaPause(undefined, nu)).toBe(false);
    // midnat dansk: 9/12 kl. 23:30 UTC er 10/12 kl. 00:30 dansk
    expect(erPaaPause("2026-12-10", new Date("2026-12-09T23:30:00Z"))).toBe(false);
    expect(erPaaPause("2026-12-10", new Date("2026-12-09T22:30:00Z"))).toBe(true);
  });
  it("saet_pause (den varige vej, Jonas 18/9): sætter ELLER flytter pausen fra ethvert åbent trin, med eller uden pause i forvejen; skriver sporet; aldrig fra lukket/underskrevet; datoen valideres", () => {
    for (const fra of ["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt"] as const) {
      for (const paaPause of [false, true]) {
        expect(ok(fra, { art: "saet_pause", til: "2026-12-10" }, { ...ctx, paaPause })).toMatchObject({ til: fra, annuller: "alle", start: { trappe: "pause", anker: "pause" }, saetPause: true, pauseTil: "2026-12-10", ophaevPause: false, beslutning: true });
      }
    }
    expect(dom("lukket", { art: "saet_pause", til: "2026-12-10" }).ok).toBe(false);
    expect(dom("underskrevet", { art: "saet_pause", til: "2026-12-10" }).ok).toBe(false);
    expect(dom("ny", { art: "saet_pause", til: "10/12-2026" })).toMatchObject({ ok: false, grund: expect.stringContaining("YYYY-MM-DD") });
    expect(MENNESKE_HANDLINGER).toContain("saet_pause");
    expect(SYSTEM_HANDLINGER).not.toContain("saet_pause");
    // ikke_nu ankres nu også på pausens slutdato (samme trappe)
    expect(ok("ny", { art: "ikke_nu" }).start).toEqual({ trappe: "pause", anker: "pause" });
  });

  it("genoptag (18/9 aften, én dom for tre veje): fra ethvert åbent trin når en pause er SAT — også på selve slutdatoen; trin står, pausen ryddes, kun pause-trappen annulleres, ingen trappe startes, sporet skrives", () => {
    for (const fra of ["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt"] as const) {
      // rådgiveren/ansøgeren: pausen gælder endnu (paaPause) — harPause udeladt = paaPause (fladen)
      expect(ok(fra, { art: "genoptag" }, { ...ctx, paaPause: true })).toMatchObject({ til: fra, annuller: ["pause"], start: null, saetPause: false, ophaevPause: true, beslutning: true });
      // køen på slutdatoen: erPaaPause er falsk, men datoen er sat — samme dom
      expect(ok(fra, { art: "genoptag" }, { ...ctx, paaPause: false, harPause: true })).toMatchObject({ til: fra, annuller: ["pause"], start: null, ophaevPause: true, beslutning: true });
    }
    expect(dom("indkaldt", { art: "genoptag" })).toMatchObject({ ok: false, grund: expect.stringContaining("ikke på pause") });
    expect(dom("indkaldt", { art: "genoptag" }, { ...ctx, paaPause: true, harPause: false })).toMatchObject({ ok: false });
    expect(dom("lukket", { art: "genoptag" }, { ...ctx, paaPause: true, harPause: true }).ok).toBe(false);
    expect(dom("underskrevet", { art: "genoptag" }, { ...ctx, paaPause: true, harPause: true }).ok).toBe(false);
    expect(MENNESKE_HANDLINGER).toContain("genoptag");
    expect(SYSTEM_HANDLINGER).toContain("genoptag");
  });
  it("enhver anden reaktion ophæver pausen", () => {
    expect(ok("indkaldt", { art: "book" }, { ...ctx, paaPause: true }).ophaevPause).toBe(true);
    expect(ok("ny", { art: "tal_med_dem" }, { ...ctx, paaPause: true }).ophaevPause).toBe(true);
  });
  it("luk med årsag fra ethvert åbent trin; lukket tillader kun genaabn", () => {
    expect(ok("booket", { art: "luk", aarsag: "trak_sig" })).toMatchObject({ til: "lukket", lukkeaarsag: "trak_sig", annuller: "alle", beslutning: true });
    expect(dom("lukket", { art: "luk", aarsag: "andet" }).ok).toBe(false);
    expect(dom("lukket", { art: "tal_med_dem" }).ok).toBe(false);
  });
  it("genåbning lander på trinnet før lukningen — aldrig på booket eller aftalegrundlag_sendt", () => {
    expect(genaabningsTrin("ny")).toBe("ny");
    expect(genaabningsTrin(null)).toBe("ny");
    expect(genaabningsTrin("indkaldt")).toBe("indkaldt");
    expect(genaabningsTrin("booket")).toBe("indkaldt");
    expect(genaabningsTrin("afholdt")).toBe("afholdt");
    expect(genaabningsTrin("aftalegrundlag_sendt")).toBe("afholdt");
    expect(ok("lukket", { art: "genaabn" }, { ...ctx, lukketFraTrin: "booket" })).toMatchObject({ til: "indkaldt", start: { trappe: "indkaldt", anker: "nu" }, beslutning: true });
    expect(ok("lukket", { art: "genaabn" }, { ...ctx, lukketFraTrin: "afholdt" })).toMatchObject({ til: "afholdt", start: null });
    expect(dom("ny", { art: "genaabn" }).ok).toBe(false);
  });
  it("hver trappe hører til ét trin; pausen til ingen", () => {
    expect(trappensTrin("indkaldt")).toBe("indkaldt");
    expect(trappensTrin("booket")).toBe("booket");
    expect(trappensTrin("aftalegrundlag")).toBe("aftalegrundlag_sendt");
    expect(trappensTrin("pause")).toBeNull();
  });
});
