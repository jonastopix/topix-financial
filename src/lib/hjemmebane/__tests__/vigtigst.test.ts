import { describe, expect, it } from "vitest";
import type { StreakDom } from "@/lib/boardroomScore/typer";
import { rapportFristTekst, stilleLinjer, tjeklisteLinje, TJEKLISTE_HASH } from "../vigtigst";

const nu = new Date("2026-10-02T18:00:00Z"); // fredag 2/10-2026 kl. 20 dansk
const streak = (status: StreakDom["status"], laengde: number, key = "2026-09"): StreakDom => ({
  laengde, status, bedste: laengde, aabenMaanedGodkendt: false,
  naesteFrist: { key, tidspunkt: new Date("2026-10-20T21:59:59.999Z"), hverdageTil: 12 },
});

describe("rapportFristTekst — kun sand", () => {
  it("Topix 2/10: september mangler, streaken lever → «så holder din streak»", () => {
    expect(rapportFristTekst({ kind: "missing-report", periodKey: "2026-09" }, streak("aktiv", 1), nu)).toBe("Frist tirs. 20. okt. Godkend dem til tiden, så holder din streak.");
  });
  it("brudt streak → en ny", () => {
    expect(rapportFristTekst({ kind: "pending-approval", periodKey: "2026-09" }, streak("brudt", 0), nu)).toBe("Frist tirs. 20. okt. Godkend dem til tiden, så starter du en ny streak.");
  });
  it("ingen streak → starter din streak", () => {
    expect(rapportFristTekst({ kind: "missing-report", periodKey: "2026-09" }, streak("ingen", 0), nu)).toBe("Frist tirs. 20. okt. Godkend dem til tiden, så starter din streak.");
  });
  it("en anden måned end streakens næste frist → ingen påstand om streaken", () => {
    // august: frist mandag 21/9 — passeret → null
    expect(rapportFristTekst({ kind: "missing-report", periodKey: "2026-08" }, streak("aktiv", 1), nu)).toBeNull();
    // åben måned allerede i hus → naesteFrist er oktober; september-punktet siger kun fristen
    expect(rapportFristTekst({ kind: "missing-report", periodKey: "2026-09" }, streak("aktiv", 2, "2026-10"), nu)).toBe("Frist tirs. 20. okt. Godkend dem til tiden.");
  });
  it("uden streak (henter/fejl) → kun fristen", () => {
    expect(rapportFristTekst({ kind: "missing-report", periodKey: "2026-09" }, null, nu)).toBe("Frist tirs. 20. okt. Godkend dem til tiden.");
  });
  it("andre punkter og manglende måned → null", () => {
    expect(rapportFristTekst({ kind: "maal", periodKey: "2026-09" }, streak("aktiv", 1), nu)).toBeNull();
    expect(rapportFristTekst({ kind: "missing-report" }, streak("aktiv", 1), nu)).toBeNull();
  });
});

describe("tjeklisteLinje", () => {
  const t = { faerdig: false, antal_gjort: 3, antal_i_alt: 5, punkter: [{ titel: "A", gjort: true }, { titel: "Fortæl, hvad man kan spørge dig om", gjort: false }] };
  it("med næste punkt", () => {
    expect(tjeklisteLinje(t, false)).toEqual({ tekst: "Kom godt i gang · 3 af 5 — næste: Fortæl, hvad man kan spørge dig om", til: "Se listen", href: TJEKLISTE_HASH, key: "tjekliste-linje" });
  });
  it("primært punkt er selv fra listen → intet «næste»", () => {
    expect(tjeklisteLinje(t, true)?.tekst).toBe("Kom godt i gang · 3 af 5");
  });
  it("færdig eller ingen → null", () => {
    expect(tjeklisteLinje({ ...t, faerdig: true }, false)).toBeNull();
    expect(tjeklisteLinje(null, false)).toBeNull();
  });
});

describe("stilleLinjer", () => {
  const i = (kind: string, key = kind) => ({ key, kind, title: kind });
  it("plan-punkter og tjeklistepunkter står aldrig som linjer; højst to i alt", () => {
    const ud = stilleLinjer([i("company-action"), i("maal"), i("tjekliste"), i("unread-messages"), i("pulse"), i("weekly-focus")], false);
    expect(ud.map((x) => x.kind)).toEqual(["unread-messages", "pulse"]);
  });
  it("med tjekliste-linjen står profil-punktet ikke igen (det er et punkt i listen)", () => {
    expect(stilleLinjer([i("empty-profile"), i("pulse")], true).map((x) => x.kind)).toEqual(["pulse"]);
    expect(stilleLinjer([i("empty-profile"), i("pulse")], false).map((x) => x.kind)).toEqual(["empty-profile", "pulse"]);
  });
  it("tjekliste-linjen tager én af pladserne", () => {
    expect(stilleLinjer([i("unread-messages"), i("pulse")], true).map((x) => x.kind)).toEqual(["unread-messages"]);
  });
});
