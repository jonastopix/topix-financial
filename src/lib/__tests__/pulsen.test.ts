import { describe, expect, it } from "vitest";
import { afgoerPulsen, maanedNavnAf, pulsLinjer, pulsLink, staarOeverstTekst, SVAR_VINDUE_DAGE } from "@/lib/pulsen";
import { FORNYELSE_VENTER_STATUSSER, venterPaaFornyelse, type Forsidensdom, type Grund, type VirksomhedTilDom } from "@/lib/forsidensDom";
import type { Signal } from "@/lib/virksomhedsSignaler";
import type { Fornyelsestilstand } from "@/lib/fornyelse";

// Pulsen (9/9): fire tal af dommens data. Tærsklerne er MOTORERNES —
// tavshed kommer som signal (21 dage i virksomhedsSignaler), fornyelser
// som tilstand (forsidensDom.FORNYELSE_VENTER_STATUSSER). Pulsen regner
// ingen af dem selv; den tæller.

const NU = new Date(2026, 8, 9, 8, 0);
const tavs: Signal = { noegle: "ingen_dialog", koe: "ikke_hoert_fra_laenge", tekst: "Ingen dialog i 40 dage", alvor: 74 };
const aldrig: Signal = { noegle: "aldrig_skrevet", koe: "ikke_hoert_fra_laenge", tekst: "Har aldrig skrevet", alvor: 95 };
const fald: Signal = { noegle: "omsaetningsfald_mom", koe: "stikker_ud", tekst: "Omsætning faldt 20% MoM", alvor: 80 };
const forny = (status: Fornyelsestilstand["status"]): Fornyelsestilstand => ({ status, dage_til_udloeb: 20, tier: "full" });
const v = (companyId: string, over: Partial<VirksomhedTilDom> = {}): VirksomhedTilDom => ({
  companyId, navn: companyId, signaler: [], agentforslagVenter: 0, fornyelse: null, varsel1SendtAt: null, indgang: null, opgaver: [], ...over,
});
const iso = (dageSiden: number) => new Date(NU.getTime() - dageSiden * 86_400_000).toISOString();

describe("afgoerPulsen", () => {
  const virksomheder = [
    v("a", { signaler: [tavs], fornyelse: forny("klar_til_tilbud") }),
    v("b", { signaler: [aldrig] }),
    v("c", { signaler: [fald], fornyelse: forny("beslutning_mangler") }),
    v("d", { fornyelse: forny("i_god_tid") }),
    v("e", { fornyelse: forny("udloebet_tilbyd") }),
  ];
  const facts = [
    { company_id: "a", period_key: "2026-08", data_basis: "measured" },
    { company_id: "b", period_key: "2026-08", data_basis: "estimated" }, // estimat er ikke en rapportering
    { company_id: "c", period_key: "2026-07", data_basis: "measured" }, // forkert måned
    { company_id: "d", period_key: "2026-08", data_basis: "measured" },
    { company_id: "d", period_key: "2026-08", data_basis: "measured" }, // dublet tæller én gang
    { company_id: "x", period_key: "2026-08", data_basis: "measured" }, // uden for universet
  ];
  const svar = [
    { company_id: "a", status: "active", accepted_at: iso(10), closed_at: null },
    { company_id: "b", status: "done", accepted_at: iso(100), closed_at: iso(5) },
    { company_id: "c", status: "expired", accepted_at: null, closed_at: iso(3) }, // udløb er ikke et svar
    { company_id: "d", status: "not_done", accepted_at: null, closed_at: iso(SVAR_VINDUE_DAGE + 1) }, // for gammelt
    { company_id: "e", status: "done", accepted_at: null, closed_at: null, completed_at: iso(20) }, // ARVEN: kun completed_at — et svar er et svar
    { company_id: "x", status: "done", accepted_at: null, closed_at: iso(1) }, // uden for universet
  ];
  const p = afgoerPulsen({ virksomheder, facts, maanedNoegle: "2026-08", svar, nu: NU });

  it("rapporterer: målt række for seneste afsluttede måned, én gang pr. virksomhed, kun i universet", () => {
    expect(p.iAlt).toBe(5);
    expect(p.rapporterer).toEqual({ antal: 2, companyIds: ["a", "d"] });
    expect(p.maanedNavn).toBe("august");
  });
  it("svarer: accepteret eller lukket med svar inden for vinduet; udløb og for gamle tæller ikke; arvens completed_at tæller", () => {
    expect(SVAR_VINDUE_DAGE).toBe(90);
    expect(p.svarer).toEqual({ antal: 3, companyIds: ["a", "b", "e"] });
    // Arven for gammelt: completed_at uden for vinduet tæller ikke.
    const gammel = afgoerPulsen({ virksomheder, facts, maanedNoegle: "2026-08", svar: [{ company_id: "e", status: "done", accepted_at: null, closed_at: null, completed_at: iso(SVAR_VINDUE_DAGE + 1) }], nu: NU });
    expect(gammel.svarer.antal).toBe(0);
  });
  it("uden dom: «står øverst» er nul", () => {
    expect(p.oeverst).toEqual({ tavse: 0, fornyelser: 0 });
  });
  it("med dom: «står øverst» = dem i tallet der har EGEN virksomhedslinje", () => {
    const dom: Pick<Forsidensdom, "linjer"> = {
      linjer: [
        { linje: "virksomhed", companyId: "a", navn: "a", grunde: [] as Grund[], alvor: 95, lukkerOmDage: null, loeftet: false, indsats: 2, grundlag: {} },
        { linje: "virksomhed", companyId: "c", navn: "c", grunde: [] as Grund[], alvor: 80, lukkerOmDage: null, loeftet: false, indsats: 2, grundlag: {} },
        { linje: "tilstand", slags: "tavshed", antal: 1, tekst: "1 virksomhed …", virksomheder: [], alvor: 60, lukkerOmDage: null, loeftet: false, indsats: 2 },
      ],
    };
    const q = afgoerPulsen({ virksomheder, facts, maanedNoegle: "2026-08", svar, nu: NU, dom });
    // tavse a,b: a står øverst → 1. fornyelser a,c,e: a og c står øverst → 2.
    expect(q.tavse.antal).toBe(2);
    expect(q.oeverst).toEqual({ tavse: 1, fornyelser: 2 });
    expect(pulsLinjer(q).map((l) => l.tekst).slice(2)).toEqual(["2 tavse · 1 står øverst", "3 fornyelser venter · 2 står øverst"]);
    expect(staarOeverstTekst(0)).toBe("");
    expect(staarOeverstTekst(1)).toBe(" · 1 står øverst");
  });
  it("tavse: motorens signal, både «ingen dialog» og «aldrig skrevet»", () => {
    expect(p.tavse).toEqual({ antal: 2, companyIds: ["a", "b"] });
  });
  it("fornyelser: dommens tre statusser — i_god_tid tæller ikke", () => {
    expect(p.fornyelser).toEqual({ antal: 3, companyIds: ["a", "c", "e"] });
    expect(FORNYELSE_VENTER_STATUSSER).toEqual(["udloebet_tilbyd", "klar_til_tilbud", "beslutning_mangler"]);
    expect(venterPaaFornyelse("i_god_tid")).toBe(false);
    expect(venterPaaFornyelse(null)).toBe(false);
  });
  it("tomt univers: fire nuller, ingen fejl", () => {
    const tom = afgoerPulsen({ virksomheder: [], facts, maanedNoegle: "2026-08", svar, nu: NU });
    expect([tom.iAlt, tom.rapporterer.antal, tom.svarer.antal, tom.tavse.antal, tom.fornyelser.antal]).toEqual([0, 0, 0, 0, 0]);
  });
  it("linjerne: «3 af 27 har rapporteret august»-formen; én → virksomheden, flere → listen MED ?puls=, nul → intet link", () => {
    const linjer = pulsLinjer(p);
    expect(linjer.map((l) => l.tekst)).toEqual([
      "2 af 5 har rapporteret august",
      "3 af 5 har svaret på et forslag de seneste 90 dage",
      "2 tavse",
      "3 fornyelser venter",
    ]);
    // Flere → listen med pulsens egen parameter, så listen viser pulsens virksomheder (ikke dommens 12).
    expect(linjer.map((l) => l.to)).toEqual([
      "/virksomheder?puls=rapporterer",
      "/virksomheder?puls=svarer",
      "/virksomheder?puls=tavse",
      "/virksomheder?puls=fornyelser",
    ]);
    expect(pulsLink("tavse")).toBe("/virksomheder?puls=tavse");
    const en = pulsLinjer(afgoerPulsen({ virksomheder: [v("a", { signaler: [tavs] })], facts: [], maanedNoegle: "2026-08", svar: [], nu: NU }));
    expect(en[2]).toEqual({ noegle: "tavse", tekst: "1 tavs", to: "/virksomhed/a?grund=tavshed" });
    expect(en[0].to).toBeNull();
  });
  it("maanedNavnAf", () => {
    expect(maanedNavnAf("2026-01")).toBe("januar");
    expect(maanedNavnAf("2026-12")).toBe("december");
    expect(maanedNavnAf("nej")).toBe("nej");
  });
});
