import { describe, expect, it } from "vitest";
import { bygRykkerMail, samtaledagOrd, type MailKontekst } from "../../../supabase/functions/_shared/ansoegningRykkerMails.ts";

// Rettelse 19/9 (recon §8 punkt 8): dag −1-mailen rykkes tilbage til nærmeste hverdag, så før en
// mandagssamtale går den fredag — så hedder det «på mandag», ikke «i morgen».
const K: MailKontekst = {
  fornavn: "Lisbeth", virksomhedsnavn: "Nordic Byg ApS", bookingUrl: "https://s", statusUrl: "https://s", ikkeNuUrl: "https://s&handling=ikke_nu",
  samtaleStart: new Date("2026-09-21T07:00:00Z"), aftaleUrl: null, token: "abc", manglerSvar: null,
};

describe("samtaledagOrd — «i morgen» kun når det er i morgen", () => {
  it("dagen efter → i morgen; samme dag → i dag; fredag før mandag → på mandag; uden tid → snart", () => {
    const mandag = new Date("2026-09-21T07:00:00Z");
    expect(samtaledagOrd(mandag, new Date("2026-09-20T10:00:00Z"))).toBe("i morgen");
    expect(samtaledagOrd(mandag, new Date("2026-09-21T05:00:00Z"))).toBe("i dag");
    expect(samtaledagOrd(mandag, new Date("2026-09-18T08:00:00Z"))).toBe("på mandag");
    expect(samtaledagOrd(new Date("2026-09-24T07:00:00Z"), new Date("2026-09-22T08:00:00Z"))).toBe("på torsdag");
    expect(samtaledagOrd(null, new Date())).toBe("snart");
    // midnat dansk: søndag 23:30 UTC er mandag 01:30 dansk → samtalen mandag kl. 09 er «i dag»
    expect(samtaledagOrd(mandag, new Date("2026-09-20T23:30:00Z"))).toBe("i dag");
  });
  it("mailen følger ordet i emne og tekst", () => {
    const fredag = bygRykkerMail("ansoegning-samtale-i-morgen", { ...K, nu: new Date("2026-09-18T08:00:00Z") })!;
    expect(fredag.emne).toBe("På mandag: vores snak");
    expect(fredag.tekst).toContain("Vi ses på mandag, mandag");
    const soendag = bygRykkerMail("ansoegning-samtale-i-morgen", { ...K, nu: new Date("2026-09-20T08:00:00Z") })!;
    expect(soendag.emne).toBe("I morgen: vores snak");
    expect(soendag.tekst).toContain("Vi ses i morgen, mandag");
  });
});
