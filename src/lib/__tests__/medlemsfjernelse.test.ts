/** Owner-værnet (4/9): samme dom på /members-rækken, på MemberDetail og
    spejlet i manage-advisor. Testen låser at en owner aldrig må fjernes,
    at en rådgiver uden admin aldrig ser knappen, og at en ukendt rolle
    ikke tæller som owner (serveren afviser kun når en owner-række findes). */
import { describe, expect, it } from "vitest";
import { erOwner, maaFjerneMedlem, OWNER_ROLLE } from "../medlemsfjernelse";

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
