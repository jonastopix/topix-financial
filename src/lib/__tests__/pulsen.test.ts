import { describe, expect, it } from "vitest";
import { afgoerPulsen, maanedNavnAf, pulsLinjer, SVAR_VINDUE_DAGE } from "@/lib/pulsen";
import { FORNYELSE_VENTER_STATUSSER, venterPaaFornyelse, type VirksomhedTilDom } from "@/lib/forsidensDom";
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
    { company_id: "x", status: "done", accepted_at: null, closed_at: iso(1) }, // uden for universet
  ];
  const p = afgoerPulsen({ virksomheder, facts, maanedNoegle: "2026-08", svar, nu: NU });

  it("rapporterer: målt række for seneste afsluttede måned, én gang pr. virksomhed, kun i universet", () => {
    expect(p.iAlt).toBe(5);
    expect(p.rapporterer).toEqual({ antal: 2, companyIds: ["a", "d"] });
    expect(p.maanedNavn).toBe("august");
  });
  it("svarer: accepteret eller lukket med svar inden for vinduet; udløb og for gamle tæller ikke", () => {
    expect(SVAR_VINDUE_DAGE).toBe(90);
    expect(p.svarer).toEqual({ antal: 2, companyIds: ["a", "b"] });
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
  it("linjerne: «3 af 27 har rapporteret august»-formen; én → virksomheden, flere → listen, nul → intet link", () => {
    const linjer = pulsLinjer(p);
    expect(linjer.map((l) => l.tekst)).toEqual([
      "2 af 5 har rapporteret august",
      "2 af 5 har svaret på et forslag de seneste 90 dage",
      "2 er tavse — ikke hørt fra længe",
      "3 fornyelser venter",
    ]);
    expect(linjer.map((l) => l.to)).toEqual(["/virksomheder", "/virksomheder", "/virksomheder", "/virksomheder"]);
    const en = pulsLinjer(afgoerPulsen({ virksomheder: [v("a", { signaler: [tavs] })], facts: [], maanedNoegle: "2026-08", svar: [], nu: NU }));
    expect(en[2]).toEqual({ noegle: "tavse", tekst: "1 er tavs — ikke hørt fra længe", to: "/virksomhed/a?grund=tavshed" });
    expect(en[0].to).toBeNull();
  });
  it("maanedNavnAf", () => {
    expect(maanedNavnAf("2026-01")).toBe("januar");
    expect(maanedNavnAf("2026-12")).toBe("december");
    expect(maanedNavnAf("nej")).toBe("nej");
  });
});
