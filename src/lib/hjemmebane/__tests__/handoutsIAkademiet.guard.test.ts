import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bygHbNav, medlemmetsNav, raadgiverensNav } from "@/lib/hjemmebane/hbNav";
import { RETNING_MODUL, RETNING_STI, erOevelse, oevelseTilbage, oevelserForSamling } from "@/lib/hjemmebane/oevelse";
import { TJEKLISTE_STIER, byggTjekliste } from "@/lib/onboardingTjekliste";
import { deriveFocus } from "@/components/hjemmebane/boardroom/nextStep";
import { moduleOrder } from "@/lib/handoutConfig";

/* Kildeværn (1/10-2026 nat, Jonas 1/10 22:29–22:50: «Handouts hører til
   Akademiet. … Vi skal passe på med ikke at forvirre medlemmerne for meget
   med for mange områder … Enkelthed er et nøgleord.»):

     1. Medlemmets menu (fuldt medlem og abonnent) har intet «Handouts»-punkt
        og intet link til /handouts. Rådgiverens «Dine tal» beholder det
        (vejen ind i virksomhedens handouts).
     2. Modulet overordnet («Målsætning 12 mdr.») er IKKE en øvelse: det bor
        i Dine mål (/milestones). Motoren siger nej, samlingen udelader det,
        kortet henviser, og /handouts?module=overordnet sender medlemmet
        til Dine mål.
     3. Ruterne /handouts og /handout LEVER (gamle links og mails) — de er
        bare ikke medlemmets menu.
     4. Ingen medlemsflade linker til /handouts som destination fra menuen
        eller forsiden: nav, tjeklisten, fokuskortet (nextStep) og
        BoardroomView. Vejen ind er lektionen/samlingen (OevelseKort), og
        «Tilbage» fra udfyldningen går til lektionen, aldrig /handouts.
     5. Lektionen og samlingen tegner øvelsen gennem den delte motor
        (OevelseKort, oevelserForSamling) — ikke en egen handout-sektion.
     6. Tjeklistens punkt hedder «Din første øvelse», og kom-i-gang-mailen
        (begge spejle) begynder med samme ord. */

const ROD = resolve(__dirname, "../../../../");
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (kilde: string) =>
  kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const alleLinks = (nav: ReturnType<typeof bygHbNav>): { label: string; to: string | null }[] =>
  nav.flatMap((n) => [{ label: n.label, to: n.to ?? null }, ...(n.children ?? []).map((c) => ({ label: c.label, to: c.to ?? null }))]);

describe("handouts i Akademiet — dom 1: medlemmets menu", () => {
  it("fuldt medlem og abonnent: intet punkt hedder Handouts, intet peger på /handouts", () => {
    for (const erAbonnent of [false, true]) {
      for (const certifikat of [null, "ny", "laast", "aaben"] as const) {
        const links = alleLinks(bygHbNav({ isAdvisor: false, erAbonnent, active: "boardroom", certifikat }));
        expect(links.map((l) => l.label)).not.toContain("Handouts");
        for (const l of links) expect(l.to ?? "").not.toMatch(/^\/handouts?(\?|\/|$)/);
      }
    }
    expect(alleLinks(medlemmetsNav("handouts", false, "/")).some((l) => l.to === "/handouts")).toBe(false);
  });

  it("rådgiverens Dine tal beholder Handouts (bevidst — vejen ind i virksomhedens handouts)", () => {
    const dineTal = raadgiverensNav("boardroom").find((n) => n.label === "Dine tal");
    expect(dineTal?.children?.map((c) => c.to)).toContain("/handouts");
  });
});

describe("handouts i Akademiet — dom 2: overordnet er ikke en øvelse", () => {
  it("motoren: erOevelse(overordnet) er falsk, de fire andre sande; samlingen udelader den", () => {
    expect(RETNING_MODUL).toBe("overordnet");
    expect(erOevelse(RETNING_MODUL)).toBe(false);
    expect(moduleOrder.filter(erOevelse)).toEqual(["bogholderi", "administration", "salg", "marketing"]);
    expect(oevelserForSamling([{ item: { handout_module: "overordnet" } }])).toEqual([]);
  });

  it("kortet henviser til Dine mål for overordnet; HandoutsView sender medlemmet til RETNING_STI", () => {
    const kort = udenKommentarer(laes("src/components/hjemmebane/akademi/OevelseKort.tsx"));
    expect(kort).toContain("if (module === RETNING_MODUL) return <RetningHenvisning />;");
    expect(kort).toContain("to={RETNING_STI}");
    const view = udenKommentarer(laes("src/components/hjemmebane/handouts/HandoutsView.tsx"));
    expect(view).toContain("if (activeModule === RETNING_MODUL) return <Navigate to={RETNING_STI} replace />;");
    expect(RETNING_STI).toBe("/milestones");
  });
});

describe("handouts i Akademiet — dom 3: ruterne lever", () => {
  it("/handouts bærer fladen og /handout redirecter — begge står i App.tsx", () => {
    const app = udenKommentarer(laes("src/App.tsx"));
    expect(app).toMatch(/<Route path="\/handouts" element=\{<ProtectedRoute><Handout \/><\/ProtectedRoute>\} \/>/);
    expect(app).toMatch(/<Route path="\/handout" element=\{<HandoutRedirect \/>\} \/>/);
  });

  it("medlemmet på /handouts uden modul sendes til Akademiet; med modul åbnes editoren med tilbage til lektionen", () => {
    const view = udenKommentarer(laes("src/components/hjemmebane/handouts/HandoutsView.tsx"));
    expect(view).toContain('if (!activeModule) return <Navigate to="/akademiet" replace />;');
    expect(view).toContain("tilbageTilAkademiet");
    const detalje = udenKommentarer(laes("src/components/hjemmebane/handouts/HbHandoutDetail.tsx"));
    expect(detalje).toContain("const tilbage = tilbageTilAkademiet ? oevelseTilbage(lektioner) : null;");
    expect(detalje).toContain("to={tilbage.to}");
  });
});

describe("handouts i Akademiet — dom 4: ingen medlemsflade linker til /handouts fra menu eller forside", () => {
  it("tjeklisten: handout-punktets sti er Akademiet", () => {
    expect(TJEKLISTE_STIER.handout).toBe("/akademiet");
    expect(Object.values(TJEKLISTE_STIER).some((s) => s.startsWith("/handout"))).toBe(false);
  });

  it("fokuskortet (h): uden sti → Akademiet, med sti → lektionen; aldrig /handouts", () => {
    const base = {
      now: new Date("2026-08-15T10:00:00Z"),
      processedPeriodKeys: new Set(["2026-06", "2026-07"]),
      committedPeriodKeys: new Set(["2026-06", "2026-07"]),
      hasPulseThisMonth: true,
      unreadUserMessages: 0,
      unreadAgentMessages: 0,
      weeklyFocus: null,
      openActions: [],
      unlinkedLevers: [{ lever: "L", moduleTitle: "Salg" }],
      askMeAboutMissing: false,
    } as unknown as Parameters<typeof deriveFocus>[0];
    const punkt = deriveFocus(base).find((i) => i.kind === "unlinked-lever");
    expect(punkt?.ctaHref).toBe("/akademiet");
    const kilde = udenKommentarer(laes("src/components/hjemmebane/boardroom/nextStep.ts"));
    expect(kilde).not.toMatch(/["'`]\/handouts/);
  });

  it("forsiden (BoardroomView) og nav-motoren (hbNav) bærer intet /handouts-link til medlemmet", () => {
    const forside = udenKommentarer(laes("src/components/hjemmebane/boardroom/BoardroomView.tsx"));
    expect(forside).not.toMatch(/["'`]\/handouts/);
    expect(forside).toContain("sti: oevelseLektionSti(");
    const nav = udenKommentarer(laes("src/lib/hjemmebane/hbNav.ts"));
    // Ét sted bærer stien: HANDOUTS_PUNKT, som kun rådgiverens dineTal(…, true) tager med.
    expect(nav.match(/"\/handouts"/g) ?? []).toHaveLength(1);
    expect(nav).toContain("dineTal(active, false)");
    expect(nav).toContain("dineTal(active, true), blok: medlem");
  });

  it("tilbage fra udfyldningen går til lektionen eller Akademiet — aldrig /handouts", () => {
    expect(oevelseTilbage([]).to).toBe("/akademiet");
    expect(oevelseTilbage([{ area: "classroom", slug: "x", title: "X" }]).to).toBe("/akademiet/classroom/x");
  });
});

describe("handouts i Akademiet — dom 5: lektion og samling tegner øvelsen gennem motoren", () => {
  it("ElementView bruger OevelseKort (ingen egen HandoutSection); KursusView bruger oevelserForSamling", () => {
    const element = udenKommentarer(laes("src/components/hjemmebane/akademi/views/ElementView.tsx"));
    expect(element).toContain("<OevelseKort module={item.handout_module} unlocked={drip.unlocked} />");
    expect(element).not.toContain("HandoutSection");
    expect(element).not.toMatch(/["'`]\/handouts/);
    const kursus = udenKommentarer(laes("src/components/hjemmebane/akademi/views/KursusView.tsx"));
    expect(kursus).toContain("const oevelser = oevelserForSamling(entries);");
    expect(kursus).toContain("<OevelseKort key={modul} module={modul} unlocked={samlingUlaast} />");
  });

  it("OevelseKort går til editoren gennem oevelseSti — det eneste sted, medlemmet møder /handouts (som query-rute, ikke menu)", () => {
    const kort = udenKommentarer(laes("src/components/hjemmebane/akademi/OevelseKort.tsx"));
    expect(kort).toContain("to={oevelseSti(config.module)}");
    expect(kort).not.toMatch(/["'`]\/handouts/);
  });
});

describe("handouts i Akademiet — dom 6: tjeklistens ord og mailen", () => {
  it("punktet hedder «Din første øvelse», og begge spejle af kom-i-gang-mailen begynder med det", () => {
    const punkt = byggTjekliste({
      har_velkomstvideo: true, velkomstvideo_set_at: null, kan_oprette_traad: true, har_praesentation: false,
      ask_me_about: null, avatar_url: null, website: null, industry_label: null, cvr_number: null,
      antal_rapporter: 0, antal_godkendte: 0, antal_udfyldte_handouts: 0, last_member_message_at: null,
    }).punkter.find((p) => p.id === "handout");
    expect(punkt?.titel).toBe("Din første øvelse");
    for (const sti of ["src/lib/onboardingRytme.ts", "supabase/functions/_shared/onboardingRytme.ts"]) {
      const kilde = laes(sti);
      expect(kilde).toContain('"Din første øvelse — øvelserne ligger under lektionerne i Akademiet.",');
      expect(kilde).not.toContain("Dit første handout");
    }
  });
});
