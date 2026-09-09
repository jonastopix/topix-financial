import { describe, expect, it } from "vitest";
import {
  PROFIL_FELTER,
  PROFIL_GRAENSE,
  faktalinje,
  faktalinjeLed,
  klipTilGraense,
  kortLinje,
  maanedAar,
  manglerSaetning,
  profilFelt,
  profilMangler,
  profilensDele,
  tilGemmevaerdi,
} from "@/lib/hjemmebane/netvaerksprofil";

// Profilen forfra (Jonas 9/9): faktalinjen uden tal, tre felter med
// hver sin grænse. Testene låser ordene, rækkefølgen og grænserne.

describe("felterne — tre, i fast rækkefølge, med de besluttede grænser", () => {
  it("hedder det de hedder, og har 160/300/200 tegn", () => {
    expect(PROFIL_FELTER.map((f) => f.label)).toEqual(["Det laver vi", "Det har jeg været igennem", "Det leder jeg efter"]);
    expect(PROFIL_FELTER.map((f) => f.graense)).toEqual([160, 300, 200]);
    expect(PROFIL_GRAENSE).toEqual({ det_laver_vi: 160, vaeret_igennem: 300, leder_efter: 200 });
    expect(profilFelt("vaeret_igennem").hjaelp).toContain("fordi du har prøvet det");
    expect(profilFelt("vaeret_igennem").hjaelp).toContain("generationsskifte");
    expect(profilFelt("det_laver_vi").hjaelp).toBe("Én sætning om hvad I sælger, og til hvem. Ikke jeres mission — det I får penge for.");
    expect(profilFelt("leder_efter").hjaelp).toContain("Én ting du gerne vil høre fra en der har prøvet det");
  });
  it("ingen af de tre nævner «god til» eller «lige nu»", () => {
    for (const f of PROFIL_FELTER) {
      expect(`${f.label} ${f.hjaelp} ${f.eksempel}`.toLowerCase()).not.toContain("lige nu");
      expect(f.label.toLowerCase()).not.toContain("god til");
    }
  });
});

describe("tegngrænserne", () => {
  it("klipper ved grænsen, ikke før — og rører ikke mellemrum", () => {
    expect(klipTilGraense("a".repeat(500), "det_laver_vi")).toHaveLength(160);
    expect(klipTilGraense("a".repeat(500), "vaeret_igennem")).toHaveLength(300);
    expect(klipTilGraense("a".repeat(500), "leder_efter")).toHaveLength(200);
    expect(klipTilGraense("a".repeat(200), "leder_efter")).toHaveLength(200);
    expect(klipTilGraense("hej ", "leder_efter")).toBe("hej ");
  });
  it("gemmeværdien er trimmet og tom → null", () => {
    expect(tilGemmevaerdi("  Møbler til hoteller  ")).toBe("Møbler til hoteller");
    expect(tilGemmevaerdi("   ")).toBeNull();
    expect(tilGemmevaerdi(null)).toBeNull();
    expect(tilGemmevaerdi(undefined)).toBeNull();
  });
});

describe("hvad der er udfyldt — og hvad der mangler på egen profil", () => {
  it("de tre dele læses fra hver sin kolonne, trimmet", () => {
    expect(profilensDele({ company_description: " Møbler ", ask_me_about: "", working_on: null })).toEqual({
      det_laver_vi: "Møbler",
      vaeret_igennem: null,
      leder_efter: null,
    });
  });
  it("mangler-listen står i felternes rækkefølge og er tom når alt er skrevet", () => {
    expect(profilMangler({ company_description: null, ask_me_about: null, working_on: null })).toEqual([
      "hvad I laver",
      "hvad du har været igennem",
      "hvad du leder efter",
    ]);
    expect(profilMangler({ company_description: "x", ask_me_about: null, working_on: "y" })).toEqual(["hvad du har været igennem"]);
    expect(profilMangler({ company_description: "x", ask_me_about: "y", working_on: "z" })).toEqual([]);
  });
  it("sætningen: ét, to eller tre led med «og» — null når intet mangler", () => {
    expect(manglerSaetning({ company_description: null, ask_me_about: null, working_on: null })).toBe(
      "Du har ikke skrevet hvad I laver, hvad du har været igennem og hvad du leder efter.",
    );
    expect(manglerSaetning({ company_description: "x", ask_me_about: null, working_on: null })).toBe(
      "Du har ikke skrevet hvad du har været igennem og hvad du leder efter.",
    );
    expect(manglerSaetning({ company_description: "x", ask_me_about: "y", working_on: null })).toBe("Du har ikke skrevet hvad du leder efter.");
    expect(manglerSaetning({ company_description: "x", ask_me_about: "y", working_on: "z" })).toBeNull();
  });
});

describe("faktalinjen — branche · by · stiftet · medlem siden, uden tal", () => {
  const fuld = { industry_label: "Design", city: "Aarhus", stiftet_aar: 2019, member_since: new Date(2026, 2, 12, 9).toISOString() };
  it("alle fire led i rækkefølge", () => {
    expect(faktalinjeLed(fuld)).toEqual(["Design", "Aarhus", "stiftet 2019", "medlem siden marts 2026"]);
    expect(faktalinje(fuld)).toBe("Design · Aarhus · stiftet 2019 · medlem siden marts 2026");
  });
  it("kun det der findes — tomme strenge og nul tæller ikke", () => {
    expect(faktalinje({ industry_label: " ", city: null, stiftet_aar: 0, member_since: null })).toBeNull();
    expect(faktalinje({ industry_label: null, city: "Odense", stiftet_aar: null, member_since: null })).toBe("Odense");
    expect(faktalinje({ industry_label: "Byg", city: null, stiftet_aar: 2001, member_since: null })).toBe("Byg · stiftet 2001");
  });
  it("rådgiver uden virksomhed: kun «medlem siden» hvis der er en, ellers null", () => {
    expect(faktalinje({ industry_label: null, city: null, stiftet_aar: null, member_since: null })).toBeNull();
  });
  it("måned og år på dansk, lokal tid; ugyldig dato → null", () => {
    expect(maanedAar(new Date(2025, 11, 31, 23).toISOString())).toBe("december 2025");
    expect(maanedAar("nej")).toBeNull();
    expect(maanedAar(null)).toBeNull();
  });
  it("linjen bærer aldrig et tal der ikke er et årstal (ingen omsætning, ingen størrelse)", () => {
    const led = faktalinjeLed(fuld);
    for (const l of led) expect(l.replace(/\b(19|20)\d{2}\b/g, "")).not.toMatch(/\d/);
  });
});

describe("kortets linje på /medlemmer", () => {
  it("virksomhed · branche · by — uden årstal", () => {
    expect(kortLinje({ company_name: "Bastant Design", industry_label: "Design", city: "Aarhus" })).toBe("Bastant Design · Design · Aarhus");
    expect(kortLinje({ company_name: "Bastant Design", industry_label: null, city: "" })).toBe("Bastant Design");
    expect(kortLinje({ company_name: null, industry_label: null, city: null })).toBeNull();
  });
});
