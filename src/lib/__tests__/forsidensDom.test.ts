import { describe, it, expect } from "vitest";
import {
  afgoerForsidensDom,
  gaarGennemPorten,
  ALVOR_FORNYELSE,
  ALVOR_INDGANG,
  ALVOR_OPGAVE,
  FORM,
  INDSATS,
  LOEFT_DAGE,
  NAER_DEADLINE_DAGE,
  TAERSKEL,
  USAEDVANLIGT_MANGE,
  VINDUE_DAGE,
  type Tilstandslinje,
  type Virksomhedslinje,
  type VirksomhedTilDom,
} from "@/lib/forsidensDom";
import type { Signal } from "@/lib/virksomhedsSignaler";
import type { Fornyelsestilstand } from "@/lib/fornyelse";
import type { Betalingsfristtilstand } from "@/lib/betalingsfrist";

// Fast «nu»: 4. september 2026 kl. 12:00 lokal tid — dagregning for
// opgaver sker i lokale kalenderdage, som opgaveEngine.
const NU = new Date(2026, 8, 4, 12, 0, 0);

function omDage(n: number): Date {
  return new Date(NU.getFullYear(), NU.getMonth(), NU.getDate() + n, 9, 0, 0);
}

// ─── Byggeklodser — motorernes udfald, ikke deres råstof ─────────────────

const aldrigSkrevet: Signal = { noegle: "aldrig_skrevet", koe: "ikke_hoert_fra_laenge", tekst: "Har aldrig skrevet", alvor: 95 };
const ingenDialog = (dage: number, alvor: number): Signal => ({
  noegle: "ingen_dialog", koe: "ikke_hoert_fra_laenge", tekst: `Ingen dialog i ${dage} dage`, alvor,
});
const bankovertraek: Signal = { noegle: "bankovertraek", koe: "stikker_ud", tekst: "Bankovertræk", alvor: 90, detalje: "Bank -12.000 kr." };
const omsaetningsfald: Signal = { noegle: "omsaetningsfald_mom", koe: "stikker_ud", tekst: "Omsætning faldt 20% MoM", alvor: 80 };
const budgetOver: Signal = { noegle: "budget_over", koe: "stikker_ud", tekst: "Omsætning 12% over budgetteret", alvor: 40 };
const ulaeste = (n: number): Signal => ({
  noegle: "ulaeste_beskeder", koe: "venter_paa_svar", tekst: `${n} ulæste beskeder`, alvor: 70 + Math.min(n, 20),
});
const agentforslag: Signal = { noegle: "agentforslag_venter", koe: "agentforslag_venter", tekst: "3 agentforslag venter på din afgørelse", alvor: 55 };
const friskeTal: Signal = { noegle: "friske_tal", koe: "friske_tal", tekst: "Ny rapport for Aug 2026", alvor: 30 };

function fornyelse(status: Fornyelsestilstand["status"], dage: number | null): Fornyelsestilstand {
  return { status, dage_til_udloeb: dage, tier: status.startsWith("udloebet") || status === "ophoert" ? "expired" : "full" };
}

function indgang(status: Betalingsfristtilstand["status"], dageSiden: number | null): Betalingsfristtilstand {
  return { status, dage_siden_underskrift: dageSiden, paamindelse_forfalden: null };
}

let loebenr = 0;
function virksomhed(over: Partial<VirksomhedTilDom> = {}): VirksomhedTilDom {
  loebenr += 1;
  return {
    companyId: over.companyId ?? `c${loebenr}`,
    navn: over.navn ?? `Virksomhed ${loebenr}`,
    signaler: [],
    agentforslagVenter: 0,
    fornyelse: null,
    indgang: null,
    opgaver: [],
    ...over,
  };
}

function aktivOpgave(title: string, dueOmDage: number) {
  return { id: `o-${title}`, title, status: "active", due_date: omDage(dueOmDage) };
}

const virksomhedslinjer = (d: ReturnType<typeof afgoerForsidensDom>) =>
  d.linjer.filter((l): l is Virksomhedslinje => l.linje === "virksomhed");
const tilstandslinjer = (d: ReturnType<typeof afgoerForsidensDom>) =>
  d.linjer.filter((l): l is Tilstandslinje => l.linje === "tilstand");

// ─── Konstanterne — låst så en justering er en bevidst ændring ───────────

describe("konstanterne", () => {
  it("tærsklen er husets 70 (rust i VirksomhedView og RaadgiverForsideView), vinduet 7, løftet 3", () => {
    expect(TAERSKEL).toBe(70);
    expect(VINDUE_DAGE).toBe(7);
    expect(LOEFT_DAGE).toBe(3);
    expect(NAER_DEADLINE_DAGE).toBe(14);
    expect(USAEDVANLIGT_MANGE).toBe(20);
  });

  it("de nye alvorstal passer ind i motorens skala (95/90/80/70/55/50/40/30)", () => {
    expect(ALVOR_FORNYELSE).toEqual({ udloebet_tilbyd: 90, klar_til_tilbud: 75, beslutning_mangler: 70 });
    expect(ALVOR_INDGANG).toEqual({ frist_overskredet: 90, afventer_pris: 85, klar_til_mail: 65, afventer_betaling: 60 });
    expect(ALVOR_OPGAVE).toEqual({ forfalden: 75, inden_for_3_dage: 70, inden_for_14_dage: 55 });
  });

  it("hver slags har en form (§3) og en indsats", () => {
    expect(FORM).toEqual({
      fornyelse: "tilstand",
      indgang: "tilstand",
      venter_i_samtalen: "haendelse",
      tavshed: "tilstand",
      stikker_ud: "haendelse",
      rapporteringsfejl: "haendelse",
      opgave_naer_deadline: "haendelse",
      medlem_har_skrevet: "haendelse",
      agentforslag: "pukkel",
    });
    for (const slags of Object.keys(FORM) as (keyof typeof INDSATS)[]) {
      expect([1, 2, 3]).toContain(INDSATS[slags]);
    }
  });
});

// ─── Hver af de seks slags alene ─────────────────────────────────────────

describe("hver slags alene", () => {
  it("tavshed: «aldrig skrevet» (95) er en tilstand — én samlet linje, ikke en virksomhedslinje", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "CARMA", signaler: [aldrigSkrevet] })], NU);
    expect(d.linjer).toHaveLength(1);
    const l = d.linjer[0];
    expect(l.linje).toBe("tilstand");
    if (l.linje !== "tilstand") throw new Error();
    expect(l.slags).toBe("tavshed");
    expect(l.antal).toBe(1);
    expect(l.alvor).toBe(95);
    expect(l.virksomheder[0].navn).toBe("CARMA");
    expect(l.virksomheder[0].grund.handling).toBe("Skriv til CARMA");
    expect(l.virksomheder[0].grund.signaltype).toBe("aldrig_skrevet");
    expect(d.underStregen.antalTilstandeSamlet).toBe(1);
  });

  it("stikker ud: bankovertræk (90) er en hændelse — egen virksomhedslinje med handling og detalje", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Bastant", signaler: [bankovertraek] })], NU);
    const [l] = virksomhedslinjer(d);
    expect(d.linjer).toHaveLength(1);
    expect(l.navn).toBe("Bastant");
    expect(l.alvor).toBe(90);
    expect(l.grunde).toHaveLength(1);
    expect(l.grunde[0]).toMatchObject({
      slags: "stikker_ud", signaltype: "bankovertraek", tekst: "Bankovertræk",
      handling: "Tag det op med Bastant", detalje: "Bank -12.000 kr.", lukkerOmDage: null, indsats: 3,
    });
  });

  it("ulæst besked: alvor 70 + antal går gennem alvorsporten; handlingen er «svar»", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Nord", signaler: [ulaeste(2)] })], NU);
    const [l] = virksomhedslinjer(d);
    expect(l.grunde[0]).toMatchObject({ slags: "venter_i_samtalen", alvor: 72, handling: "Svar Nord", indsats: 2 });
  });

  it("fornyelse: beslutning_mangler (70) i god afstand er en tilstand — samlet linje gennem alvorsporten", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Syd", fornyelse: fornyelse("beslutning_mangler", 40) })], NU);
    expect(d.linjer).toHaveLength(1);
    const [l] = tilstandslinjer(d);
    expect(l.slags).toBe("fornyelse");
    expect(l.alvor).toBe(70);
    expect(l.tekst).toBe("1 fornyelse venter på dig");
    expect(l.virksomheder[0].grund).toMatchObject({
      signaltype: "beslutning_mangler", lukkerOmDage: 40, handling: "Beslut fornyelsen for Syd", indsats: 1,
    });
  });

  it("fornyelse: udloebet_tilbyd (90) har et lukket vindue — alvor bærer den, ikke hast", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Øst", fornyelse: fornyelse("udloebet_tilbyd", -3) })], NU);
    const [l] = tilstandslinjer(d);
    expect(l.alvor).toBe(90);
    expect(l.virksomheder[0].grund.lukkerOmDage).toBeNull();
    expect(l.virksomheder[0].grund.tekst).toBe("Kontrakten udløb for 3 dage siden — tilbud givet, intet svar");
    expect(l.loeftet).toBe(false);
  });

  it("fornyelse: statusser uden noget at gøre giver ingen grund", () => {
    for (const status of ["klar_til_afsked", "udloebet_tilbyd_ikke", "uden_for_ordningen", "selvbetjener", "i_god_tid", "ingen_slutdato", "ophoert"] as const) {
      const d = afgoerForsidensDom([virksomhed({ fornyelse: fornyelse(status, 5) })], NU);
      expect(d.linjer).toHaveLength(0);
      expect(d.underStregen.antalTilstandeSamlet).toBe(0);
      expect(d.underStregen.antalVirksomhederUnderTaersklen).toBe(0);
    }
  });

  it("indgang: afventer_pris (85) — det er os der blokerer; vinduet er 30 dage fra underskriften", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Vest", indgang: indgang("afventer_pris", 10) })], NU);
    const [l] = tilstandslinjer(d);
    expect(l.slags).toBe("indgang");
    expect(l.alvor).toBe(85);
    expect(l.tekst).toBe("1 indgang er ikke betalt");
    expect(l.virksomheder[0].grund).toMatchObject({
      signaltype: "afventer_pris", lukkerOmDage: 20, handling: "Sæt prisen for Vest",
      tekst: "Indgang: prisen er ikke sat — 20 dage til fristen",
    });
  });

  it("indgang: frist_overskredet (90) har lukket vindue; betalt giver ingen grund", () => {
    const d = afgoerForsidensDom([virksomhed({ indgang: indgang("frist_overskredet", 35) })], NU);
    expect(tilstandslinjer(d)[0].virksomheder[0].grund).toMatchObject({ alvor: 90, lukkerOmDage: null });
    const betalt = afgoerForsidensDom([virksomhed({ indgang: indgang("betalt", null) })], NU);
    expect(betalt.linjer).toHaveLength(0);
  });

  it("opgave nær deadline: forfalden (75) er en hændelse — virksomhedslinje, vinduet er lukket", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Lund", opgaver: [aktivOpgave("Ring til banken", -2)] })], NU);
    const [l] = virksomhedslinjer(d);
    expect(l.grunde[0]).toMatchObject({
      slags: "opgave_naer_deadline", signaltype: "opgave_forfalden", alvor: 75, lukkerOmDage: null,
      tekst: "Opgaven «Ring til banken» forfaldt for 2 dage siden", handling: "Skriv til Lund om «Ring til banken»", indsats: 2,
    });
    expect(l.loeftet).toBe(false);
  });

  it("opgave nær deadline: frist i dag er ikke forfalden (opgaveEngine B2) — inden for 3 dage, alvor 70", () => {
    const d = afgoerForsidensDom([virksomhed({ opgaver: [aktivOpgave("Budget", 0)] })], NU);
    expect(virksomhedslinjer(d)[0].grunde[0]).toMatchObject({
      signaltype: "opgave_inden_for_3_dage", alvor: 70, lukkerOmDage: 0, tekst: "Opgaven «Budget» har frist i dag",
    });
  });

  it("opgave nær deadline: ikke-aktive, uden frist, eller mere end 14 dage ude, giver ingen grund", () => {
    const d = afgoerForsidensDom([
      virksomhed({
        opgaver: [
          { id: "p", title: "Forslag", status: "proposed", due_date: omDage(1) },
          { id: "u", title: "Uden frist", status: "active", due_date: null },
          aktivOpgave("Langt ude", NAER_DEADLINE_DAGE + 1),
        ],
      }),
    ], NU);
    expect(d.linjer).toHaveLength(0);
    expect(d.underStregen.antalVirksomhederUnderTaersklen).toBe(0);
  });
});

// ─── Portene ──────────────────────────────────────────────────────────────

describe("portene (§4)", () => {
  it("alvorsporten alene: alvor >= 70 passerer uden vindue; 69 gør ikke", () => {
    expect(gaarGennemPorten({ alvor: 70, lukkerOmDage: null })).toBe(true);
    expect(gaarGennemPorten({ alvor: 69, lukkerOmDage: null })).toBe(false);
    const d = afgoerForsidensDom([virksomhed({ signaler: [omsaetningsfald] })], NU);
    expect(d.linjer).toHaveLength(1);
    const under = afgoerForsidensDom([virksomhed({ signaler: [budgetOver] })], NU);
    expect(under.linjer).toHaveLength(0);
    expect(under.underStregen.antalVirksomhederUnderTaersklen).toBe(1);
  });

  it("vinduesporten alene: lav alvor passerer når vinduet lukker inden for 7 dage; 8 dage gør ikke", () => {
    expect(gaarGennemPorten({ alvor: 10, lukkerOmDage: 7 })).toBe(true);
    expect(gaarGennemPorten({ alvor: 10, lukkerOmDage: 8 })).toBe(false);
  });

  it("en opgave der KUN kommer med via vinduet: inden_for_14_dage (55) med frist om 6 dage", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Kort", opgaver: [aktivOpgave("Send budget", 6)] })], NU);
    const [l] = virksomhedslinjer(d);
    expect(l.grunde[0]).toMatchObject({ signaltype: "opgave_inden_for_14_dage", alvor: 55, lukkerOmDage: 6 });
    expect(l.alvor).toBeLessThan(TAERSKEL);
    expect(l.loeftet).toBe(false);
    // Samme opgave om 10 dage: intet vindue inden for 7, alvor under 70 → under stregen.
    const senere = afgoerForsidensDom([virksomhed({ opgaver: [aktivOpgave("Send budget", 10)] })], NU);
    expect(senere.linjer).toHaveLength(0);
    expect(senere.underStregen.antalVirksomhederUnderTaersklen).toBe(1);
  });

  it("en tilstand med vindue inden for 7 dage får sin EGEN virksomhedslinje (fornyelse inden fredag)", () => {
    const d = afgoerForsidensDom([virksomhed({ navn: "Frist", fornyelse: fornyelse("beslutning_mangler", 5) })], NU);
    expect(d.linjer).toHaveLength(1);
    expect(d.linjer[0].linje).toBe("virksomhed");
    expect(d.underStregen.antalTilstandeSamlet).toBe(0);
  });

  it("indgang afventer_betaling (60) kommer med via vinduet når fristen er inden for 7 dage", () => {
    const d = afgoerForsidensDom([virksomhed({ indgang: indgang("afventer_betaling", 25) })], NU);
    const [l] = virksomhedslinjer(d);
    expect(l.grunde[0]).toMatchObject({ signaltype: "afventer_betaling", alvor: 60, lukkerOmDage: 5 });
    const tidligt = afgoerForsidensDom([virksomhed({ indgang: indgang("afventer_betaling", 3) })], NU);
    expect(tidligt.linjer).toHaveLength(0);
    expect(tidligt.underStregen.tilstande[0]).toMatchObject({ slags: "indgang", antal: 1, alvor: 60 });
  });
});

// ─── Sorteringen ─────────────────────────────────────────────────────────

describe("sorteringen (§4)", () => {
  it("alvor faldende som hovedregel", () => {
    const d = afgoerForsidensDom([
      virksomhed({ navn: "A", signaler: [omsaetningsfald] }),
      virksomhed({ navn: "B", signaler: [bankovertraek] }),
      virksomhed({ navn: "C", signaler: [ulaeste(1)] }),
    ], NU);
    expect(d.linjer.map((l) => l.alvor)).toEqual([90, 80, 71]);
  });

  it("tre-dages-løftet: noget der lukker inden for 3 dage står øverst uanset alvor", () => {
    const d = afgoerForsidensDom([
      virksomhed({ navn: "Bank", signaler: [bankovertraek] }),
      virksomhed({ navn: "Frist", opgaver: [aktivOpgave("Aflever", 2)] }),
    ], NU);
    expect(d.linjer[0]).toMatchObject({ linje: "virksomhed", navn: "Frist", alvor: 70, lukkerOmDage: 2, loeftet: true });
    expect(d.linjer[1]).toMatchObject({ navn: "Bank", alvor: 90, loeftet: false });
    // Om 4 dage løftes den ikke — bankovertrækket står først igen.
    const senere = afgoerForsidensDom([
      virksomhed({ navn: "Bank", signaler: [bankovertraek] }),
      virksomhed({ navn: "Frist", opgaver: [aktivOpgave("Aflever", LOEFT_DAGE + 1)] }),
    ], NU);
    expect((senere.linjer[0] as Virksomhedslinje).navn).toBe("Bank");
  });

  it("blandt løftede: den der lukker først, først", () => {
    const d = afgoerForsidensDom([
      virksomhed({ navn: "Om tre", opgaver: [aktivOpgave("x", 3)] }),
      virksomhed({ navn: "I dag", opgaver: [aktivOpgave("y", 0)] }),
    ], NU);
    expect(d.linjer.map((l) => (l as Virksomhedslinje).navn)).toEqual(["I dag", "Om tre"]);
  });

  it("to grunde fra samme virksomhed samles til én linje, den vigtigste først — CARMA står én gang", () => {
    const d = afgoerForsidensDom([
      virksomhed({ navn: "CARMA", signaler: [ingenDialog(80, 83), omsaetningsfald] }),
    ], NU);
    expect(d.linjer).toHaveLength(1);
    const [l] = virksomhedslinjer(d);
    expect(l.navn).toBe("CARMA");
    expect(l.grunde.map((g) => g.signaltype)).toEqual(["ingen_dialog", "omsaetningsfald_mom"]);
    expect(l.alvor).toBe(83);
    expect(l.grunde[0].handling).toBe("Skriv til CARMA");
    // Tavsheden er hægtet på linjen — den tælles IKKE også som samlet tilstand.
    expect(d.underStregen.antalTilstandeSamlet).toBe(0);
    expect(tilstandslinjer(d)).toHaveLength(0);
  });

  it("grunde under tærsklen hægtes på en linje der findes alligevel («derfor er du her»)", () => {
    const d = afgoerForsidensDom([virksomhed({ signaler: [bankovertraek, budgetOver] })], NU);
    const [l] = virksomhedslinjer(d);
    expect(l.grunde.map((g) => g.alvor)).toEqual([90, 40]);
    expect(d.underStregen.antalVirksomhederUnderTaersklen).toBe(0);
  });

  it("uafgjort på alvor brydes af indsats — den korteste vinder", () => {
    // Begge 90: bankovertræk (indsats 3, en samtale om tal) mod udløbet
    // fornyelse med tilbud (indsats 1, én afgørelse). Fornyelsen først.
    const d = afgoerForsidensDom([
      virksomhed({ navn: "Tal", signaler: [bankovertraek] }),
      virksomhed({ navn: "Aftale", fornyelse: fornyelse("udloebet_tilbyd", -1) }),
    ], NU);
    expect(d.linjer.map((l) => l.alvor)).toEqual([90, 90]);
    expect(d.linjer[0]).toMatchObject({ linje: "tilstand", slags: "fornyelse", indsats: 1 });
    expect(d.linjer[1]).toMatchObject({ linje: "virksomhed", navn: "Tal", indsats: 3 });
  });

  it("stadig uafgjort: navn, så resultatet er deterministisk", () => {
    const d = afgoerForsidensDom([
      virksomhed({ navn: "Bravo", signaler: [bankovertraek] }),
      virksomhed({ navn: "Alfa", signaler: [bankovertraek] }),
    ], NU);
    expect(d.linjer.map((l) => (l as Virksomhedslinje).navn)).toEqual(["Alfa", "Bravo"]);
  });
});

// ─── Hændelse, tilstand, pukkel (§3) ─────────────────────────────────────

describe("de tre former (§3)", () => {
  it("tilstande samles til ÉN linje på tværs af virksomheder — 16 tavse er én linje, ikke seksten", () => {
    const tavse = Array.from({ length: 16 }, (_, i) => virksomhed({ navn: `Tavs ${i}`, signaler: [ingenDialog(45 + i, 75 + i)] }));
    const d = afgoerForsidensDom(tavse, NU);
    expect(d.linjer).toHaveLength(1);
    const [l] = tilstandslinjer(d);
    expect(l).toMatchObject({ slags: "tavshed", antal: 16, tekst: "16 virksomheder har du ikke hørt fra længe", alvor: 90 });
    expect(l.virksomheder[0].navn).toBe("Tavs 15"); // højeste alvor først
    expect(d.antalOpgaver).toBe(1);
    expect(d.usaedvanligtMange).toBe(false);
    expect(d.underStregen.antalTilstandeSamlet).toBe(16);
  });

  it("en samlet tilstand under tærsklen står under stregen", () => {
    const d = afgoerForsidensDom([
      virksomhed({ signaler: [ingenDialog(25, 63)] }),
      virksomhed({ signaler: [ingenDialog(30, 68)] }),
    ], NU);
    expect(d.linjer).toHaveLength(0);
    expect(d.underStregen.tilstande).toHaveLength(1);
    expect(d.underStregen.tilstande[0]).toMatchObject({ slags: "tavshed", antal: 2, alvor: 68 });
    expect(d.underStregen.antalTilstandeSamlet).toBe(2);
  });

  it("hændelser står hver for sig — to bankovertræk er to linjer", () => {
    const d = afgoerForsidensDom([
      virksomhed({ signaler: [bankovertraek] }),
      virksomhed({ signaler: [bankovertraek] }),
    ], NU);
    expect(d.linjer).toHaveLength(2);
  });

  it("en pukkel: agentforslag samles til én linje pr. slags på tværs af virksomheder, under stregen ved 55", () => {
    const d = afgoerForsidensDom([
      virksomhed({ signaler: [agentforslag], agentforslagVenter: 3 }),
      virksomhed({ signaler: [agentforslag, bankovertraek], agentforslagVenter: 5 }),
    ], NU);
    expect(d.linjer).toHaveLength(1); // kun bankovertrækket
    expect(d.underStregen.pukler).toEqual([
      {
        linje: "pukkel", slags: "agentforslag", antal: 8, tekst: "8 agentforslag venter på din afgørelse",
        alvor: 55, lukkerOmDage: null, loeftet: false, indsats: 1,
      },
    ]);
    // Puklen giver ingen virksomhed en linje og tæller ikke som «anden virksomhed».
    expect(d.underStregen.antalVirksomhederUnderTaersklen).toBe(0);
  });

  it("friske tal (§11) og AI-udsagn (§8, ikke implementeret) giver ingen grunde", () => {
    const d = afgoerForsidensDom([
      virksomhed({
        signaler: [friskeTal],
        aiUdsagn: [{ slags: "medlem_har_skrevet", udsagn: "Medlemmet kan ikke betale løn næste måned", kildeId: "p1" }],
      }),
    ], NU);
    expect(d.linjer).toHaveLength(0);
    expect(d.underStregen).toEqual({ antalVirksomhederUnderTaersklen: 0, antalTilstandeSamlet: 0, tilstande: [], pukler: [] });
  });
});

// ─── Tom liste og tallene under stregen (§5, §10) ────────────────────────

describe("tom liste og tallene under stregen", () => {
  it("tom liste: nul opgaver, intet under stregen — forsiden KAN være tom (§10)", () => {
    expect(afgoerForsidensDom([], NU)).toEqual({
      linjer: [],
      antalOpgaver: 0,
      usaedvanligtMange: false,
      underStregen: { antalVirksomhederUnderTaersklen: 0, antalTilstandeSamlet: 0, tilstande: [], pukler: [] },
    });
  });

  it("virksomheder uden grunde tæller ingen steder", () => {
    const d = afgoerForsidensDom([virksomhed(), virksomhed()], NU);
    expect(d.antalOpgaver).toBe(0);
    expect(d.underStregen.antalVirksomhederUnderTaersklen).toBe(0);
  });

  it("tallene under stregen: «ni andre» tæller virksomheder uden linje med en hændelse under tærsklen; «tre du ikke har skrevet med» tæller de samlede", () => {
    const d = afgoerForsidensDom([
      virksomhed({ navn: "Linje", signaler: [bankovertraek, budgetOver] }), // linje — tæller ikke under
      virksomhed({ navn: "Under 1", signaler: [budgetOver] }),
      virksomhed({ navn: "Under 2", opgaver: [aktivOpgave("x", 10)] }),
      virksomhed({ navn: "Tavs 1", signaler: [ingenDialog(50, 76)] }),
      virksomhed({ navn: "Tavs 2", signaler: [ingenDialog(60, 80)] }),
      virksomhed({ navn: "Tavs 3", signaler: [ingenDialog(70, 82)] }),
      virksomhed({ navn: "Tavs og under", signaler: [ingenDialog(70, 82), budgetOver] }), // i tilstanden, ikke «anden»
      virksomhed({ navn: "Intet", fornyelse: fornyelse("i_god_tid", 120) }), // ingen grund → tæller ingen steder
    ], NU);
    expect(d.antalOpgaver).toBe(2); // Linje + den samlede tavshed (82 >= 70)
    expect(d.underStregen.antalVirksomhederUnderTaersklen).toBe(2);
    expect(d.underStregen.antalTilstandeSamlet).toBe(4);
    expect(tilstandslinjer(d)[0]).toMatchObject({ slags: "tavshed", antal: 4 });
    expect(d.underStregen.tilstande).toHaveLength(0);
  });

  it("flaget for usædvanligt mange sættes ved 20 linjer efter gruppering (§5)", () => {
    const mange = Array.from({ length: USAEDVANLIGT_MANGE }, (_, i) => virksomhed({ navn: `V${i}`, signaler: [bankovertraek] }));
    expect(afgoerForsidensDom(mange, NU).usaedvanligtMange).toBe(true);
    expect(afgoerForsidensDom(mange.slice(1), NU).usaedvanligtMange).toBe(false);
  });

  it("samme input giver samme output, og input muteres ikke", () => {
    const input = [virksomhed({ signaler: [omsaetningsfald, bankovertraek], opgaver: [aktivOpgave("a", 1)] })];
    const foer = JSON.stringify(input);
    const a = afgoerForsidensDom(input, NU);
    const b = afgoerForsidensDom(input, NU);
    expect(a).toEqual(b);
    expect(JSON.stringify(input)).toBe(foer);
  });
});
