import { describe, expect, it } from "vitest";
import {
  flereTekst,
  haster,
  kortUdsnit,
  linjeTekst,
  sendtTekst,
  venterPaaBetaling,
  virksomhedsSti,
  type VenterRaekke,
} from "@/lib/hjemmebane/venterPaaBetaling";

// Forsidekortet «Venter på betaling» (19/9-2026, recon-indgangspaamindelser §5).
// Dagene regnes i hele UTC-kalenderdage fra underskriften (betalingsfrist.ts),
// så prøverne sætter «nu» fast og lægger underskrifterne N døgn tilbage.

const NU = new Date("2026-10-24T09:00:00Z");
const dageSiden = (n: number) => new Date(NU.getTime() - n * 86_400_000).toISOString();

const raekke = (o: Partial<VenterRaekke> & { company_id: string; navn: string; dage: number }): VenterRaekke => ({
  company_id: o.company_id,
  navn: o.navn,
  // === undefined, ikke ??: en pris der er null er netop pointen i flere prøver.
  prisniveau_oere: o.prisniveau_oere === undefined ? 5_000_000 : o.prisniveau_oere,
  underskrevet_at: dageSiden(o.dage),
  betalingsmail_sendt_at: o.betalingsmail_sendt_at === undefined ? dageSiden(o.dage) : o.betalingsmail_sendt_at,
  sidste_paamindelse_dag: o.sidste_paamindelse_dag ?? null,
  faktura_sendt_at: o.faktura_sendt_at ?? null,
  contract_end_date: o.contract_end_date ?? null,
});

describe("venterPaaBetaling — hvem har ikke betalt", () => {
  it("betalt falder ud: en slutdato der GÆLDER er ikke på listen, en passeret er", () => {
    const { liste, ialt } = venterPaaBetaling(
      [
        raekke({ company_id: "a", navn: "Betalt", dage: 14, contract_end_date: "2027-10-24" }),
        raekke({ company_id: "b", navn: "Var medlem", dage: 14, contract_end_date: "2026-10-01" }),
      ],
      NU,
    );
    expect(ialt).toBe(1);
    expect(liste[0]).toMatchObject({ companyId: "b", status: "afventer_betaling" });
  });

  it("slutdagen tæller med — samme grænse som resten af huset (erGaeldendeSlutdato)", () => {
    const iDag = venterPaaBetaling([raekke({ company_id: "a", navn: "I dag", dage: 14, contract_end_date: "2026-10-24" })], NU);
    expect(iDag.ialt).toBe(0);
    const iGaar = venterPaaBetaling([raekke({ company_id: "a", navn: "I går", dage: 14, contract_end_date: "2026-10-23" })], NU);
    expect(iGaar.ialt).toBe(1);
  });

  it("rækkefølgen: prisen mangler → fristen passeret → mail ikke sendt → afventer; flest dage først indenfor hver", () => {
    const { liste } = venterPaaBetaling(
      [
        raekke({ company_id: "d", navn: "Afventer ung", dage: 3 }),
        raekke({ company_id: "c", navn: "Mail ikke sendt", dage: 5, betalingsmail_sendt_at: null }),
        raekke({ company_id: "b", navn: "Frist passeret", dage: 35 }),
        raekke({ company_id: "a", navn: "Mangler pris", dage: 2, prisniveau_oere: null, betalingsmail_sendt_at: null }),
        raekke({ company_id: "e", navn: "Afventer gammel", dage: 20 }),
      ],
      NU,
    );
    expect(liste.map((l) => l.companyId)).toEqual(["a", "b", "c", "e", "d"]);
    expect(liste.map((l) => l.status)).toEqual([
      "afventer_pris",
      "frist_overskredet",
      "klar_til_mail",
      "afventer_betaling",
      "afventer_betaling",
    ]);
  });

  it("haster: kun afventer_pris og frist_overskredet — de to hvor nogen skal gøre noget nu", () => {
    expect(haster("afventer_pris")).toBe(true);
    expect(haster("frist_overskredet")).toBe(true);
    expect(haster("klar_til_mail")).toBe(false);
    expect(haster("afventer_betaling")).toBe(false);
  });

  it("sendtTekst siger det SENESTE der faktisk gik — stempler, ikke dagstal", () => {
    expect(sendtTekst(raekke({ company_id: "a", navn: "x", dage: 40, faktura_sendt_at: "2026-10-01T10:00:00Z", sidste_paamindelse_dag: 31 })))
      .toBe("fakturaen er sendt");
    expect(sendtTekst(raekke({ company_id: "a", navn: "x", dage: 26, sidste_paamindelse_dag: 25 }))).toBe("dag 25 sendt");
    expect(sendtTekst(raekke({ company_id: "a", navn: "x", dage: 3 }))).toBe("betalingsmailen er sendt");
    expect(sendtTekst(raekke({ company_id: "a", navn: "x", dage: 3, betalingsmail_sendt_at: null }))).toBe("betalingsmailen er ikke sendt");
    // Uden pris er der ikke engang sendt en dag 0-mail — og det er OS, der mangler.
    expect(sendtTekst(raekke({ company_id: "a", navn: "x", dage: 3, prisniveau_oere: null, betalingsmail_sendt_at: null })))
      .toBe("prisen er ikke sat — intet er sendt");
  });

  it("linjen siger alder, frist og hvad der er sendt", () => {
    const r = raekke({ company_id: "a", navn: "x", dage: 35, sidste_paamindelse_dag: 31, faktura_sendt_at: "2026-10-20T10:00:00Z" });
    expect(linjeTekst(r, 35, "frist_overskredet")).toBe("35 dage siden underskriften · fristen udløb for 5 dage siden · fakturaen er sendt");
    expect(linjeTekst(raekke({ company_id: "a", navn: "x", dage: 1 }), 1, "afventer_betaling")).toBe("1 dag siden underskriften · betalingsmailen er sendt");
  });

  it("et ulæseligt underskrevet_at vælter ikke kortet — linjen siger det bare", () => {
    const r: VenterRaekke = { ...raekke({ company_id: "a", navn: "Ukendt", dage: 3 }), underskrevet_at: "ikke en dato" };
    const { liste } = venterPaaBetaling([r], NU);
    expect(liste[0].dage).toBeNull();
    expect(liste[0].tekst).toContain("underskrevet (dato ukendt)");
  });

  it("udsnittet: femten bliver til fem og «og 10 mere i indgangen»", () => {
    const femten = Array.from({ length: 15 }, (_, i) =>
      raekke({ company_id: `c${i}`, navn: `Nr ${i}`, dage: 14 }),
    );
    const { liste, ialt } = venterPaaBetaling(femten, NU);
    expect(ialt).toBe(15);
    const { viste, flere } = kortUdsnit(liste);
    expect(viste).toHaveLength(5);
    expect(flere).toBe(10);
    expect(flereTekst(flere)).toBe("og 10 mere i indgangen");
  });

  it("tom liste og stien", () => {
    expect(venterPaaBetaling([], NU)).toEqual({ liste: [], ialt: 0 });
    expect(virksomhedsSti("abc")).toBe("/virksomhed/abc");
  });
});
