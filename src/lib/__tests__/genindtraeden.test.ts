/**
 * Genindtræden (11/9): en tidligere kunde der betaler sig ind igen.
 * Dommen, arkivnoten og beskeden — grænserne fra begge sider.
 */
import { describe, expect, it } from "vitest";
import {
  erGenindtraeden,
  forrigeKontraktErArkiveret,
  genindtraedelsesBesked,
  genindtraedelsesNote,
} from "../../../supabase/functions/_shared/genindtraeden.ts";

const NU = new Date("2026-09-11T08:00:00.000Z");
const tidligere = { contract_start_date: "2025-05-06", contract_end_date: "2026-05-06", status: "tidligere" };

describe("erGenindtraeden", () => {
  it("passeret slutdato → genindtræden; ingen kontrakt → ikke", () => {
    expect(erGenindtraeden(tidligere, NU)).toBe(true);
    expect(erGenindtraeden({ contract_start_date: null, contract_end_date: null, status: "active" }, NU)).toBe(false);
    expect(erGenindtraeden(null, NU)).toBe(false);
  });
  it("grænsen er slutdagen: i går → genindtræden, i dag → ikke (kontrakten gælder endnu)", () => {
    expect(erGenindtraeden({ ...tidligere, contract_end_date: "2026-09-10" }, NU)).toBe(true);
    expect(erGenindtraeden({ ...tidligere, contract_end_date: "2026-09-11" }, NU)).toBe(false);
    expect(erGenindtraeden({ ...tidligere, contract_end_date: "2027-09-11" }, NU)).toBe(false);
  });
  it("status er ligegyldig for dommen — det er datoen der afgør", () => {
    expect(erGenindtraeden({ ...tidligere, status: "active" }, NU)).toBe(true);
  });
});

describe("forrigeKontraktErArkiveret + genindtraedelsesNote", () => {
  it("arkiveret når en periode slutter på den gamle slutdato — ellers bærer noten kontrakten", () => {
    expect(forrigeKontraktErArkiveret(tidligere, ["2026-05-06"])).toBe(true);
    expect(forrigeKontraktErArkiveret(tidligere, ["2024-05-06"])).toBe(false);
    expect(forrigeKontraktErArkiveret(tidligere, [])).toBe(false);
    expect(forrigeKontraktErArkiveret({ ...tidligere, contract_end_date: null }, ["2026-05-06"])).toBe(false);
  });
  it("noten bærer start, slut og status ordret; ukendt start siges", () => {
    expect(genindtraedelsesNote(tidligere)).toBe(
      "Genindtræden: forrige kontrakt 2025-05-06 → 2026-05-06 (status tidligere) stod ikke i company_perioder og er bevaret her.",
    );
    expect(genindtraedelsesNote({ ...tidligere, contract_start_date: null, status: null })).toContain("ukendt start → 2026-05-06 (status ukendt)");
  });
});

describe("genindtraedelsesBesked", () => {
  it("titlen bærer navn og dato (dedup er på titlen), kroppen de tre datoer og status", () => {
    const b = genindtraedelsesBesked("Coskun Holding ApS", tidligere, "2026-09-11", "2027-09-11");
    expect(b.title).toBe("Coskun Holding ApS er tilbage (2026-09-11)");
    expect(b.body).toBe("Betalte sig ind igen 2026-09-11. Forrige kontrakt sluttede 2026-05-06; den nye løber til 2027-09-11. Status er sat til active.");
  });
});
