/**
 * Versionen i den gemte billed-URL (14/9). Låser: (1) medVersion sætter
 * `?v=<version>` og respekterer en eksisterende query; (2) to uploads giver
 * to forskellige URL'er; (3) en URL uden version vises uændret — kreativen
 * sætter strengen direkte i <img src> (de gamle URL'er skal ikke migreres);
 * (4) kildeværn: de tre skrivere gemmer MED version, og ingen komponent
 * buster sin egen visning med ?t= i state længere.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { medVersion, versionAf, VERSION_PARAM } from "../billedVersion";
import { KreativTrePaaRaekke } from "@/components/hjemmebane/deling/KreativTrePaaRaekke";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BASE = "https://loiavmastgeieqyiwyyr.supabase.co/storage/v1/object/public/company-logos/c1/logo";

describe("medVersion / versionAf", () => {
  it("sætter ?v=<version> bag på en ren public-URL", () => {
    expect(medVersion(BASE, 1757856000000)).toBe(`${BASE}?v=1757856000000`);
    expect(VERSION_PARAM).toBe("v");
    expect(versionAf(`${BASE}?v=1757856000000`)).toBe("1757856000000");
  });

  it("bruger tidsstemplet som standard, og to uploads giver to forskellige URL'er", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const foerste = medVersion(BASE);
    const anden = medVersion(BASE);
    expect(foerste).not.toBe(anden);
    expect(versionAf(foerste)).toBe("1000");
    expect(versionAf(anden)).toBe("2000");
    // samme sti, samme base — kun versionen skiller dem
    expect(foerste.split("?")[0]).toBe(anden.split("?")[0]);
  });

  it("respekterer en eksisterende query og et fragment", () => {
    expect(medVersion("https://x.test/a?b=1", 7)).toBe("https://x.test/a?b=1&v=7");
    expect(medVersion("https://x.test/a#top", 7)).toBe("https://x.test/a?v=7#top");
  });

  it("en URL uden version er gyldig: versionAf giver null, strengen røres ikke", () => {
    expect(versionAf(BASE)).toBeNull();
    expect(versionAf(null)).toBeNull();
    expect(versionAf(`${BASE}?t=5`)).toBeNull();
  });
});

describe("en URL uden version vises uændret (de gamle skal ikke migreres)", () => {
  it("kreativen sætter både logo- og portræt-URL direkte i <img src>", () => {
    const portraet = "https://loiavmastgeieqyiwyyr.supabase.co/storage/v1/object/public/avatars/u1/avatar";
    const { container } = render(
      <KreativTrePaaRaekke udgave="moerk" format="kvadrat" memberName="Mette Hansen" companyName="Hansen Byg ApS" dateLabel="september 2026" portraetUrl={portraet} logoUrl={BASE} />,
    );
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs).toContain(BASE);
    expect(srcs).toContain(portraet);
    // og en versioneret URL vises lige så uændret
    cleanup();
    const v = `${BASE}?v=1757856000000`;
    const r2 = render(
      <KreativTrePaaRaekke udgave="lys" format="liggende" memberName="Mette Hansen" companyName="Hansen Byg ApS" dateLabel="september 2026" logoUrl={v} />,
    );
    expect(Array.from(r2.container.querySelectorAll("img")).map((i) => i.getAttribute("src"))).toContain(v);
  });
});

describe("KILDEVÆRN: versionen ligger i den gemte URL, ikke i state", () => {
  // RETTET MED VILJE (forside PR 4b, 17/9): avatar-uploadet er flyttet fra KontoView
  // til den delte ProfilFotoFelt (bruges af /konto OG /settings?fane=profil).
  // Før: readFileSync("src/components/hjemmebane/konto/KontoView.tsx", "utf8") —
  // samme fire forventninger, nu mod den ene skriver.
  const konto = readFileSync("src/components/hjemmebane/ProfilFotoFelt.tsx", "utf8");
  const indstillinger = readFileSync("src/components/hjemmebane/indstillinger/IndstillingerView.tsx", "utf8");
  const lib = readFileSync("src/lib/delingsbilleder.ts", "utf8");

  it("de tre skrivere af avatar_url/logo_url gemmer MED medVersion(...)", () => {
    expect(konto).toContain('const renUrl = medVersion(supabase.storage.from("avatars").getPublicUrl(sti).data.publicUrl);');
    expect(konto).toContain('.update({ avatar_url: renUrl }).eq("user_id", user.id)');
    expect(indstillinger).toContain('const cleanUrl = medVersion(supabase.storage.from("company-logos").getPublicUrl(filePath).data.publicUrl);');
    expect(indstillinger).toContain('.update({ logo_url: cleanUrl }).eq("id", company.id)');
    expect(lib).toContain("const cleanUrl = medVersion(supabase.storage.from(LOGO_BUCKET).getPublicUrl(filePath).data.publicUrl);");
    expect(lib).toContain('.update({ logo_url: cleanUrl }).eq("id", companyId)');
  });

  it("ingen ?t=${Date.now()} i state længere — den gemte streng bærer versionen", () => {
    for (const [navn, kilde] of [["ProfilFotoFelt", konto], ["IndstillingerView", indstillinger], ["delingsbilleder", lib]] as const) {
      expect(kilde, navn).not.toContain("?t=${Date.now()}");
    }
    expect(konto).toContain("setAvatarUrl(renUrl)");
    expect(indstillinger).toContain("setLogoUrl(cleanUrl)");
  });

  it("filhovedet siger at de gamle URL'er ikke migreres", () => {
    const hoved = readFileSync("src/lib/billedVersion.ts", "utf8");
    expect(hoved).toContain("skal IKKE migreres");
    expect(hoved).toContain("Ingen migration");
  });
});
