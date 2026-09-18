import { describe, expect, it } from "vitest";
import { koelinjer, naesteIKoen, sporlinjer } from "@/lib/ansoegninger/ansoegningSpor";

describe("ansoegningSpor — hvem gjorde hvad hvornår", () => {
  const navnAf = (id: string) => (id === "u1" ? "Jonas Herlev" : null);
  it("rådgiverens navn på menneskets beslutninger, systemets ord på resten; nyeste først; årsag og trinskift i detaljen", () => {
    const l = sporlinjer([
      { handling: "tal_med_dem", fra_trin: "ny", til_trin: "indkaldt", lukkeaarsag: null, truffet_af: "u1", truffet_via: "raadgiver", begrundelse: "Ser stærk ud", truffet_at: "2026-09-18T08:00:00Z" },
      { handling: "book", fra_trin: "indkaldt", til_trin: "booket", lukkeaarsag: null, truffet_af: null, truffet_via: "calendly", begrundelse: null, truffet_at: "2026-09-19T08:00:00Z" },
      { handling: "luk", fra_trin: "booket", til_trin: "lukket", lukkeaarsag: "trak_sig", truffet_af: "u9", truffet_via: "raadgiver", begrundelse: null, truffet_at: "2026-09-20T08:00:00Z" },
    ], navnAf);
    expect(l.map((x) => x.hvem)).toEqual(["En rådgiver", "Ansøgeren (Calendly)", "Jonas Herlev"]);
    expect(l[0].hvad).toBe("lukkede ansøgningen");
    expect(l[0].detalje).toBe("årsag: trak sig · Samtale booket → Lukket");
    expect(l[2].detalje).toBe("Ny → Indkaldt til samtale · «Ser stærk ud»");
    expect(l[1].naar).toMatch(/19\. september/);
  });
  it("rykkerkøen: planlagte først (næste øverst), så sendte (nyeste øverst), annullerede/fejlede sidst — med ord for skabelonen", () => {
    const k = koelinjer([
      { trappe: "indkaldt", trin_nr: 2, handling: "send_mail", skabelon: "ansoegning-indkaldt-rykker-2", modtager: "ansoeger", planlagt_til: "2026-09-24T08:00:00Z", status: "planlagt", udfoert_at: null, annulleret_grund: null, fejl: null },
      { trappe: "indkaldt", trin_nr: 0, handling: "send_mail", skabelon: "ansoegning-indkaldelse", modtager: "ansoeger", planlagt_til: "2026-09-18T08:00:00Z", status: "sendt", udfoert_at: "2026-09-18T08:02:00Z", annulleret_grund: null, fejl: null },
      { trappe: "indkaldt", trin_nr: 1, handling: "send_mail", skabelon: "ansoegning-indkaldt-rykker-1", modtager: "ansoeger", planlagt_til: "2026-09-22T08:00:00Z", status: "planlagt", udfoert_at: null, annulleret_grund: null, fejl: null },
      { trappe: "indkaldt", trin_nr: 5, handling: "luk_svarer_ikke", skabelon: null, modtager: "raadgiver", planlagt_til: "2026-10-02T08:00:00Z", status: "annulleret", udfoert_at: null, annulleret_grund: "book (calendly)", fejl: null },
    ]);
    expect(k.map((x) => x.status)).toEqual(["planlagt", "planlagt", "sendt", "annulleret"]);
    expect(k[0].hvad).toBe("rykker 1 om samtalen");
    expect(k[0].hvornaar).toMatch(/^planlagt til 22\. september/);
    expect(k[2].hvornaar).toMatch(/^sendt 18\. september/);
    expect(k[3].hvad).toBe("lukkes «svarer ikke»");
    expect(k[3].hvornaar).toBe("annulleret: book (calendly)");
    expect(naesteIKoen([])).toBeNull();
    expect(naesteIKoen([{ trappe: "pause", trin_nr: 0, handling: "pause_slut", skabelon: null, modtager: "raadgiver", planlagt_til: "2026-12-18T09:00:00Z", status: "planlagt", udfoert_at: null, annulleret_grund: null, fejl: null }])!.hvad).toBe("pausen slutter — klokke til jer");
  });
});
