import { describe, expect, it } from "vitest";
import { aftaleTilAnsoeger } from "../../../supabase/functions/_shared/ansoegerAftale.ts";

// Brist 8 (18/9): hvad statussiden får at vide om e-underskriften — url + tilstand, intet andet.
const nu = new Date("2026-09-25T10:00:00Z");
const sendt = { token: "11111111-2222-4333-8444-555555555555", status: "sendt" as const, sendt_at: "2026-09-18T12:00:00Z", underskrevet_at: null };

describe("aftaleTilAnsoeger", () => {
  it("ingen aftale → null (siden falder tilbage på aftale_url)", () => {
    expect(aftaleTilAnsoeger(null, nu)).toBeNull();
    expect(aftaleTilAnsoeger(undefined, nu)).toBeNull();
  });
  it("sendt for 7 dage siden → kan underskrives, /aftale?token=…, udløb dag 21", () => {
    const u = aftaleTilAnsoeger(sendt, nu)!;
    expect(u.url).toBe("https://app.theboardroom.dk/aftale?token=11111111-2222-4333-8444-555555555555");
    expect(u.tilstand).toBe("kan_underskrives");
    expect(u.udloeber_at).toBe("2026-10-09T12:00:00.000Z");
    expect(u.underskrevet_at).toBeNull();
  });
  it("sendt for 22 dage siden → udløbet, intet udløb i svaret", () => {
    const u = aftaleTilAnsoeger(sendt, new Date("2026-10-10T12:00:01Z"))!;
    expect(u.tilstand).toBe("udloebet");
    expect(u.udloeber_at).toBeNull();
  });
  it("underskrevet vinder — også efter dag 21", () => {
    const u = aftaleTilAnsoeger({ ...sendt, status: "underskrevet", underskrevet_at: "2026-09-20T09:00:00Z" }, new Date("2026-12-01T00:00:00Z"))!;
    expect(u.tilstand).toBe("underskrevet");
    expect(u.underskrevet_at).toBe("2026-09-20T09:00:00Z");
  });
  it("annulleret er annulleret; ulæseligt stempel er ugyldig (fail-closed)", () => {
    expect(aftaleTilAnsoeger({ ...sendt, status: "annulleret" }, nu)!.tilstand).toBe("annulleret");
    expect(aftaleTilAnsoeger({ ...sendt, sendt_at: "ikke en dato" }, nu)!.tilstand).toBe("ugyldig");
  });
  it("svaret bærer aldrig tekst, aftryk eller modtager — kun de fire felter", () => {
    expect(Object.keys(aftaleTilAnsoeger(sendt, nu)!).sort()).toEqual(["tilstand", "udloeber_at", "underskrevet_at", "url"]);
  });
});
