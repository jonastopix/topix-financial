/**
 * «Fjern fra virksomheden» (10/9): hvem må fjernes, og owner-tilfældet.
 * Grænserne fra begge sider.
 */
import { describe, expect, it } from "vitest";
import { doemFjernFraVirksomhed } from "../../../supabase/functions/_shared/fjernFraVirksomhed.ts";

const medlem = { role: "member" };
const owner = { role: "owner" };

describe("doemFjernFraVirksomhed — det der går igennem", () => {
  it("et almindeligt medlem, samtalen hænger ikke på personen → ok, ingen flytning", () => {
    expect(doemFjernFraVirksomhed({ medlemskab: medlem, samtaleHaengerPaaPerson: false, andenOwnerFindes: true })).toEqual({ ok: true, flytSamtale: false });
    expect(doemFjernFraVirksomhed({ medlemskab: medlem, samtaleHaengerPaaPerson: false, andenOwnerFindes: false })).toEqual({ ok: true, flytSamtale: false });
  });
  it("samtalen hænger på personen OG der findes en anden owner → ok, samtalen flyttes først", () => {
    expect(doemFjernFraVirksomhed({ medlemskab: medlem, samtaleHaengerPaaPerson: true, andenOwnerFindes: true })).toEqual({ ok: true, flytSamtale: true });
  });
  it("en rolle der ikke er owner (null, ukendt tekst) behandles som medlem", () => {
    expect(doemFjernFraVirksomhed({ medlemskab: { role: null }, samtaleHaengerPaaPerson: false, andenOwnerFindes: false }).ok).toBe(true);
    expect(doemFjernFraVirksomhed({ medlemskab: { role: "noget_andet" }, samtaleHaengerPaaPerson: false, andenOwnerFindes: false }).ok).toBe(true);
  });
});

describe("doemFjernFraVirksomhed — det der spærres", () => {
  it("ikke medlem af virksomheden → 404", () => {
    expect(doemFjernFraVirksomhed({ medlemskab: null, samtaleHaengerPaaPerson: false, andenOwnerFindes: true }))
      .toMatchObject({ ok: false, grund: "ikke_medlem", status: 404 });
  });
  it("owner → 403, uanset om der er andre owners — ejerskifte er en anden handling", () => {
    for (const andenOwner of [true, false]) {
      expect(doemFjernFraVirksomhed({ medlemskab: owner, samtaleHaengerPaaPerson: false, andenOwnerFindes: andenOwner }))
        .toMatchObject({ ok: false, grund: "er_owner", status: 403 });
    }
  });
  it("owner-tjekket vinder over samtale-tjekket", () => {
    expect(doemFjernFraVirksomhed({ medlemskab: owner, samtaleHaengerPaaPerson: true, andenOwnerFindes: false }))
      .toMatchObject({ ok: false, grund: "er_owner" });
  });
  it("samtalen hænger på personen og ingen anden owner → 409 (ellers beholder personen chatten)", () => {
    expect(doemFjernFraVirksomhed({ medlemskab: medlem, samtaleHaengerPaaPerson: true, andenOwnerFindes: false }))
      .toMatchObject({ ok: false, grund: "samtale_uden_owner", status: 409 });
  });
  it("rollen er case-sensitiv som i drift: 'Owner' er ikke owner", () => {
    expect(doemFjernFraVirksomhed({ medlemskab: { role: "Owner" }, samtaleHaengerPaaPerson: false, andenOwnerFindes: true }).ok).toBe(true);
  });
});
