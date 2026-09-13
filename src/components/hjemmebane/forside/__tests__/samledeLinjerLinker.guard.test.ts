import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn (13/9): forsidens samlede linjer SKAL pege via samletLinjeLink
// (lib/hjemmebane/forsideLinks), så flere virksomheder fører til
// /virksomheder?grund=<slags> — udsnittet listen læser — og ikke til listen
// uden parameter. Målt 13/9 (recon-hb-moenstre.md afsnit 4.2): hjælperne
// fandtes siden #743, men ingen kaldte dem; RaadgiverForsideView pegede
// nøgent på "/virksomheder" for tilstande og pukler med flere.
//
// Kilde-læsning frem for rendering (forsidenKaster.guard-mønstret):
// RaadgiverForsideView er react-query + supabase uden ren funktion at kalde.
// Selve linkets form låses i forsideLinks.test.ts; her låses KUN at fladen
// bruger hjælperen alle tre steder og ikke har gendannet den nøgne gren.

const sti = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");

describe("forsidens samlede linjer peger via samletLinjeLink", () => {
  it("importerer hjælperen fra lib/hjemmebane/forsideLinks", () => {
    expect(kilde).toMatch(/import \{[^}]*\bsamletLinjeLink\b[^}]*\} from "@\/lib\/hjemmebane\/forsideLinks"/);
  });

  it("over stregen (DomLinje) og under stregen (tilstande og pukler) — tre kaldesteder", () => {
    expect(kilde).toContain("const to = samletLinjeLink(l);");
    expect(kilde).toContain("to={samletLinjeLink(t)}");
    expect(kilde).toContain("to={samletLinjeLink(p)}");
  });

  it("ingen samlet linje falder tilbage på listen uden parameter", () => {
    // Den gamle form: `… ? grundLink(…) : "/virksomheder"`. De to nøgne
    // "/virksomheder" der er tilbage (antalUnder-tallet og «Se
    // virksomhederne») er ikke slags og har intet udsnit — de er tilladt.
    expect(kilde).not.toMatch(/\?\s*grundLink\([^)]*\)\s*:\s*"\/virksomheder"/);
    expect(kilde).not.toContain("pukkelLink");
  });
});
