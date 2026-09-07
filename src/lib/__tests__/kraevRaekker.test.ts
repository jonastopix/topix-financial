import { describe, expect, it } from "vitest";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";

describe("kraevRaekker — et Supabase-svar med fejl kaster, ellers rækkerne", () => {
  it("returnerer rækkerne når der ingen fejl er", () => {
    expect(kraevRaekker({ data: [{ id: 1 }, { id: 2 }], error: null }, "companies")).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("returnerer tom liste når data er null uden fejl — tom er et gyldigt svar", () => {
    expect(kraevRaekker({ data: null, error: null }, "company_fornyelse")).toEqual([]);
  });

  it("kaster HentningsFejl med kildens navn og årsagen, når svaret bærer en fejl", () => {
    const svar = { data: null, error: { message: 'column "sent_at" does not exist' } };
    expect(() => kraevRaekker(svar, "company_betalingslink")).toThrow(HentningsFejl);
    expect(() => kraevRaekker(svar, "company_betalingslink")).toThrow(
      'Hentningen af company_betalingslink fejlede: column "sent_at" does not exist',
    );
    try {
      kraevRaekker(svar, "company_betalingslink");
    } catch (e) {
      expect((e as HentningsFejl).kilde).toBe("company_betalingslink");
      expect((e as HentningsFejl).name).toBe("HentningsFejl");
    }
  });

  it("kaster også når data er sat MEN error er sat — fejlen vinder over rækkerne", () => {
    expect(() => kraevRaekker({ data: [], error: { message: "RLS" } }, "agent_proposals")).toThrow("agent_proposals");
  });

  it("kaster ved manglende svar (null/undefined)", () => {
    expect(() => kraevRaekker(null, "conversations")).toThrow("Hentningen af conversations fejlede: intet svar");
    expect(() => kraevRaekker(undefined, "conversations")).toThrow(HentningsFejl);
  });
});
