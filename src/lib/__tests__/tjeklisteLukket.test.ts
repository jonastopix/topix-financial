import { describe, expect, it } from "vitest";
import { laesTjeklisteLukket, skrivTjeklisteLukket, TJEKLISTE_LUKKET_NOEGLE } from "@/lib/hjemmebane/tjeklisteLukket";
import { fletPraeferencer, laesPraeferencer } from "@/lib/hjemmebane/indstillinger";

describe("laesTjeklisteLukket — kun true er lukket", () => {
  it("true → lukket; false/mangler → ikke lukket", () => {
    expect(laesTjeklisteLukket({ tjekliste_lukket: true })).toBe(true);
    expect(laesTjeklisteLukket({ tjekliste_lukket: false })).toBe(false);
    expect(laesTjeklisteLukket({ action_required: true, important: true })).toBe(false);
    expect(laesTjeklisteLukket({})).toBe(false);
  });

  it("null, undefined, streng, tal, array og «sande» ikke-booleans er ikke lukket", () => {
    for (const v of [null, undefined, "", "1", 0, 1, [], [true], { tjekliste_lukket: "true" }, { tjekliste_lukket: 1 }, { tjekliste_lukket: null }]) {
      expect(laesTjeklisteLukket(v)).toBe(false);
    }
  });

  it("nøglen hedder tjekliste_lukket", () => {
    expect(TJEKLISTE_LUKKET_NOEGLE).toBe("tjekliste_lukket");
  });
});

describe("skrivTjeklisteLukket — bevarer resten af JSON'en", () => {
  it("sætter nøglen og rører ikke mail-præferencerne", () => {
    const foer = { action_required: true, important: false, monthly_digest: true, pulse_reminders: false };
    const efter = skrivTjeklisteLukket(foer, true);
    expect(efter).toEqual({ ...foer, tjekliste_lukket: true });
    expect(skrivTjeklisteLukket(efter, false)).toEqual({ ...foer, tjekliste_lukket: false });
  });

  it("muterer ikke input", () => {
    const foer = { action_required: true };
    skrivTjeklisteLukket(foer, true);
    expect(foer).toEqual({ action_required: true });
  });

  it("null/ikke-objekt bliver et objekt med kun nøglen", () => {
    expect(skrivTjeklisteLukket(null, true)).toEqual({ tjekliste_lukket: true });
    expect(skrivTjeklisteLukket(undefined, false)).toEqual({ tjekliste_lukket: false });
    expect(skrivTjeklisteLukket("x", true)).toEqual({ tjekliste_lukket: true });
    expect(skrivTjeklisteLukket([1, 2], true)).toEqual({ tjekliste_lukket: true });
  });

  it("rundtur: skriv → læs", () => {
    expect(laesTjeklisteLukket(skrivTjeklisteLukket({}, true))).toBe(true);
    expect(laesTjeklisteLukket(skrivTjeklisteLukket({ tjekliste_lukket: true }, false))).toBe(false);
  });
});

describe("samliv med indstillingsfanen (samme jsonb-felt)", () => {
  it("fletPraeferencer bevarer tjekliste_lukket når medlemmet gemmer mail-præferencer", () => {
    const gemt = skrivTjeklisteLukket({ action_required: true, important: true }, true);
    const valg = laesPraeferencer(gemt);
    const efterGem = fletPraeferencer(gemt, { ...valg, important: false });
    expect(laesTjeklisteLukket(efterGem)).toBe(true);
    expect(efterGem.important).toBe(false);
  });

  it("laesPraeferencer ignorerer tjekliste_lukket — den er ikke en mailindstilling", () => {
    const medNoegle = laesPraeferencer({ action_required: true, tjekliste_lukket: true });
    const uden = laesPraeferencer({ action_required: true });
    expect(medNoegle).toEqual(uden);
  });
});
