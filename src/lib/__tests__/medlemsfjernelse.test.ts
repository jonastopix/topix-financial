/** Owner-værnet (4/9): samme dom på /members-rækken, på MemberDetail og
    spejlet i manage-advisor. Testen låser at en owner aldrig må fjernes,
    at en rådgiver uden admin aldrig ser knappen, og at en ukendt rolle
    ikke tæller som owner (serveren afviser kun når en owner-række findes). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { erOwner, maaFjerneFraVirksomhed, maaFjerneMedlem, OWNER_ROLLE } from "../medlemsfjernelse";

describe("erOwner", () => {
  it("'owner' er owner", () => {
    expect(erOwner("owner")).toBe(true);
    expect(OWNER_ROLLE).toBe("owner");
  });

  it("'member', null og undefined er ikke owner", () => {
    expect(erOwner("member")).toBe(false);
    expect(erOwner(null)).toBe(false);
    expect(erOwner(undefined)).toBe(false);
  });

  it("er case-sensitiv — 'Owner' er ikke rollen i drift", () => {
    expect(erOwner("Owner")).toBe(false);
  });
});

describe("maaFjerneMedlem — admin OG ikke owner", () => {
  it("admin må fjerne et almindeligt medlem", () => {
    expect(maaFjerneMedlem(true, "member")).toBe(true);
  });

  it("admin må ALDRIG fjerne en owner", () => {
    expect(maaFjerneMedlem(true, "owner")).toBe(false);
  });

  it("rådgiver uden admin må intet — heller ikke et almindeligt medlem", () => {
    expect(maaFjerneMedlem(false, "member")).toBe(false);
    expect(maaFjerneMedlem(false, "owner")).toBe(false);
  });

  it("ukendt rolle (ingen company_members-række) blokerer ikke for admin — samme som serveren", () => {
    expect(maaFjerneMedlem(true, null)).toBe(true);
    expect(maaFjerneMedlem(true, undefined)).toBe(true);
    expect(maaFjerneMedlem(false, null)).toBe(false);
  });
});

// ── «Fjern fra virksomheden» (10/9 nat): en RÅDGIVERHANDLING, ikke en admin-
//    handling. #803 byggede den admin-only samme aften, så Morten hverken så
//    knappen eller kunne kalde serveren — Morten-gaten (mangellistens kort
//    109) for tredje gang. Fladen og serveren låses her til samme svar.
describe("maaFjerneFraVirksomhed — advisor ELLER admin, aldrig en owner", () => {
  it("en rådgiver (advisor eller admin — useAuth.isAdvisor er begge) må fjerne et almindeligt medlem", () => {
    expect(maaFjerneFraVirksomhed(true, "member")).toBe(true);
    expect(maaFjerneFraVirksomhed(true, null)).toBe(true);
  });
  it("en rådgiver må ALDRIG fjerne en owner — samme grænse som serverens dom", () => {
    expect(maaFjerneFraVirksomhed(true, "owner")).toBe(false);
  });
  it("uden rådgiverrolle vises intet", () => {
    expect(maaFjerneFraVirksomhed(false, "member")).toBe(false);
    expect(maaFjerneFraVirksomhed(false, "owner")).toBe(false);
  });
  it("de to domme er forskellige gates: remove-member kræver stadig admin", () => {
    expect(maaFjerneMedlem(false, "member")).toBe(false);
    expect(maaFjerneFraVirksomhed(true, "member")).toBe(true);
  });
});

describe("kildeværn: serveren og fladen siger det samme om hvem der må", () => {
  const server = readFileSync(resolve(process.cwd(), "supabase/functions/manage-advisor/index.ts"), "utf8");
  const flade = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/virksomhed/VirksomhedView.tsx"), "utf8");
  const allowed = server.match(/const ADVISOR_ALLOWED_ACTIONS = \[([^\]]*)\]/)?.[1] ?? "";

  it("manage-advisor slipper fjern-fra-virksomhed igennem for rådgivere (ikke kun admin)", () => {
    expect(allowed, "ADVISOR_ALLOWED_ACTIONS mangler i manage-advisor").not.toBe("");
    expect(allowed).toContain("'fjern-fra-virksomhed'");
    expect(allowed).toContain("'list'");
  });
  it("sletning af en person, virksomheder og rådgiverroller forbliver admin-only", () => {
    for (const a of ["remove-member", "delete-company", "bulk-remove-members", "cleanup-shells", "invite", "remove", "toggle-admin"]) {
      expect(allowed, `${a} må ikke være en rådgiverhandling`).not.toContain(`'${a}'`);
    }
  });
  it("virksomhedssidens knap dømmes på isAdvisor gennem maaFjerneFraVirksomhed — ikke på isAdmin", () => {
    expect(flade).toContain("maaFjerneFraVirksomhed(!!isAdvisor, m.role)");
    expect(flade).not.toContain("maaFjerneMedlem(!!isAdmin");
  });
});
