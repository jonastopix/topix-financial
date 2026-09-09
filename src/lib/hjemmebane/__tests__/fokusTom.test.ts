import { describe, expect, it } from "vitest";
import { afgoerFokusTom, RAPPORTERING_STI } from "../fokusTom";

// Fokuskortets tomme tilstand (9/9): tre tilstande, ikke to. «Alt er ajour»
// må aldrig siges til en der aldrig har uploadet.

describe("afgoerFokusTom — de tre tilstande", () => {
  it("aldrig uploadet: siger hvad der mangler, peger på rapporteringen, påstår intet", () => {
    const t = afgoerFokusTom({ harUploads: false, harGodkendte: false, journeyLine: null });
    expect(t.tilstand).toBe("aldrig");
    expect(t.overskrift).toBe("Kom i gang med dine tal.");
    expect(t.linje).not.toContain("på plads");
    expect(t.linje).not.toMatch(/\b0 /);
    expect(t.cta).toEqual({ label: "Upload din første rapport", to: RAPPORTERING_STI });
  });

  it("uploadet men ikke godkendt: «du mangler at godkende tallene», link til rapporteringen", () => {
    const t = afgoerFokusTom({ harUploads: true, harGodkendte: false, journeyLine: null });
    expect(t.tilstand).toBe("uploadet_ikke_godkendt");
    expect(t.overskrift).toBe("Dine tal venter på dig.");
    expect(t.linje).toContain("godkende tallene");
    expect(t.cta).toEqual({ label: "Gennemgå og godkend", to: RAPPORTERING_STI });
  });

  it("godkendt, med noget at anerkende: «Alt er ajour.» + rejsen, ingen CTA", () => {
    const t = afgoerFokusTom({ harUploads: true, harGodkendte: true, journeyLine: "Og rejsen kan ses: 3 godkendte rapporter i år." });
    expect(t.tilstand).toBe("godkendt");
    expect(t.overskrift).toBe("Alt er ajour.");
    expect(t.linje).toBe("Og rejsen kan ses: 3 godkendte rapporter i år.");
    expect(t.cta).toBeNull();
  });

  it("godkendt, intet at anerkende i år: rolig sætning der ikke påstår milestones og refleksion", () => {
    const t = afgoerFokusTom({ harUploads: true, harGodkendte: true, journeyLine: null });
    expect(t.linje).toBe("Der er ikke noget der venter på dig lige nu.");
    expect(t.linje).not.toContain("milestones");
  });

  it("godkendte tal vinder over upload-flaget (en godkendt har pr. definition uploadet)", () => {
    expect(afgoerFokusTom({ harUploads: false, harGodkendte: true, journeyLine: null }).tilstand).toBe("godkendt");
  });
});
