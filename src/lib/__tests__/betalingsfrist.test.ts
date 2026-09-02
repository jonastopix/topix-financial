import { describe, it, expect } from "vitest";
import {
  afgoerBetalingsfrist,
  BETALINGSFRIST_DAGE,
  PAAMINDELSESDAGE,
  type BetalingsfristInput,
} from "../betalingsfrist";

/**
 * Fast "nu" i alle tests: 2026-09-02 kl. 10:00 UTC. Dage-beregningen kører
 * på UTC-komponenter, så resultaterne skal være identiske lokalt (CET/CEST)
 * og under TZ=UTC — suiten køres i begge tilstande i CI-flowet.
 */
const NU = new Date("2026-09-02T10:00:00.000Z");

/** Betalingsmail sendt præcis n kalenderdage før NU (kl. 08:00 UTC, som en cron-kørsel). */
function mailSendtForDage(n: number): string {
  return new Date(Date.UTC(2026, 8, 2, 8, 0, 0) - n * 86_400_000).toISOString();
}

const input = (overrides: Partial<BetalingsfristInput> = {}): BetalingsfristInput => ({
  prisniveau_oere: 5000000,
  underskrevet_at: "2026-08-25T12:00:00.000Z",
  betalingsmail_sendt_at: null,
  sidste_paamindelse_dag: null,
  contract_end_date: null,
  ...overrides,
});

describe("afgoerBetalingsfrist — de fem statusværdier", () => {
  it("betalt: contract_end_date er sat → alt andet er ligegyldigt", () => {
    const ud = afgoerBetalingsfrist(
      input({
        contract_end_date: "2027-09-01",
        betalingsmail_sendt_at: mailSendtForDage(40),
        sidste_paamindelse_dag: 25,
      }),
      NU,
    );
    expect(ud.status).toBe("betalt");
    expect(ud).toEqual({ status: "betalt", dage_siden_mail: null, paamindelse_forfalden: null });
  });

  it("afventer_pris: prisniveau_oere er null (§17)", () => {
    const ud = afgoerBetalingsfrist(input({ prisniveau_oere: null }), NU);
    expect(ud.status).toBe("afventer_pris");
    expect(ud).toEqual({ status: "afventer_pris", dage_siden_mail: null, paamindelse_forfalden: null });
  });

  it("klar_til_mail: pris sat, betalingsmail_sendt_at er null (§19: begge udløsere)", () => {
    const ud = afgoerBetalingsfrist(input({ prisniveau_oere: 4000000 }), NU);
    expect(ud.status).toBe("klar_til_mail");
    expect(ud).toEqual({ status: "klar_til_mail", dage_siden_mail: null, paamindelse_forfalden: null });
  });

  it("afventer_betaling: mail sendt for 3 dage siden, ingen påmindelse forfalden", () => {
    const ud = afgoerBetalingsfrist(input({ betalingsmail_sendt_at: mailSendtForDage(3) }), NU);
    expect(ud.status).toBe("afventer_betaling");
    expect(ud).toEqual({ status: "afventer_betaling", dage_siden_mail: 3, paamindelse_forfalden: null });
  });

  it("frist_overskredet: mail sendt for 40 dage siden, dag 31 allerede sendt", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: mailSendtForDage(40), sidste_paamindelse_dag: 31 }),
      NU,
    );
    expect(ud.status).toBe("frist_overskredet");
    expect(ud).toEqual({ status: "frist_overskredet", dage_siden_mail: 40, paamindelse_forfalden: null });
  });
});

describe("afgoerBetalingsfrist — prioriteten", () => {
  it("betalt vinder over afventer_pris: betalt virksomhed uden pris er betalt", () => {
    const ud = afgoerBetalingsfrist(
      input({ prisniveau_oere: null, contract_end_date: "2027-09-01" }),
      NU,
    );
    expect(ud.status).toBe("betalt");
  });

  it("betalt vinder over frist_overskredet: en betalt virksomhed får aldrig en påmindelse", () => {
    const ud = afgoerBetalingsfrist(
      input({ contract_end_date: "2027-09-01", betalingsmail_sendt_at: mailSendtForDage(60) }),
      NU,
    );
    expect(ud.status).toBe("betalt");
    expect(ud.paamindelse_forfalden).toBeNull();
  });

  it("afventer_pris vinder over klar_til_mail: uden pris sendes ingen mail (§17)", () => {
    const ud = afgoerBetalingsfrist(
      input({ prisniveau_oere: null, betalingsmail_sendt_at: null }),
      NU,
    );
    expect(ud.status).toBe("afventer_pris");
  });

  it("underskrevet_at indgår ikke: en gammel underskrift ændrer hverken status eller dage (§19)", () => {
    const ud = afgoerBetalingsfrist(
      input({ underskrevet_at: "2026-06-01T00:00:00.000Z", betalingsmail_sendt_at: mailSendtForDage(3) }),
      NU,
    );
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.dage_siden_mail).toBe(3);
  });
});

describe("afgoerBetalingsfrist — grænserne (13, 14, 24, 25, 30, 31 dage)", () => {
  it("13 dage: afventer_betaling, ingen påmindelse", () => {
    const ud = afgoerBetalingsfrist(input({ betalingsmail_sendt_at: mailSendtForDage(13) }), NU);
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.dage_siden_mail).toBe(13);
    expect(ud.paamindelse_forfalden).toBeNull();
  });

  it("14 dage: afventer_betaling, dag 14 forfalden", () => {
    const ud = afgoerBetalingsfrist(input({ betalingsmail_sendt_at: mailSendtForDage(14) }), NU);
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.dage_siden_mail).toBe(14);
    expect(ud.paamindelse_forfalden).toBe(14);
  });

  it("24 dage, dag 14 sendt: afventer_betaling, ingen påmindelse", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: mailSendtForDage(24), sidste_paamindelse_dag: 14 }),
      NU,
    );
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.paamindelse_forfalden).toBeNull();
  });

  it("25 dage, dag 14 sendt: afventer_betaling, dag 25 forfalden", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: mailSendtForDage(25), sidste_paamindelse_dag: 14 }),
      NU,
    );
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.paamindelse_forfalden).toBe(25);
  });

  it("30 dage, dag 25 sendt: stadig afventer_betaling (fristen er 30 inklusive), ingen påmindelse", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: mailSendtForDage(30), sidste_paamindelse_dag: 25 }),
      NU,
    );
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.dage_siden_mail).toBe(30);
    expect(ud.paamindelse_forfalden).toBeNull();
  });

  it("31 dage, dag 25 sendt: frist_overskredet, dag 31 (fakturaen) forfalden", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: mailSendtForDage(31), sidste_paamindelse_dag: 25 }),
      NU,
    );
    expect(ud.status).toBe("frist_overskredet");
    expect(ud.dage_siden_mail).toBe(31);
    expect(ud.paamindelse_forfalden).toBe(31);
  });
});

describe("afgoerBetalingsfrist — springet og dobbeltsending", () => {
  it("26 dage uden nogen påmindelse: 25 sendes, ikke 14 (den seneste forfaldne vinder)", () => {
    const ud = afgoerBetalingsfrist(input({ betalingsmail_sendt_at: mailSendtForDage(26) }), NU);
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.paamindelse_forfalden).toBe(25);
  });

  it("45 dage uden nogen påmindelse: 31 sendes, ikke 14 eller 25", () => {
    const ud = afgoerBetalingsfrist(input({ betalingsmail_sendt_at: mailSendtForDage(45) }), NU);
    expect(ud.status).toBe("frist_overskredet");
    expect(ud.paamindelse_forfalden).toBe(31);
  });

  it("45 dage, dag 14 sendt: 31 sendes (25 springes over)", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: mailSendtForDage(45), sidste_paamindelse_dag: 14 }),
      NU,
    );
    expect(ud.paamindelse_forfalden).toBe(31);
  });

  it("sidste_paamindelse_dag = 31 giver null uanset alder", () => {
    for (const dage of [31, 45, 200]) {
      const ud = afgoerBetalingsfrist(
        input({ betalingsmail_sendt_at: mailSendtForDage(dage), sidste_paamindelse_dag: 31 }),
        NU,
      );
      expect(ud.status).toBe("frist_overskredet");
      expect(ud.paamindelse_forfalden).toBeNull();
    }
  });

  it("dag 14 sendes ikke igen: 20 dage med sidste = 14 giver null", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: mailSendtForDage(20), sidste_paamindelse_dag: 14 }),
      NU,
    );
    expect(ud.paamindelse_forfalden).toBeNull();
  });
});

describe("afgoerBetalingsfrist — dage og tidszone", () => {
  it("mail sendt i dag (samme kalenderdag, tidligere klokkeslæt): 0 dage", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: "2026-09-02T09:00:00.000Z" }),
      NU,
    );
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.dage_siden_mail).toBe(0);
  });

  it("mail stemplet i fremtiden klemmes til 0 — negativ kan ikke forekomme", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: "2026-09-04T09:00:00.000Z" }),
      NU,
    );
    expect(ud.status).toBe("afventer_betaling");
    expect(ud.dage_siden_mail).toBe(0);
    expect(ud.paamindelse_forfalden).toBeNull();
  });

  it("kalenderdage, ikke 24-timers-perioder: sendt 23:30 UTC i går, nu 00:30 UTC → 1 dag", () => {
    const ud = afgoerBetalingsfrist(
      input({ betalingsmail_sendt_at: "2026-09-01T23:30:00.000Z" }),
      new Date("2026-09-02T00:30:00.000Z"),
    );
    expect(ud.dage_siden_mail).toBe(1);
  });

  it("tidszone-uafhængighed: nu tæt på UTC-midnat giver samme dage-tal som midt på dagen", () => {
    // 23:30 UTC er allerede "i morgen" i dansk lokal tid — dage-beregningen
    // må ikke skifte med maskinens tidszone.
    const sentPaaDagen = new Date("2026-09-02T23:30:00.000Z");
    const ud = afgoerBetalingsfrist(input({ betalingsmail_sendt_at: mailSendtForDage(14) }), sentPaaDagen);
    expect(ud.dage_siden_mail).toBe(14);
    expect(ud.paamindelse_forfalden).toBe(14);
  });

  it("ugyldigt tidsstempel: mailen regnes som sendt (ikke klar_til_mail), alder ukendt, ingen påmindelse", () => {
    const ud = afgoerBetalingsfrist(input({ betalingsmail_sendt_at: "ikke-en-dato" }), NU);
    expect(ud).toEqual({ status: "afventer_betaling", dage_siden_mail: null, paamindelse_forfalden: null });
  });
});

describe("afgoerBetalingsfrist — låse", () => {
  // Ændres disse, ændres mailene i produktion: fristen står som dato i
  // dag 0-mailen, og påmindelsesrytmen er §9's beslutning.
  it("betalingsfristen er 30 dage", () => {
    expect(BETALINGSFRIST_DAGE).toBe(30);
  });

  it("påmindelserne er 14, 25 og 31 — i den rækkefølge", () => {
    expect([...PAAMINDELSESDAGE]).toEqual([14, 25, 31]);
  });

  it("dag 31 er både sidste påmindelse og første dag efter fristen", () => {
    expect(PAAMINDELSESDAGE[PAAMINDELSESDAGE.length - 1]).toBe(BETALINGSFRIST_DAGE + 1);
  });
});
