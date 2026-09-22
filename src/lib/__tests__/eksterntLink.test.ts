import { describe, expect, it } from "vitest";
import { eksterntHref } from "@/lib/eksterntLink";

/**
 * Dommen «må denne brugerskrevne værdi blive et href» (22/9-2026).
 *
 * Prøverne flyttede med hjælperen fra
 * src/lib/hjemmebane/__tests__/memberProfile.test.ts (hvor den hed
 * externalHref og krævede en Supabase-mock for at læse en streng) — og er
 * udvidet med de tilfælde, den gamle udgave tog fejl af: et andet skema blev
 * til et brudt «https://mailto:…»-link i stedet for tekst.
 */

describe("eksterntHref — http(s) sendes uændret videre", () => {
  it("https:// og http:// står som skrevet", () => {
    expect(eksterntHref("https://zanco-group.dk")).toBe("https://zanco-group.dk");
    expect(eksterntHref("http://x.dk")).toBe("http://x.dk");
    expect(eksterntHref("https://x.dk/om?a=1#top")).toBe("https://x.dk/om?a=1#top");
  });

  it("er versal-ufølsom på protokollen", () => {
    expect(eksterntHref("HTTPS://X.DK")).toBe("HTTPS://X.DK");
  });

  it("men «https://» uden vært er ikke et link", () => {
    expect(eksterntHref("https://")).toBeNull();
    expect(eksterntHref("http://")).toBeNull();
    // MÅLT, ikke antaget: «http:///om» kaster IKKE — URL normaliserer den til
    // værten «om» med stien «/». Den er altså et gyldigt http-link til en vært,
    // der ikke findes, og den slipper igennem. Det er harmløst og med vilje:
    // et EKSPLICIT http(s)-skema sendes videre, som brugeren skrev det.
    expect(eksterntHref("http:///om")).toBe("http:///om");
  });
});

describe("eksterntHref — uden protokol sættes https:// foran", () => {
  it("bart domæne, www-domæne og en sti", () => {
    expect(eksterntHref("zanco-group.dk")).toBe("https://zanco-group.dk");
    expect(eksterntHref("www.brroset.dk")).toBe("https://www.brroset.dk");
    expect(eksterntHref("x.dk/om")).toBe("https://x.dk/om");
  });

  it("trimmer omkring, men rører ikke værdien indeni", () => {
    expect(eksterntHref("  www.x.dk  ")).toBe("https://www.x.dk");
  });
});

describe("eksterntHref — alt andet er tekst, aldrig et link", () => {
  it("tomt, mellemrum og ikke-strenge", () => {
    for (const d of ["", "   ", "\t\n", null, undefined]) expect(eksterntHref(d)).toBeNull();
  });

  it("en sætning er ikke én adresse", () => {
    expect(eksterntHref("har ingen")).toBeNull();
    expect(eksterntHref("ved det ikke")).toBeNull();
    expect(eksterntHref("x.dk og y.dk")).toBeNull();
  });

  it("uden punktum i værten er det ikke en adresse", () => {
    expect(eksterntHref("har")).toBeNull();
    expect(eksterntHref("localhost")).toBeNull();
    expect(eksterntHref("ingen/side")).toBeNull();
  });

  it("ETHVERT andet skema bliver tekst — ikke et brudt https-link", () => {
    for (const d of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(document.domain)",
      "  javascript:alert(1)  ",
      "mailto:jonas@topix.dk",
      "tel:+4512345678",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "blob:https://x.dk/abc",
      "ftp://x.dk",
      "file:///etc/passwd",
    ]) {
      expect(eksterntHref(d), d).toBeNull();
    }
  });

  it("protokol-relativ arver siden protokol og er ikke en hjemmeside", () => {
    expect(eksterntHref("//evil.dk")).toBeNull();
    expect(eksterntHref("///evil.dk")).toBeNull();
  });

  it("INVARIANTEN: svaret er enten null eller en http(s)-adresse — aldrig andet", () => {
    const alt = [
      "https://x.dk", "http://x.dk", "x.dk", "www.x.dk", "x.dk/om", "",
      "javascript:alert(1)", "mailto:a@b.dk", "data:text/html,x", "//evil.dk",
      "har ingen", "localhost", "https://", "tel:123", "HTTPS://X.DK",
    ];
    for (const d of alt) {
      const h = eksterntHref(d);
      if (h === null) continue;
      expect(/^https?:\/\//i.test(h), `${d} → ${h}`).toBe(true);
    }
  });
});
