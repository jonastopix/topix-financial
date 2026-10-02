import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScoreKort } from "../ScoreKort";
import { boardroomScore } from "@/lib/boardroomScore/score";
import { naesteMaaned } from "@/lib/boardroomScore/streak";
import { loefterMitTal } from "@/lib/boardroomScore/loefter";
import type { ScoreGrundlag, ScoreMaaned } from "@/lib/boardroomScore/typer";
import { TROFAEER, TROFAE_FORKLARING, type TrofaeDom } from "@/lib/gamification/trofaeer";
import {
  EFFEKT_FOERSTE_SCORE,
  EFFEKT_LAASER_OP,
  LOEFTER_MAAL_MAERKE,
  ringBue,
  SCORE_AFVENTER_OVERSKRIFT,
  SCORE_DETALJER_KNAP,
  SCORE_DETALJER_KNAP_LUK,
  SCORE_FEJL_TEKST,
  SCORE_FORBEHOLD,
  SCORE_INGEN_TAL,
} from "@/lib/hjemmebane/scoreKort";

/* Kortet tegner dommen — de fire tilstande og at handlingerne er motorens.
   Kompakt (Jonas 30/9 20:43): ringen, fire små barer, streaken på én linje,
   KUN den øverste løfter synlig; resten bag «Se hvad der tæller». */

const aabnDetaljer = () => fireEvent.click(screen.getByRole("button", { name: SCORE_DETALJER_KNAP }));

const NU = new Date("2026-09-30T10:00:00Z");
const sund = (key: string, over: Record<string, number | null> = {}): ScoreMaaned => ({
  key,
  basis: "measured",
  foersteGodkendtAt: `${naesteMaaned(key)}-05T09:00:00Z`,
  metrics: { revenue: 100_000, gross_profit: 70_000, payroll: 40_000, admin_costs: 20_000, ebt: 10_000, cash: 200_000, ...over },
});
const keys = (fra: string, antal: number): string[] => {
  const ud = [fra];
  while (ud.length < antal) ud.push(naesteMaaned(ud[ud.length - 1]));
  return ud;
};
const grundlag = (maaneder: ScoreMaaned[], over: Partial<ScoreGrundlag> = {}): ScoreGrundlag => ({
  maaneder,
  kontraktStart: "2025-01-01",
  harBudgetForAaret: false,
  harMaal: false,
  ...over,
});

const tegn = (props: Partial<React.ComponentProps<typeof ScoreKort>> = {}) =>
  render(
    <MemoryRouter>
      <ScoreKort dom={null} afventerMigration={false} isLoading={false} isError={false} onProevIgen={() => {}} {...props} />
    </MemoryRouter>,
  );

describe("ScoreKort", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("henter: skelet, ingen tekst om scoren", () => {
    const { container } = tegn({ isLoading: true });
    expect(container.querySelector('[data-score="henter"]')).not.toBeNull();
  });

  it("henter: skelettet har kortets opbygning — ringkolonne, fire barer, streaklinje, løfter og bundlinje (siden hopper ikke)", () => {
    const { container } = tegn({ isLoading: true });
    expect(container.querySelector("[data-skelet-ring]")).not.toBeNull();
    expect(container.querySelector("[data-skelet-soejler]")!.children).toHaveLength(4);
    expect(container.querySelector("[data-skelet-streak]")).not.toBeNull();
    expect(container.querySelector("[data-skelet-loefter]")).not.toBeNull();
    expect(container.querySelector("[data-skelet-bund]")).not.toBeNull();
    // Ingen fast minimumshøjde — højden kommer af opbygningen, som på kortet.
    expect(container.innerHTML).not.toMatch(/min-h-\[/);
    expect(container.textContent).toBe("");
  });

  it("fejl: rust linje + Prøv igen kalder genhentningen", () => {
    const proev = vi.fn();
    tegn({ isError: true, onProevIgen: proev });
    expect(screen.getByText(SCORE_FEJL_TEKST, { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Prøv igen" }));
    expect(proev).toHaveBeenCalledTimes(1);
  });

  it("en fejlet GENHENTNING med en dom i hånden viser dommen, ikke fejlen", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom, isError: true });
    expect(container.querySelector('[data-score="fejl"]')).toBeNull();
    expect(container.querySelector("[data-score-tal]")).not.toBeNull();
  });

  it("afventer migration: roligt «på vej», intet tal, ingen streak", () => {
    const { container } = tegn({ afventerMigration: true });
    expect(screen.getByText(SCORE_AFVENTER_OVERSKRIFT)).toBeTruthy();
    expect(container.querySelector("[data-score-streak]")).toBeNull();
    expect(container.querySelector("[data-score-tal]")).toBeNull();
  });

  it("dommen: tallet (uden bevægelse i testmiljøet står det straks), streaken, fire søjler, handlingerne ordret og som links", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    expect(dom.score).not.toBeNull();
    const { container } = tegn({ dom });
    expect(screen.getByText(`Din Boardroom Score er ${dom.score} ud af 1.000`)).toBeTruthy();
    expect(container.querySelector("[data-score-tal]")!.textContent).toContain(String(dom.score));
    expect(container.querySelectorAll("[data-soejle]")).toHaveLength(4);
    expect(container.querySelector(`[data-score-streak="${dom.streak.status}"]`)).not.toBeNull();
    const handlinger = loefterMitTal(dom);
    expect(handlinger.length).toBeGreaterThan(1);
    // I hvile: KUN den øverste (= motorens loefterMest).
    expect(container.querySelectorAll("[data-loefter-soejle]")).toHaveLength(1);
    expect(container.querySelector("[data-loefter-soejle]")!.getAttribute("data-loefter-soejle")).toBe(dom.loefterMest!.soejle);
    aabnDetaljer();
    const rækker = container.querySelectorAll("[data-loefter-soejle]");
    expect(rækker).toHaveLength(handlinger.length);
    handlinger.forEach((h, i) => {
      expect(rækker[i].textContent).toContain(h.tekst);
      const a = rækker[i].querySelector("a");
      if (h.sti) expect(a?.getAttribute("href")).toBe(h.sti);
      else expect(a).toBeNull();
    });
    expect(screen.getByText(SCORE_FORBEHOLD)).toBeTruthy();
  });

  it("uden opskalering (1/10-2026): to søjler uden data står «—», og tallet er summen af barernes point", () => {
    // Brilleværk-formen: ingen bank, for kort historik til vækst. Før 1/10 blev Σ point skaleret op til 1000.
    const dom = boardroomScore(grundlag([sund("2026-07", { cash: null }), sund("2026-08", { cash: null })]), NU);
    expect(dom.score).not.toBeNull();
    const { container } = tegn({ dom });
    const point = [...container.querySelectorAll("[data-soejle]")].map((el) => el.getAttribute("data-soejle-point"));
    expect(container.querySelector('[data-soejle="likviditet"]')!.getAttribute("data-soejle-point")).toBe("ingen");
    expect(container.querySelector('[data-soejle="vaekst"]')!.getAttribute("data-soejle-point")).toBe("ingen");
    expect(container.querySelector('[data-soejle="likviditet"] dd')!.textContent).toBe("—");
    const sum = point.filter((p) => p !== "ingen").reduce((a, p) => a + Number(p), 0);
    // Barerne viser afrundede point; scoren er den afrundede sum — højst ½ point pr. søjle fra hinanden.
    expect(Math.abs((dom.score as number) - sum)).toBeLessThanOrEqual(2);
    expect(container.querySelector("[data-score-daekning-tekst]")!.textContent).toBe("2 af 4 søjler giver point endnu");
  });

  it("rådets fund 1/10 (Brilleværk): disciplin øverst, banksaldo-linjen bagest i detaljerne med «Låser en søjle op»", () => {
    // Indtjening og vækst mættede, budget mangler (lille regnet disciplin-gevinst), intet banktal.
    const voksende = (k: string) =>
      k >= "2026"
        ? sund(k, { revenue: 150_000, gross_profit: 105_000, ebt: 45_000, cash: null })
        : sund(k, { ebt: 30_000, cash: null });
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map(voksende), { harBudgetForAaret: false }), NU);
    const { container } = tegn({ dom });
    expect(container.querySelector("[data-loefter-soejle]")!.getAttribute("data-loefter-soejle")).toBe("disciplin");
    aabnDetaljer();
    const rækker = [...container.querySelectorAll("[data-loefter-soejle]")];
    expect(rækker.map((r) => r.getAttribute("data-loefter-soejle"))).toEqual(["disciplin", "likviditet"]);
    expect(rækker[1].textContent).toContain(EFFEKT_LAASER_OP);
    expect(rækker[0].textContent).not.toContain(EFFEKT_LAASER_OP);
  });

  it("uden score: «Ikke nok tal endnu», streaken står stadig", () => {
    const dom = boardroomScore(grundlag([], { kontraktStart: "2026-01-01" }), NU);
    expect(dom.score).toBeNull();
    const { container } = tegn({ dom });
    expect(screen.getByText(SCORE_INGEN_TAL)).toBeTruthy();
    expect(container.querySelector("[data-score-streak]")).not.toBeNull();
    // Kompakt: samme ramme — tom ring (kun sporet), fire barer, ingen skærmlæsertekst om et tal, der ikke findes.
    expect(container.querySelector("[data-score-ring]")).not.toBeNull();
    expect(container.querySelector("[data-score-bue]")).toBeNull();
    expect(container.querySelectorAll("[data-soejle]")).toHaveLength(4);
    expect(container.textContent).not.toMatch(/Din Boardroom Score er/);
  });

  it("rådets fund 1+2: nyt medlem (start 20/8, august uploadet) — streaken er ikke «brudt», og ingen «+N point» under «Ikke nok tal endnu»", () => {
    const dom = boardroomScore(
      grundlag([sund("2026-08")].map((m) => ({ ...m, foersteGodkendtAt: "2026-09-03T09:00:00Z" })), { kontraktStart: "2026-08-20" }),
      NU,
    );
    expect(dom.score).toBeNull();
    const { container } = tegn({ dom });
    expect(container.querySelector('[data-score-streak="ingen"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/brudt/);
    expect(container.textContent).not.toMatch(/\+\d+ point/);
    expect(container.textContent).toContain(EFFEKT_FOERSTE_SCORE);
    // Rådets gennemsyn af #1189: linjen er den opmuntrende status, ikke «0 måneder i træk», og fristen står stadig.
    const linje = container.querySelector("[data-score-streak]")!;
    expect(linje.textContent).not.toMatch(/0 måneder i træk/);
    expect(linje.querySelector('[data-score-streak-tal="status"]')!.textContent).toBe("Ingen streak endnu");
    expect(linje.querySelector("[data-score-frist]")!.textContent).toMatch(/^Næste frist: /);
    // Statussen gentages ikke i detaljerne.
    aabnDetaljer();
    expect(container.querySelector("[data-score-streak-status]")).toBeNull();
    expect(container.textContent!.split("Ingen streak endnu")).toHaveLength(2);
  });

  it("rådets fund 4: med bevægelse viser første frame 0, ikke det endelige tal", () => {
    // matchMedia: ingen «reduce» → bevægelse; requestAnimationFrame holdes tilbage, så vi ser tilstanden FØR første ramme.
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    expect(dom.score).toBeGreaterThan(0);
    // Den virkelige vej: kortet monteres, mens hooken henter (score null), og dommen kommer bagefter.
    const { container, rerender } = tegn({ isLoading: true });
    rerender(
      <MemoryRouter>
        <ScoreKort dom={dom} afventerMigration={false} isLoading={false} isError={false} onProevIgen={() => {}} />
      </MemoryRouter>,
    );
    const tal = container.querySelector("[data-score-tal] span[aria-hidden]")!;
    expect(tal.textContent).toBe("0");
    // Skærmlæseren får stadig det endelige tal.
    expect(screen.getByText(`Din Boardroom Score er ${dom.score} ud af 1.000`)).toBeTruthy();
  });

  it("rådets fund 6: en løfter-linje uden link mærkes som mål; en med link gør ikke", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom });
    aabnDetaljer();
    const rækker = [...container.querySelectorAll("[data-loefter-soejle]")];
    expect(rækker.length).toBeGreaterThan(1);
    for (const r of rækker) {
      const harLink = r.querySelector("a") !== null;
      expect(r.getAttribute("data-loefter-art")).toBe(harLink ? "handling" : "maal");
      expect(r.querySelector("[data-loefter-maal]")?.textContent ?? null).toBe(harLink ? null : LOEFTER_MAAL_MAERKE);
    }
  });

  it("rådets fund 7: ingen «Din score» under sektionens eyebrow", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom });
    expect(container.textContent).not.toContain("Din score");
  });

  it("«Se hvad der tæller»: lukket som standard, aria-expanded/aria-controls, åbner søjlernes tal i ord og lukker igen", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom });
    const knap = screen.getByRole("button", { name: SCORE_DETALJER_KNAP });
    expect(knap.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(knap.getAttribute("aria-controls")!)!;
    expect(panel).not.toBeNull();
    expect(panel.hasAttribute("hidden")).toBe(true);
    expect(container.querySelectorAll("[data-soejle-detalje]")).toHaveLength(0);
    fireEvent.click(knap);
    expect(knap.getAttribute("aria-expanded")).toBe("true");
    expect(knap.textContent).toContain(SCORE_DETALJER_KNAP_LUK);
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(container.querySelectorAll("[data-soejle-detalje]")).toHaveLength(4);
    expect(container.querySelector("[data-score-streak-status]")).not.toBeNull();
    fireEvent.click(knap);
    expect(knap.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll("[data-soejle-detalje]")).toHaveLength(0);
  });

  it("trofæerne (2/10 eftermiddag): i hvile kun «N af M trofæer» under streaken; «Dine trofæer» først bag «Se hvad der tæller», uden egen ramme", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const trofaeer: TrofaeDom[] = TROFAEER.map((t, i) => ({ ...t, opnaaetAt: i < 3 ? "2026-09-01T10:00:00Z" : null }));
    const { container } = tegn({ dom, trofaeer });
    const antal = container.querySelector("[data-score-trofaeer-antal]");
    expect(antal?.textContent).toBe(`3 af ${TROFAEER.length} trofæer`);
    expect(screen.queryByText("Dine trofæer")).toBeNull();
    expect(container.querySelectorAll("[data-trofae]")).toHaveLength(0);
    aabnDetaljer();
    const indlejret = container.querySelector("[data-score-detaljer] [data-trofaeer-indlejret]");
    expect(indlejret).not.toBeNull();
    expect(screen.getByText("Dine trofæer")).toBeTruthy();
    expect(screen.getByText(TROFAE_FORKLARING)).toBeTruthy();
    expect(container.querySelectorAll("[data-trofae]")).toHaveLength(TROFAEER.length);
    expect(container.querySelectorAll('[data-opnaaet="ja"]')).toHaveLength(3);
  });

  it("trofæerne fail-soft: henter eller fejl → ingen linje og intet i detaljerne", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const trofaeer: TrofaeDom[] = TROFAEER.map((t) => ({ ...t, opnaaetAt: null }));
    for (const props of [{ trofaeer: undefined }, { trofaeer, trofaeerFejl: true }]) {
      const { container, unmount } = tegn({ dom, ...props });
      expect(container.querySelector("[data-score-trofaeer-antal]")).toBeNull();
      aabnDetaljer();
      expect(container.querySelector("[data-trofaeer]")).toBeNull();
      unmount();
    }
  });

  it("ringen: buen er i skala (samme længde som ringBue for scoren), og skærmlæserteksten står inde i ringens relative boks", () => {
    // prefers-reduced-motion: reduce → tallet og buen står straks på det endelige tal.
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom });
    const bue = container.querySelector("[data-score-bue]")!;
    const { laengde, omkreds } = ringBue(dom.score);
    expect(bue.getAttribute("stroke-dasharray")).toBe(`${laengde} ${omkreds}`);
    const sr = screen.getByText(`Din Boardroom Score er ${dom.score} ud af 1.000`);
    expect(sr.className).toContain("sr-only");
    const ring = sr.closest("[data-score-ring]")!;
    expect(ring).not.toBeNull();
    expect(ring.className).toMatch(/(^|\s)relative(\s|$)/);
  });

  it("streaken er ÉN linje: flammen, «N måneder i træk» og fristen den 20.", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom });
    const linje = container.querySelector("[data-score-streak]")!;
    expect(linje.tagName).toBe("P");
    expect(linje.textContent).toContain("15 måneder i træk");
    expect(linje.textContent).toContain("Næste frist: september senest 20/10");
  });

  it("ingen procent i kortets tekst (husets «Din måned»-mønster)", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom });
    expect(container.textContent).not.toMatch(/%/);
  });
});

describe("ScoreKort variant=\"forside\" (docs/forside-v3.md §3 «Score kompakt»)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const forside = (props: Partial<React.ComponentProps<typeof ScoreKort>> = {}) => {
    // prefers-reduced-motion: tallet og buen står straks (optællingen er den fulde variants, prøvet ovenfor).
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T18:00:00Z"));
    return tegn({ variant: "forside", ...props });
  };
  const DOM = () => boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
  const tre: TrofaeDom[] = TROFAEER.map((t, i) => ({ ...t, opnaaetAt: i < 3 ? "2026-09-01T10:00:00Z" : null }));

  it("standarden er den fulde variant (uændret): ingen forside-markør", () => {
    const { container } = tegn({ dom: DOM() });
    expect(container.querySelector("[data-score-variant]")).toBeNull();
    expect(screen.getByText(SCORE_FORBEHOLD)).toBeTruthy();
  });

  it("ringen: 92 px, r = 38, buen af ringBue(score, 1000, 38), «/ 1.000» og skærmlæserteksten", () => {
    const dom = DOM();
    const { container } = forside({ dom });
    const ring = container.querySelector("[data-score-ring]")!;
    expect(ring.className).toContain("h-[92px] w-[92px]");
    const bue = ring.querySelector("[data-score-bue]")!;
    expect(bue.getAttribute("r")).toBe("38");
    const forventet = ringBue(dom.score, 1000, 38);
    expect(bue.getAttribute("stroke-dasharray")).toBe(`${forventet.laengde} ${forventet.omkreds}`);
    expect(ring.textContent).toContain("/ 1.000");
    expect(screen.getByText(`Din Boardroom Score er ${dom.score} ud af 1.000`)).toBeTruthy();
  });

  it("fire søjler med mockuppens kolonner: én ved xl, to fra 1500 px og på sm", () => {
    const { container } = forside({ dom: DOM() });
    const grid = container.querySelector("[data-score-soejler]")!;
    expect(grid.className).toContain("grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-1 min-[1500px]:grid-cols-2");
    expect(grid.querySelectorAll("[data-soejle]")).toHaveLength(4);
  });

  it("listen: streaken i forsidens datoformat, «3 af 8 trofæer», certifikatet med lås", () => {
    const { container } = forside({ dom: DOM(), trofaeer: tre, certifikat: { dageTil: 13 } });
    expect(container.querySelector("[data-score-streak]")!.textContent).toMatch(/næste frist tirs\. 20\. okt\.$/);
    expect(container.querySelector("[data-score-trofaeer-antal]")!.textContent).toBe(`3 af ${TROFAEER.length} trofæer`);
    expect(container.querySelector('[data-score-certifikat="laast"]')!.textContent).toBe("Certifikatet åbner om 13 dage");
  });

  it("certifikatet klar: link til /certifikat; null eller udeladt: ingen linje; trofæfejl: ingen linje", () => {
    const { container, unmount } = forside({ dom: DOM(), certifikat: { klar: true } });
    const a = container.querySelector('[data-score-certifikat="klar"] a')!;
    expect(a.getAttribute("href")).toBe("/certifikat");
    expect(a.textContent).toBe("Dit certifikat er klar");
    unmount();
    const anden = forside({ dom: DOM(), certifikat: null, trofaeer: tre, trofaeerFejl: true });
    expect(anden.container.querySelector("[data-score-certifikat]")).toBeNull();
    expect(anden.container.querySelector("[data-score-trofaeer-antal]")).toBeNull();
  });

  it("«Løfter mest»: den øverste — men aldrig samme sti som forsidens primære handling", () => {
    const dom = DOM();
    const linjer = loefterMitTal(dom);
    // Motoren 30/9: «Fem procent mere omsætning …» (mål, ingen sti), «Upload og godkend september …» (/reports), ….
    expect(linjer.some((h) => h.sti === "/reports")).toBe(true);
    const { container, unmount } = forside({ dom });
    // Motorens sætning står uden sit slutpunktum (før «· +N point»), under «Løfter mest».
    expect(container.querySelector("[data-score-loefter-mest]")!.textContent).toContain(linjer[0].tekst.replace(/\.$/, ""));
    expect(container.querySelector("[data-score-loefter-mest]")!.textContent).toContain("Løfter mest");
    unmount();
    // Forsidens primære handling peger på /reports, og /reports står ØVERST: den næste vises.
    const rapport = { soejle: "disciplin" as const, tekst: "Upload og godkend september senest 20/10.", gevinst: 50, sti: "/reports" as const };
    const maal = { soejle: "vaekst" as const, tekst: "Fem procent mere omsætning end sammenligningen.", gevinst: 30, sti: null };
    const anden = forside({ dom: { ...dom, handlinger: [rapport, maal], loefterMest: rapport }, undgaaSti: "/reports" });
    const vist = anden.container.querySelector("[data-score-loefter-mest]")!;
    expect(vist.getAttribute("data-loefter-sti")).toBe("ingen");
    expect(vist.textContent).toContain(maal.tekst.replace(/\.$/, ""));
    expect(vist.textContent).not.toContain(rapport.tekst.replace(/\.$/, ""));
    // Den viste er ikke den øverste — mærket siger «Løfter også», aldrig «Løfter mest».
    expect(vist.textContent).toContain("Løfter også");
    expect(vist.textContent).not.toContain("Løfter mest");
    anden.unmount();
    // Er /reports den eneste løfter, står der ingen linje.
    const ingen = forside({ dom: { ...dom, handlinger: [rapport], loefterMest: rapport }, undgaaSti: "/reports" });
    expect(ingen.container.querySelector("[data-score-loefter-mest]")).toBeNull();
  });

  it("bundlinjen og detaljerne: «Et helbredstal …», knappen åbner SAMME detaljer (søjler i ord, de øvrige løftere, trofæerne indlejret)", () => {
    const dom = DOM();
    const { container } = forside({ dom, trofaeer: tre });
    expect(screen.getByText("Et helbredstal, ikke en kreditvurdering.")).toBeTruthy();
    const knap = screen.getByRole("button", { name: SCORE_DETALJER_KNAP });
    expect(knap.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(knap.getAttribute("aria-controls")!)!;
    expect(panel.hidden).toBe(true);
    expect(container.querySelector("[data-trofaeer-indlejret]")).toBeNull();
    aabnDetaljer();
    expect(knap.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll("[data-soejle-detalje]").length).toBeGreaterThan(0);
    expect(panel.querySelector("[data-trofaeer-indlejret]")).not.toBeNull();
    // Den viste løfter står ikke igen i detaljerne; de øvrige gør.
    const vist = container.querySelector("[data-score-loefter-mest]")!.textContent!;
    const rækker = [...panel.querySelectorAll("[data-loefter-soejle]")].map((r) => r.textContent!);
    expect(rækker).toHaveLength(loefterMitTal(dom).length - 1);
    expect(rækker.every((r) => !vist.includes(r.split("+")[0].trim()))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: SCORE_DETALJER_KNAP_LUK }));
    expect(panel.hidden).toBe(true);
  });

  it("uden score: ringen står med «—», streaken står, «hvad mangler» står i detaljerne", () => {
    const dom = boardroomScore(grundlag([], { kontraktStart: "2026-01-01" }), NU);
    const { container } = forside({ dom });
    expect(container.querySelector("[data-score-ring]")!.textContent).toContain("—");
    expect(container.querySelector("[data-score-bue]")).toBeNull();
    expect(container.querySelector("[data-score-streak]")).not.toBeNull();
    aabnDetaljer();
    expect(container.querySelector("[data-score-note]")!.textContent).toMatch(/Scoren kræver tal/);
  });

  it("tilstandene: henter (forside-skelet, ingen tekst), fejl, afventer", () => {
    const henter = forside({ isLoading: true });
    expect(henter.container.querySelector('[data-score="henter"][data-score-variant="forside"]')).not.toBeNull();
    expect(henter.container.querySelector("[data-skelet-ring]")!.className).toContain("h-[92px]");
    expect(henter.container.textContent).toBe("");
    henter.unmount();
    const fejl = forside({ isError: true });
    expect(fejl.container.querySelector('[data-score="fejl"]')).not.toBeNull();
    fejl.unmount();
    forside({ afventerMigration: true });
    expect(screen.getByText(SCORE_AFVENTER_OVERSKRIFT)).toBeTruthy();
  });

  it("ingen procent og ingen emoji i forside-kortet", () => {
    const { container } = forside({ dom: DOM(), trofaeer: tre, certifikat: { dageTil: 3 } });
    expect(container.textContent).not.toMatch(/%/);
    expect(/\p{Extended_Pictographic}/u.test(container.textContent!)).toBe(false);
  });
});
