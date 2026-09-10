/**
 * Estimat-mærket kan trykkes (10/9, kort #64): forklaringen åbner ved
 * klik/tryk — ikke kun ved hover via title — og trykfladen er udvidet til
 * mindst 44 × 44 punkter uden at pillen vokser i linjen.
 */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ESTIMAT_FORKLARING, EstimatMaerke } from "../EstimatMaerke";

afterEach(cleanup);

describe("EstimatMaerke — forklaringen åbner ved tryk", () => {
  it("pillen er en knap med popover-semantik og bærer stadig title til musen", () => {
    render(<EstimatMaerke />);
    const knap = screen.getByRole("button", { name: /Estimat — vis forklaring/ });
    expect(knap).toHaveAttribute("aria-haspopup", "dialog");
    expect(knap).toHaveAttribute("aria-expanded", "false");
    expect(knap).toHaveAttribute("title", ESTIMAT_FORKLARING);
    expect(knap.textContent).toBe("Estimat");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tryk åbner forklaringen; tryk igen lukker", () => {
    render(<EstimatMaerke />);
    const knap = screen.getByRole("button");
    fireEvent.click(knap);
    expect(screen.getByRole("dialog")).toHaveTextContent(ESTIMAT_FORKLARING);
    expect(knap).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(knap);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape lukker og giver fokus tilbage til mærket", () => {
    render(<EstimatMaerke />);
    const knap = screen.getByRole("button");
    fireEvent.click(knap);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(knap);
  });

  it("den kompakte variant («est.») er den samme knap", () => {
    render(<EstimatMaerke kompakt />);
    const knap = screen.getByRole("button", { name: /Estimat — vis forklaring/ });
    expect(knap.textContent).toBe("est.");
    fireEvent.click(knap);
    expect(screen.getByRole("dialog")).toHaveTextContent(ESTIMAT_FORKLARING);
  });

  it("trykfladen er udvidet 11 px rundt om (≥ 44 × 44) og mobilpanelet ligger fast i bunden", () => {
    render(<EstimatMaerke kompakt />);
    const knap = screen.getByRole("button");
    expect(knap.className).toMatch(/before:inset-\[-11px\]/);
    expect(knap.className).toMatch(/touch-manipulation/);
    fireEvent.click(knap);
    const panel = screen.getByRole("dialog");
    expect(panel.className).toMatch(/\bfixed\b/);
    expect(panel.className).toMatch(/inset-x-4/);
    expect(panel.className).toMatch(/sm:absolute/);
  });

  it("står gyldigt inde i et <p>: wrapper og panel er <span>, ikke <div>", () => {
    const { container } = render(<p><EstimatMaerke /></p>);
    expect(container.querySelector("p div")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelector("p div")).toBeNull();
    expect(screen.getByRole("dialog").tagName).toBe("SPAN");
  });
});
