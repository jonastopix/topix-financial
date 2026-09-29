import { describe, expect, it } from "vitest";
import { FILTER_MAERKER, MAERKE_ORD, MAERKE_PARAM } from "@/lib/hjemmebane/overblikOrd";
import * as motor from "@/lib/medlemsOverblik";

/** overblikOrd efter forenklingen 29/9: kun mærkernes ord (fra motoren) og ?maerke=. */
describe("overblikOrd — det, der er tilbage", () => {
  it("ordene og filtrene er motorens egne (samme objekt, ingen kopi)", () => {
    expect(MAERKE_ORD).toBe(motor.MAERKE_ORD);
    expect(FILTER_MAERKER).toBe(motor.FILTER_MAERKER);
  });
  it("parameteren er «maerke»", () => {
    expect(MAERKE_PARAM).toBe("maerke");
  });
});
