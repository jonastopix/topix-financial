/**
 * Rejsen — tidslinjen som HTML (rådets fund 11): mærker positioneret med
 * left: x %, prikker runde på alle bredder, listen i ord synlig på mobil.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { tidslinje, type MaalMedTal, type SkridtTilMaal } from "@/lib/hjemmebane/maalTal";
import { REJSEN_ORD } from "@/lib/hjemmebane/dineMaalFlade";
import { Rejsen } from "../Rejsen";

const NU = new Date("2026-10-01T10:00:00Z");
const maal: MaalMedTal = {
  id: "m1", title: "Omsætning på 2 mio. kr.", status: "active", deadline: "2027-01-01", created_at: "2026-04-01T08:00:00Z",
  target_value: 2_000_000, current_value: null, unit: null, art: "tal", maal_noegle: "omsaetning_aarstakt", udgangspunkt: 1_000_000, udgangspunkt_dato: "2026-04-01",
};
const skridt: SkridtTilMaal[] = [{ id: "s1", title: "Ring til kunden", status: "done", due_date: null, maal_id: "m1", closed_at: "2026-07-01T00:00:00Z" }];

afterEach(cleanup);

describe("Rejsen", () => {
  it("ingen SVG: linjen er HTML, et skridt og en frist står som mærker med left i procent, og listen i ord er synlig (sr-only først fra sm)", () => {
    render(<Rejsen tidslinje={tidslinje([maal], skridt, "2026-04-01", NU)} />);
    expect(document.querySelector("svg")).toBeNull();
    expect(document.querySelector("[data-rejsen]")!.getAttribute("data-rejsen")).toBe("punkter");
    expect(screen.getByRole("img", { name: REJSEN_ORD.titel })).toBeInTheDocument();
    const skridtMaerke = document.querySelector('[data-rejsen-maerke="skridt"]') as HTMLElement;
    // 1/7 ligger 91 dage efter 1/4 af 365 → 24,9 %
    expect(skridtMaerke.style.left).toBe("24.93150684931507%");
    expect(skridtMaerke.querySelector(".rounded-full")).not.toBeNull();
    const fristMaerke = document.querySelector('[data-rejsen-maerke="frist"]') as HTMLElement;
    // 1/1-2027 ligger 275 dage efter 1/4 → 75,3 %
    expect(fristMaerke.style.left).toBe("75.34246575342466%");
    const liste = document.querySelector("[data-rejsen-liste]")!;
    expect(liste.className).toContain("sm:sr-only");
    expect(liste.className.split(" ")).not.toContain("sr-only");
    expect(liste.textContent).toContain("skridt gjort — Ring til kunden");
    expect(liste.textContent).toContain("måls frist — Omsætning på 2 mio. kr.");
    expect(document.querySelector("[data-rejsen-idag]")!.textContent).toBe(REJSEN_ORD.idag);
  });

  it("tom: teksten, ingen mærker", () => {
    render(<Rejsen tidslinje={tidslinje([], [], "2026-04-01", NU)} />);
    expect(document.querySelector("[data-rejsen]")!.getAttribute("data-rejsen")).toBe("tom");
    expect(screen.getByText(REJSEN_ORD.tom)).toBeInTheDocument();
    expect(document.querySelector("[data-rejsen-maerke]")).toBeNull();
  });
});
