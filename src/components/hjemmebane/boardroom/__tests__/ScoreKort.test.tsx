import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScoreKort } from "../ScoreKort";
import { boardroomScore } from "@/lib/boardroomScore/score";
import { naesteMaaned } from "@/lib/boardroomScore/streak";
import { loefterMitTal } from "@/lib/boardroomScore/loefter";
import type { ScoreGrundlag, ScoreMaaned } from "@/lib/boardroomScore/typer";
import {
  EFFEKT_FOERSTE_SCORE,
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
    expect(container.querySelector("[data-score-daekning-tekst]")!.textContent).toBe("Bygget på 2 af 4 søjler");
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
