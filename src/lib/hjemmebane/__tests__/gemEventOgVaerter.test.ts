import { describe, expect, it, vi } from "vitest";
import { gemEventOgVaerter } from "@/lib/hjemmebane/gemEventOgVaerter";

/* «Gem» i EventEditor (fejl i drift 17/9-2026 14:05): en tom event-patch må
   aldrig nå updateEvent (0 rækker → «Elementet findes ikke længere»), og
   værterne skal gemmes selv om eventet ikke er rørt. */

function opstil() {
  const kald: string[] = [];
  const gemEvent = vi.fn(async () => {
    kald.push("event");
    return { id: "e1" };
  });
  const gemVaerter = vi.fn(async () => {
    kald.push("vaerter");
  });
  return { kald, gemEvent, gemVaerter };
}

describe("gemEventOgVaerter — hvad kaldes, og i hvilken rækkefølge", () => {
  it("kun værter ændret: updateEvent kaldes IKKE, saveVaerter kaldes; rækken er null", async () => {
    const o = opstil();
    const row = await gemEventOgVaerter({ patch: {}, vaerterAendret: true, gemEvent: o.gemEvent, gemVaerter: o.gemVaerter });
    expect(o.gemEvent).not.toHaveBeenCalled();
    expect(o.gemVaerter).toHaveBeenCalledTimes(1);
    expect(row).toBeNull();
  });
  it("kun event ændret: updateEvent kaldes, saveVaerter ikke; rækken gives tilbage", async () => {
    const o = opstil();
    const row = await gemEventOgVaerter({ patch: { title: "Ny" }, vaerterAendret: false, gemEvent: o.gemEvent, gemVaerter: o.gemVaerter });
    expect(o.gemEvent).toHaveBeenCalledTimes(1);
    expect(o.gemVaerter).not.toHaveBeenCalled();
    expect(row).toEqual({ id: "e1" });
  });
  it("begge ændret: eventet først, så værterne", async () => {
    const o = opstil();
    await gemEventOgVaerter({ patch: { title: "Ny" }, vaerterAendret: true, gemEvent: o.gemEvent, gemVaerter: o.gemVaerter });
    expect(o.kald).toEqual(["event", "vaerter"]);
  });
  it("ingen ændret: intet kald", async () => {
    const o = opstil();
    const row = await gemEventOgVaerter({ patch: {}, vaerterAendret: false, gemEvent: o.gemEvent, gemVaerter: o.gemVaerter });
    expect(o.kald).toEqual([]);
    expect(row).toBeNull();
  });
  it("fejler eventet, gemmes værterne ikke (fejlen når kalderen)", async () => {
    const o = opstil();
    const gemEvent = vi.fn(async () => {
      throw new Error("Elementet findes ikke længere — genindlæs siden");
    });
    await expect(
      gemEventOgVaerter({ patch: { title: "Ny" }, vaerterAendret: true, gemEvent, gemVaerter: o.gemVaerter }),
    ).rejects.toThrow("Elementet findes ikke længere");
    expect(o.gemVaerter).not.toHaveBeenCalled();
  });
});
