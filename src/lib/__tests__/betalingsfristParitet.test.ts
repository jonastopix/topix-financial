import { describe, it, expect } from "vitest";
import {
  afgoerBetalingsfrist,
  BETALINGSFRIST_DAGE,
  PAAMINDELSESDAGE,
  type BetalingsfristInput,
} from "@/lib/betalingsfrist";
// Parity import — the Deno copy is intentionally a verbatim mirror of the
// frontend copy. We import it here so vitest fails loudly if the two drift.
import {
  afgoerBetalingsfrist as afgoerBetalingsfristDeno,
  BETALINGSFRIST_DAGE as BETALINGSFRIST_DAGE_DENO,
  PAAMINDELSESDAGE as PAAMINDELSESDAGE_DENO,
} from "../../../supabase/functions/_shared/betalingsfrist.ts";

// Parity gate — the Deno copy at supabase/functions/_shared/betalingsfrist.ts
// must produce identical output for every input the frontend copy handles:
// alle fem statusværdier, alle grænsedage (13, 14, 24, 25, 30, 31),
// springet, dobbeltsendings-værnet, fremtidsstemplet og det ugyldige
// stempel. If this block fails, the two files have drifted and must be
// re-synced.

const NU = new Date("2026-09-02T10:00:00.000Z");

function mailSendtForDage(n: number): string {
  return new Date(Date.UTC(2026, 8, 2, 8, 0, 0) - n * 86_400_000).toISOString();
}

const input = (overrides: Partial<BetalingsfristInput> = {}): BetalingsfristInput => ({
  prisniveau_oere: 5_000_000,
  underskrevet_at: "2026-08-25T12:00:00.000Z",
  betalingsmail_sendt_at: null,
  sidste_paamindelse_dag: null,
  contract_end_date: null,
  ...overrides,
});

describe("afgoerBetalingsfrist — parity between src/lib and supabase/functions/_shared", () => {
  const parityCases: { navn: string; input: BetalingsfristInput; now: Date }[] = [
    // De fem statusværdier
    { navn: "betalt", input: input({ contract_end_date: "2027-09-01", betalingsmail_sendt_at: mailSendtForDage(40), sidste_paamindelse_dag: 25 }), now: NU },
    { navn: "afventer_pris", input: input({ prisniveau_oere: null }), now: NU },
    { navn: "klar_til_mail", input: input({ prisniveau_oere: 4_000_000 }), now: NU },
    { navn: "afventer_betaling 3 dage", input: input({ betalingsmail_sendt_at: mailSendtForDage(3) }), now: NU },
    { navn: "frist_overskredet 40 dage, 31 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(40), sidste_paamindelse_dag: 31 }), now: NU },
    // Prioriteten
    { navn: "betalt uden pris", input: input({ prisniveau_oere: null, contract_end_date: "2027-09-01" }), now: NU },
    { navn: "afventer_pris med mail=null", input: input({ prisniveau_oere: null, betalingsmail_sendt_at: null }), now: NU },
    { navn: "gammel underskrift", input: input({ underskrevet_at: "2026-06-01T00:00:00.000Z", betalingsmail_sendt_at: mailSendtForDage(3) }), now: NU },
    // Grænserne
    { navn: "13 dage", input: input({ betalingsmail_sendt_at: mailSendtForDage(13) }), now: NU },
    { navn: "14 dage", input: input({ betalingsmail_sendt_at: mailSendtForDage(14) }), now: NU },
    { navn: "24 dage, 14 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(24), sidste_paamindelse_dag: 14 }), now: NU },
    { navn: "25 dage, 14 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(25), sidste_paamindelse_dag: 14 }), now: NU },
    { navn: "30 dage, 25 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(30), sidste_paamindelse_dag: 25 }), now: NU },
    { navn: "31 dage, 25 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(31), sidste_paamindelse_dag: 25 }), now: NU },
    // Springet og dobbeltsending
    { navn: "26 dage uden påmindelse", input: input({ betalingsmail_sendt_at: mailSendtForDage(26) }), now: NU },
    { navn: "45 dage uden påmindelse", input: input({ betalingsmail_sendt_at: mailSendtForDage(45) }), now: NU },
    { navn: "45 dage, 14 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(45), sidste_paamindelse_dag: 14 }), now: NU },
    { navn: "200 dage, 31 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(200), sidste_paamindelse_dag: 31 }), now: NU },
    { navn: "20 dage, 14 sendt", input: input({ betalingsmail_sendt_at: mailSendtForDage(20), sidste_paamindelse_dag: 14 }), now: NU },
    // Dage og tidszone
    { navn: "sendt i dag", input: input({ betalingsmail_sendt_at: "2026-09-02T09:00:00.000Z" }), now: NU },
    { navn: "stemplet i fremtiden", input: input({ betalingsmail_sendt_at: "2026-09-04T09:00:00.000Z" }), now: NU },
    { navn: "23:30 i går → 00:30 i dag", input: input({ betalingsmail_sendt_at: "2026-09-01T23:30:00.000Z" }), now: new Date("2026-09-02T00:30:00.000Z") },
    { navn: "nu tæt på UTC-midnat", input: input({ betalingsmail_sendt_at: mailSendtForDage(14) }), now: new Date("2026-09-02T23:30:00.000Z") },
    { navn: "ugyldigt stempel", input: input({ betalingsmail_sendt_at: "ikke-en-dato" }), now: NU },
  ];

  for (const c of parityCases) {
    it(`parity: ${c.navn}`, () => {
      const fe = afgoerBetalingsfrist(c.input, c.now);
      const deno = afgoerBetalingsfristDeno(c.input, c.now);
      expect(deno).toEqual(fe);
    });
  }

  it("alle dage 0–60 med alle fire værdier af sidste_paamindelse_dag giver samme svar", () => {
    for (let dage = 0; dage <= 60; dage++) {
      for (const sidste of [null, 14, 25, 31]) {
        const i = input({ betalingsmail_sendt_at: mailSendtForDage(dage), sidste_paamindelse_dag: sidste });
        expect(afgoerBetalingsfristDeno(i, NU)).toEqual(afgoerBetalingsfrist(i, NU));
      }
    }
  });
});

describe("låsene er ens i begge kopier", () => {
  it("fristen og påmindelsesdagene", () => {
    expect(BETALINGSFRIST_DAGE_DENO).toBe(BETALINGSFRIST_DAGE);
    expect([...PAAMINDELSESDAGE_DENO]).toEqual([...PAAMINDELSESDAGE]);
  });
});
