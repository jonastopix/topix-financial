/** Owner-værnet (4/9): samme dom på virksomhedssiden og spejlet i
    manage-advisor. Testen låser at en owner aldrig må fjernes, at en
    ukendt rolle ikke tæller som owner (serveren afviser kun når en
    owner-række findes), og — siden kort 83 (13/9) — at den halve sletning
    af en person ikke kommer tilbage i hverken flade, dom eller server. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { erOwner, maaFjerneFraVirksomhed, OWNER_ROLLE } from "../medlemsfjernelse";

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
  it("ukendt rolle (ingen company_members-række) blokerer ikke for en rådgiver — samme som serveren", () => {
    expect(maaFjerneFraVirksomhed(true, undefined)).toBe(true);
    expect(maaFjerneFraVirksomhed(false, null)).toBe(false);
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
  it("virksomheder og rådgiverroller forbliver admin-only", () => {
    for (const a of ["delete-company", "bulk-remove-members", "cleanup-shells", "invite", "remove", "toggle-admin"]) {
      expect(allowed, `${a} må ikke være en rådgiverhandling`).not.toContain(`'${a}'`);
    }
  });
  it("virksomhedssidens knap dømmes på isAdvisor gennem maaFjerneFraVirksomhed — ikke på isAdmin", () => {
    expect(flade).toContain("maaFjerneFraVirksomhed(!!isAdvisor, m.role)");
    expect(flade).not.toContain("maaFjerneMedlem(!!isAdmin");
  });
});

/* KILDEVÆRN — kort 83 (13/9): den halve sletning kommer ikke tilbage.
   Den gamle action remove-member slettede company_members, profiles og
   auth-brugeren i tre skridt uden transaktion; FK'erne på
   financial_report_facts er NO ACTION (målt i prod 11/9 kl. 11:18), så
   auth-sletningen fejlede EFTER de to første, og personen stod halvt
   slettet. Knappen på /members, dommen maaFjerneMedlem og serverens gren
   blev fjernet sammen; /members selv blev slettet 13/9 (bygning 3), så
   værnet låser de to filer der lever: serveren og dommen. Dukker navnet
   op igen i én af de to filer, er det en bevidst genindførelse — og så skal denne test ændres med vilje,
   ikke bare grønnes. Den rigtige handling er fjern-fra-virksomhed. */
describe("kildeværn (kort 83): remove-member og maaFjerneMedlem findes ikke længere", () => {
  const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
  const filer = [
    "supabase/functions/manage-advisor/index.ts",
    "src/lib/medlemsfjernelse.ts",
  ];

  // Hele ordet: 'bulk-remove-members' er en anden action, der bliver.
  const REMOVE_MEMBER = /(^|[^a-z-])remove-member(?![a-z-])/;

  for (const sti of filer) {
    it(`${sti} nævner hverken 'remove-member' eller maaFjerneMedlem`, () => {
      const kilde = laes(sti);
      expect(kilde, `${sti} kunne ikke læses`).not.toBe("");
      expect(kilde, `${sti} indeholder 'remove-member'`).not.toMatch(REMOVE_MEMBER);
      expect(kilde, `${sti} indeholder maaFjerneMedlem`).not.toContain("maaFjerneMedlem");
    });
  }

  it("et direkte kald med den gamle action rammer ingen gren: action-routingen kender den ikke", () => {
    // Alle grene i manage-advisor routes på `action === '...'`. Står den gamle
    // action ikke blandt dem, falder kaldet igennem til 400 — og sletter intet.
    const server = laes("supabase/functions/manage-advisor/index.ts");
    const actions = [...server.matchAll(/action === '([a-z-]+)'/g)].map((m) => m[1]);
    expect(actions).toContain("fjern-fra-virksomhed");
    expect(actions).not.toContain("remove-member");
  });
});
