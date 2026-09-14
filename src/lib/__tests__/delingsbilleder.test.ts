import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Kreativens billeder gemmes (14/9). De rene domme låses her; IO'en
// (storage, companies.logo_url) prøves gennem DelingView.test.tsx med
// mocket klient. Supabase-klienten mockes, så modulet kan importeres i jsdom.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  LOGO_BUCKET,
  MAKS_BYTES,
  PORTRAET_BUCKET,
  PORTRAET_SLOT_PX,
  TEKST,
  logoSti,
  oploesningsBesked,
  portraetSti,
  tjekBilledfil,
} from "@/lib/delingsbilleder";

describe("tjekBilledfil — avatar-uploadens to tjek, ingen ny grænse", () => {
  it("type først, så 2 MB — teksterne er husets", () => {
    expect(tjekBilledfil({ type: "application/pdf", size: 10 })).toEqual({ ok: false, fejl: TEKST.ikkeBillede });
    expect(tjekBilledfil({ type: "image/png", size: MAKS_BYTES + 1 })).toEqual({ ok: false, fejl: "Billedet må højst være 2 MB" });
    expect(tjekBilledfil({ type: "image/png", size: MAKS_BYTES })).toEqual({ ok: true });
    expect(tjekBilledfil({ type: "image/webp", size: 1 })).toEqual({ ok: true });
    expect(MAKS_BYTES).toBe(2 * 1024 * 1024);
  });

  it("KILDEVÆRN: grænserne er KontoView's, ordret (image/ og 2 * 1024 * 1024)", () => {
    const konto = readFileSync("src/components/hjemmebane/konto/KontoView.tsx", "utf8");
    expect(konto).toContain('fil.type.startsWith("image/")');
    expect(konto).toContain("fil.size > 2 * 1024 * 1024");
    expect(konto).toContain('"Billedet må højst være 2 MB"');
  });
});

describe("oploesningsBesked — oplysning når billedet er mindre end slot'en, aldrig en afvisning", () => {
  it("slot'en er kreativens største (310 px) — KILDEVÆRN mod delingskreativ.ts", () => {
    expect(PORTRAET_SLOT_PX).toBe(310);
    const maal = readFileSync("src/lib/delingskreativ.ts", "utf8");
    expect(maal).toMatch(/slot: 310/);
    // ingen slot i måltabellerne er større end den vi advarer mod
    const slots = [...maal.matchAll(/slot: (\d+)[,\s]/g)].map((m) => Number(m[1]));
    expect(slots.length).toBeGreaterThan(0);
    expect(Math.max(...slots)).toBe(PORTRAET_SLOT_PX);
  });
  it("under slot'en: målet, slot'en og «du må gerne bruge det alligevel»", () => {
    const t = oploesningsBesked({ bredde: 100, hoejde: 100 });
    expect(t).toBe("Billedet er 100×100 px. Kreativen viser det i 310 px, så det bliver uskarpt — du må gerne bruge det alligevel.");
    // den korteste side afgør (cover beskærer den lange)
    expect(oploesningsBesked({ bredde: 1000, hoejde: 200 })).toMatch(/1000×200 px/);
  });
  it("stort nok, ukendt mål eller ugyldigt mål: intet", () => {
    expect(oploesningsBesked({ bredde: 310, hoejde: 310 })).toBeNull();
    expect(oploesningsBesked({ bredde: 1000, hoejde: 667 })).toBeNull();
    expect(oploesningsBesked(null)).toBeNull();
    expect(oploesningsBesked({ bredde: 0, hoejde: 0 })).toBeNull();
    expect(oploesningsBesked({ bredde: NaN, hoejde: 5 })).toBeNull();
  });
});

describe("stierne og bucketerne", () => {
  it("portrættet: privat bucket, {uid}/portraet — deterministisk, så intet skal huskes", () => {
    expect(PORTRAET_BUCKET).toBe("deling-portraetter");
    expect(portraetSti("u1")).toBe("u1/portraet");
  });
  it("logoet: company-logos, {company.id}/logo — ordret IndstillingerView", () => {
    expect(LOGO_BUCKET).toBe("company-logos");
    expect(logoSti("c1")).toBe("c1/logo");
    const indstillinger = readFileSync("src/components/hjemmebane/indstillinger/IndstillingerView.tsx", "utf8");
    expect(indstillinger).toContain("const filePath = `${company.id}/logo`;");
    expect(indstillinger).toContain('supabase.storage.from("company-logos").upload(filePath, file, { upsert: true, contentType: file.type })');
    expect(indstillinger).toContain('supabase.from("companies").update({ logo_url: cleanUrl }).eq("id", company.id)');
    const lib = readFileSync("src/lib/delingsbilleder.ts", "utf8");
    expect(lib).toContain("upload(filePath, file, { upsert: true, contentType: file.type })");
    expect(lib).toContain('.update({ logo_url: cleanUrl }).eq("id", companyId)');
  });
  it("KILDEVÆRN: migrationen opretter bucketen privat med de samme grænser og fire ejermappe-policies", () => {
    const m = readFileSync("supabase/migrations/20260914170000_deling_portraetter_bucket.sql", "utf8");
    expect(m).toContain("'deling-portraetter'");
    expect(m).toMatch(/false,\s*\n\s*2 \* 1024 \* 1024,\s*\n\s*ARRAY\['image\/\*'\]/);
    for (const cmd of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(m).toContain(`ON storage.objects FOR ${cmd}`);
    expect(m.match(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g)?.length).toBe(5); // SELECT, INSERT, UPDATE (USING + WITH CHECK), DELETE
    expect(m).not.toMatch(/TO public/);
  });
});

describe("teksterne", () => {
  it("logoet siges at blive virksomhedens FØR hun trykker; portrættet siges at være kun til kreativen", () => {
    expect(TEKST.logoAdvarsel).toMatch(/bliver virksomhedens logo/);
    expect(TEKST.logoAdvarsel).toMatch(/ikke kun på kreativen/);
    expect(TEKST.portraetHjaelp).toMatch(/kun til kreativen/);
    expect(TEKST.portraetGemt).toMatch(/ikke som dit profilbillede/);
  });
});
