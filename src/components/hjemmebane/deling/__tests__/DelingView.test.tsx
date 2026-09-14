/**
 * DelingView — overblik og fuldskærm (14/9): galleriet viser ét kort per
 * post i KREATIVER, klik åbner fuldskærmen (role="dialog") med samme titel,
 * pilene er spærret i enderne, og «Tilbage til overblikket» og Escape
 * lukker. jsdom har ingen ResizeObserver og ingen layout, så skalaen er 0
 * her — testen ser på struktur, ikke på px.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DelingView } from "../DelingView";
import { KREATIVER } from "../kreativer";

afterEach(cleanup);

describe("DelingView — galleri og fuldskærm", () => {
  it("viser ét kort per post i KREATIVER, og ingen dialog", () => {
    render(<DelingView />);
    const liste = screen.getByRole("list", { name: "Kreativer" });
    expect(liste.querySelectorAll("li")).toHaveLength(KREATIVER.length);
    for (const post of KREATIVER) {
      expect(screen.getByRole("button", { name: `Vis stor: ${post.titel}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("klik på kortet åbner fuldskærmen med titlen; første og sidste pil er spærret når der kun er én", () => {
    render(<DelingView />);
    fireEvent.click(screen.getByRole("button", { name: `Vis stor: ${KREATIVER[0].titel}` }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { level: 2, name: KREATIVER[0].titel })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(`1 af ${KREATIVER.length}`);
    expect(screen.getByRole("button", { name: "Forrige kreativ" })).toBeDisabled();
    if (KREATIVER.length === 1) expect(screen.getByRole("button", { name: "Næste kreativ" })).toBeDisabled();
  });

  it("«Tilbage til overblikket» lukker, og Escape lukker", () => {
    render(<DelingView />);
    const aabn = screen.getByRole("button", { name: `Vis stor: ${KREATIVER[0].titel}` });
    fireEvent.click(aabn);
    fireEvent.click(screen.getByRole("button", { name: /Tilbage til overblikket/ }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(aabn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hver post i KREATIVER har unik id og en komponent", () => {
    const ids = KREATIVER.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of KREATIVER) expect(typeof p.komponent).toBe("function");
  });
});
