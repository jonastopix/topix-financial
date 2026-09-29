import { describe, expect, it } from "vitest";
import { sikkerReturSti } from "../sikkerReturUrl";

// Fund 4 (30/9-2026): /auth?returnUrl=… må kun føre til en intern sti.
const ORIGIN = "https://app.theboardroom.dk";

describe("sikkerReturSti — intern sti eller «/»", () => {
  it("tom/manglende → /", () => {
    expect(sikkerReturSti(null, ORIGIN)).toBe("/");
    expect(sikkerReturSti(undefined, ORIGIN)).toBe("/");
    expect(sikkerReturSti("", ORIGIN)).toBe("/");
  });

  it("interne stier bevares med søgning og anker", () => {
    expect(sikkerReturSti("/legat", ORIGIN)).toBe("/legat");
    expect(sikkerReturSti("/chat?conversationId=abc", ORIGIN)).toBe("/chat?conversationId=abc");
    expect(sikkerReturSti("/rapportering#annual-reports", ORIGIN)).toBe("/rapportering#annual-reports");
  });

  it("vores egen https-adresse (create-legat-enrollment) → stien", () => {
    expect(sikkerReturSti("https://app.theboardroom.dk/legat", ORIGIN)).toBe("/legat");
    expect(sikkerReturSti("https://app.theboardroom.dk/legat?x=1", "https://preview.lovable.app")).toBe("/legat?x=1");
    expect(sikkerReturSti("https://preview.lovable.app/chat", "https://preview.lovable.app")).toBe("/chat");
  });

  it("fremmede absolutte adresser → /", () => {
    expect(sikkerReturSti("https://falsk-boardroom.dk/login", ORIGIN)).toBe("/");
    expect(sikkerReturSti("https://app.theboardroom.dk.ond.dk/", ORIGIN)).toBe("/");
    expect(sikkerReturSti("https://app.theboardroom.dk@ond.dk/", ORIGIN)).toBe("/");
    expect(sikkerReturSti("https://bruger:kode@app.theboardroom.dk/", ORIGIN)).toBe("/");
    expect(sikkerReturSti("https://app.theboardroom.dk:8443/", ORIGIN)).toBe("/");
    expect(sikkerReturSti("http://app.theboardroom.dk/legat", ORIGIN)).toBe("/");
    expect(sikkerReturSti("javascript:alert(1)", ORIGIN)).toBe("/");
    expect(sikkerReturSti("data:text/html,<script>", ORIGIN)).toBe("/");
    expect(sikkerReturSti("ond.dk", ORIGIN)).toBe("/");
  });

  it("protokol-relative og snyde-former → /", () => {
    expect(sikkerReturSti("//ond.dk", ORIGIN)).toBe("/");
    expect(sikkerReturSti("//ond.dk/login", ORIGIN)).toBe("/");
    expect(sikkerReturSti("/\\ond.dk", ORIGIN)).toBe("/");
    expect(sikkerReturSti("\\\\ond.dk", ORIGIN)).toBe("/");
    expect(sikkerReturSti("/\t/ond.dk", ORIGIN)).toBe("/");
    expect(sikkerReturSti("/\n/ond.dk", ORIGIN)).toBe("/");
    expect(sikkerReturSti(" /legat", ORIGIN)).toBe("/");
    expect(sikkerReturSti("/.//ond.dk", ORIGIN)).toBe("/");
  });

  it("svaret starter altid med «/» og aldrig med «//»", () => {
    const input = ["/a", "//b", "https://x.dk", "/%2F/ond.dk", "/..//ond.dk", "https://app.theboardroom.dk//ond.dk", "?x", "#y"];
    for (const i of input) {
      const s = sikkerReturSti(i, ORIGIN);
      expect(s.startsWith("/")).toBe(true);
      expect(s.startsWith("//")).toBe(false);
    }
  });
});
