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
// alle fem statusværdier, alle grænsedage (13, 14, 24, 25, 30, 31) regnet
// fra UNDERSKRIFTEN (kontraktens frist, rettet 2/9), mail sendt senere end
// underskriften, springet, dobbeltsendings-værnet, fremtidsstemplet og det
// ugyldige stempel. If this block fails, the two files have drifted and
// must be re-synced.

const NU = new Date("2026-09-02T10:00:00.000Z");

function forDage(n: number): string {
  return new Date(Date.UTC(2026, 8, 2, 8, 0, 0) - n * 86_400_000).toISOString();
}

const input = (dageSidenUnderskrift: number, overrides: Partial<BetalingsfristInput> = {}): BetalingsfristInput => ({
  prisniveau_oere: 5_000_000,
  underskrevet_at: forDage(dageSidenUnderskrift),
  betalingsmail_sendt_at: forDage(dageSidenUnderskrift),
  sidste_paamindelse_dag: null,
  contract_end_date: null,
  ...overrides,
});

describe("afgoerBetalingsfrist — parity between src/lib and supabase/functions/_shared", () => {
  const parityCases: { navn: string; input: BetalingsfristInput; now: Date }[] = [
    // De fem statusværdier
    { navn: "betalt", input: input(40, { contract_end_date: "2027-09-01", sidste_paamindelse_dag: 25 }), now: NU },
    { navn: "afventer_pris", input: input(8, { prisniveau_oere: null, betalingsmail_sendt_at: null }), now: NU },
    { navn: "klar_til_mail", input: input(4, { prisniveau_oere: 4_000_000, betalingsmail_sendt_at: null }), now: NU },
    { navn: "afventer_betaling 3 dage", input: input(3), now: NU },
    { navn: "frist_overskredet 40 dage, 31 sendt", input: input(40, { sidste_paamindelse_dag: 31 }), now: NU },
    // Fristen er kontraktens: mailen sendt senere end underskriften
    { navn: "mail 4 dage efter underskrift", input: input(4, { betalingsmail_sendt_at: forDage(0) }), now: NU },
    { navn: "pris sat dag 20 → 25 forfalden", input: input(26, { betalingsmail_sendt_at: forDage(6) }), now: NU },
    { navn: "mail i går, underskrevet for 31 dage siden", input: input(31, { betalingsmail_sendt_at: forDage(1) }), now: NU },
    { navn: "afventer_pris efter 35 dage", input: input(35, { prisniveau_oere: null, betalingsmail_sendt_at: null }), now: NU },
    { navn: "klar_til_mail efter 35 dage", input: input(35, { betalingsmail_sendt_at: null }), now: NU },
    // Prioriteten
    { navn: "betalt uden pris", input: input(8, { prisniveau_oere: null, contract_end_date: "2027-09-01" }), now: NU },
    { navn: "afventer_pris med mail=null", input: input(8, { prisniveau_oere: null, betalingsmail_sendt_at: null }), now: NU },
    // Grænserne
    { navn: "13 dage", input: input(13), now: NU },
    { navn: "14 dage", input: input(14), now: NU },
    { navn: "24 dage, 14 sendt", input: input(24, { sidste_paamindelse_dag: 14 }), now: NU },
    { navn: "25 dage, 14 sendt", input: input(25, { sidste_paamindelse_dag: 14 }), now: NU },
    { navn: "30 dage, 25 sendt", input: input(30, { sidste_paamindelse_dag: 25 }), now: NU },
    { navn: "31 dage, 25 sendt", input: input(31, { sidste_paamindelse_dag: 25 }), now: NU },
    // Springet og dobbeltsending
    { navn: "26 dage uden påmindelse", input: input(26), now: NU },
    { navn: "45 dage uden påmindelse", input: input(45), now: NU },
    { navn: "45 dage, 14 sendt", input: input(45, { sidste_paamindelse_dag: 14 }), now: NU },
    { navn: "200 dage, 31 sendt", input: input(200, { sidste_paamindelse_dag: 31 }), now: NU },
    { navn: "20 dage, 14 sendt", input: input(20, { sidste_paamindelse_dag: 14 }), now: NU },
    // Dage og tidszone
    { navn: "underskrevet i dag", input: input(0, { underskrevet_at: "2026-09-02T09:00:00.000Z" }), now: NU },
    { navn: "underskrift i fremtiden", input: input(0, { underskrevet_at: "2026-09-04T09:00:00.000Z" }), now: NU },
    { navn: "23:30 i går → 00:30 i dag", input: input(0, { underskrevet_at: "2026-09-01T23:30:00.000Z" }), now: new Date("2026-09-02T00:30:00.000Z") },
    { navn: "nu tæt på UTC-midnat", input: input(14), now: new Date("2026-09-02T23:30:00.000Z") },
    { navn: "ugyldigt underskrevet_at, mail sendt", input: input(0, { underskrevet_at: "ikke-en-dato" }), now: NU },
    { navn: "ugyldigt underskrevet_at, uden pris", input: input(0, { underskrevet_at: "ikke-en-dato", prisniveau_oere: null, betalingsmail_sendt_at: null }), now: NU },
  ];

  for (const c of parityCases) {
    it(`parity: ${c.navn}`, () => {
      const fe = afgoerBetalingsfrist(c.input, c.now);
      const deno = afgoerBetalingsfristDeno(c.input, c.now);
      expect(deno).toEqual(fe);
    });
  }

  it("alle dage 0–60 siden underskrift × alle fire værdier af sidste_paamindelse_dag × mail sendt samme dag eller 5 dage senere", () => {
    for (let dage = 0; dage <= 60; dage++) {
      for (const sidste of [null, 14, 25, 31]) {
        for (const mailForsinkelse of [0, 5]) {
          const i = input(dage, {
            sidste_paamindelse_dag: sidste,
            betalingsmail_sendt_at: forDage(Math.max(0, dage - mailForsinkelse)),
          });
          expect(afgoerBetalingsfristDeno(i, NU)).toEqual(afgoerBetalingsfrist(i, NU));
        }
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
