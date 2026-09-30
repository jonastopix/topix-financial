import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScoreKort } from "../ScoreKort";
import { boardroomScore } from "@/lib/boardroomScore/score";
import { naesteMaaned } from "@/lib/boardroomScore/streak";
import { loefterMitTal } from "@/lib/boardroomScore/loefter";
import type { ScoreGrundlag, ScoreMaaned } from "@/lib/boardroomScore/typer";
import { SCORE_AFVENTER_OVERSKRIFT, SCORE_FEJL_TEKST, SCORE_FORBEHOLD } from "@/lib/hjemmebane/scoreKort";

/* Kortet tegner dommen — de fire tilstande og at handlingerne er motorens. */

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
  it("henter: skelet, ingen tekst om scoren", () => {
    const { container } = tegn({ isLoading: true });
    expect(container.querySelector('[data-score="henter"]')).not.toBeNull();
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
    expect(handlinger.length).toBeGreaterThan(0);
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

  it("uden score: «Ikke nok tal endnu», streaken står stadig", () => {
    const dom = boardroomScore(grundlag([], { kontraktStart: "2026-01-01" }), NU);
    expect(dom.score).toBeNull();
    const { container } = tegn({ dom });
    expect(screen.getByText("Ikke nok tal endnu")).toBeTruthy();
    expect(container.querySelector("[data-score-streak]")).not.toBeNull();
  });

  it("ingen procent i kortets tekst (husets «Din måned»-mønster)", () => {
    const dom = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const { container } = tegn({ dom });
    expect(container.textContent).not.toMatch(/%/);
  });
});
