import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendeUdfald, sendefejlTekst, visSendefejl, type FejletBesked } from "@/lib/chatSendefejl";

// analyse-medlemsrejse 30/9 §2.8: en besked, der ikke blev sendt, gav ingen
// besked — og editoren var allerede tømt, så teksten var væk.

describe("sendeUdfald", () => {
  it("sendt KUN med data og uden fejl", () => {
    expect(sendeUdfald({ data: { id: "m1" }, error: null })).toBe("sendt");
  });
  it("fejl → fejlet", () => {
    expect(sendeUdfald({ data: null, error: { message: "nej" } })).toBe("fejlet");
    expect(sendeUdfald({ data: { id: "m1" }, error: { message: "nej" } })).toBe("fejlet");
  });
  it("intet data uden fejl → fejlet (ikke tavs succes)", () => {
    expect(sendeUdfald({ data: null, error: null })).toBe("fejlet");
  });
});

const besked = (content: string, conversation_id = "c1"): FejletBesked => ({
  raekke: { conversation_id, sender_id: "u1", content },
});

describe("sendefejlTekst", () => {
  it("nævner beskedens uddrag", () => {
    expect(sendefejlTekst(besked("Hej Morten, kan vi tale om likviditeten?"))).toBe(
      "Beskeden blev ikke sendt: «Hej Morten, kan vi tale om likviditeten?»",
    );
  });
  it("HTML bliver ren tekst, og en tom besked er en vedhæftning", () => {
    expect(sendefejlTekst(besked("<p><strong>Fed</strong> tekst</p>"))).toBe("Beskeden blev ikke sendt: «Fed tekst»");
    expect(sendefejlTekst(besked("📎"))).toBe("Beskeden blev ikke sendt: «📎 Vedhæftning»");
  });
});

describe("visSendefejl", () => {
  it("kun i den samtale, beskeden blev skrevet i", () => {
    expect(visSendefejl(besked("x", "c1"), "c1")).toBe(true);
    expect(visSendefejl(besked("x", "c1"), "c2")).toBe(false);
    expect(visSendefejl(null, "c1")).toBe(false);
  });
});

// Kildeværn: fladen må aldrig igen være tavs ved en fejlet indsættelse.
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const PANE = udenKommentarer(readFileSync(resolve(process.cwd(), "src/components/MemberChatPane.tsx"), "utf8"));
// Rådgiverens chat (30/9): samme linje, samme komponent — CompanyChatPane var tavs på samme måde.
const RAADGIVER_PANE = udenKommentarer(readFileSync(resolve(process.cwd(), "src/components/CompanyChatPane.tsx"), "utf8"));

export const sendefejlVises = (kilde: string): boolean => {
  const send = kilde.slice(kilde.indexOf("const handleSend = useCallback("), kilde.indexOf("const proevFejletIgen"));
  return (
    !send.includes("if (!error && data)") &&
    send.includes('if (sendeUdfald(svar) === "sendt") {') &&
    /\} else \{[\s\S]*?setFejletBesked\(\{ raekke: insertData \}\)/.test(send) &&
    kilde.includes("visSendefejl(fejletBesked, activeConvId) &&") &&
    kilde.includes("onProevIgen={() => void proevFejletIgen()}") &&
    kilde.includes("<ChatSendefejlLinje") &&
    // «Prøv igen» indsætter den SAMME række — ingen ny upload.
    kilde.includes('supabase.from("messages").insert(fejletBesked.raekke as any)')
  );
};

describe("MemberChatPane — kildeværn for sendefejlen", () => {
  it("en fejlet indsættelse gemmes og vises med «Prøv igen»", () => {
    expect(sendefejlVises(PANE)).toBe(true);
  });
  it("selvbevis: den gamle tavse gren fælder værnet", () => {
    const gammel = PANE.replace(
      /if \(sendeUdfald\(svar\) === "sendt"\) \{[\s\S]*?setFejletBesked\(\{ raekke: insertData \}\);/,
      "if (!error && data) {",
    );
    expect(sendefejlVises(gammel)).toBe(false);
  });
});

describe("CompanyChatPane — kildeværn for sendefejlen (rådgiverens chat)", () => {
  it("en fejlet indsættelse gemmes og vises med «Prøv igen»", () => {
    expect(sendefejlVises(RAADGIVER_PANE)).toBe(true);
  });
  it("selvbevis: den gamle tavse gren fælder værnet", () => {
    const gammel = RAADGIVER_PANE.replace(
      /if \(sendeUdfald\(svar\) === "sendt"\) \{[\s\S]*?setFejletBesked\(\{ raekke: insertData \}\);/,
      "if (!error && data) {",
    );
    expect(gammel).not.toBe(RAADGIVER_PANE);
    expect(sendefejlVises(gammel)).toBe(false);
  });
  it("begge paneler bruger den ENE linje-komponent (ingen kopi af markup)", () => {
    for (const kilde of [PANE, RAADGIVER_PANE]) {
      expect(kilde).toContain("<ChatSendefejlLinje");
      expect(kilde).not.toContain("data-sendefejl");
    }
  });
});
