/**
 * JeresRetning — de tre spørgsmål øverst på Dine mål (Jonas 1/10-2026 22:37).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RETNING_ORD, retningFraHandout } from "@/lib/hjemmebane/maalRetning";
import { JeresRetning, RETNING_FEJL_TEKST, RETNING_GEM, RETNING_IKKE_SKREVET_TEKST, RETNING_INVITATION, RETNING_RET, RETNING_SKREVET_AF_ANDEN, RETNING_TOM_KLADDE_TEKST } from "../JeresRetning";

afterEach(cleanup);

const tom = retningFraHandout(null);
const udfyldt = retningFraHandout({
  id: "h1",
  user_id: "u1",
  module: "overordnet",
  updated_at: "2026-09-01T00:00:00Z",
  responses: { lykkedes_12mdr: "Vi har 2 mio. i årstakt", anderledes_hverdag: "", konsekvenser_ingen_aendring: "Vi må fyre" },
});

describe("JeresRetning — uden retning", () => {
  it("ÉN invitation, der åbner redigeringen med alle tre felter; «Gem» sender de tre svar", async () => {
    const onGem = vi.fn(async () => null);
    render(<JeresRetning retning={tom} isLoading={false} fejlede={false} onGem={onGem} kanRette skrevetAfAnden={false} />);
    expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).toBe("tom");
    expect(screen.queryByText(RETNING_RET)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: RETNING_INVITATION }));
    expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).toBe("redigerer");
    for (const n of ["lykkedes_12mdr", "anderledes_hverdag", "konsekvenser_ingen_aendring"] as const) {
      expect(screen.getByLabelText(RETNING_ORD.spoergsmaal[n])).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText(RETNING_ORD.spoergsmaal.lykkedes_12mdr), { target: { value: "Vi har 2 mio. i årstakt" } });
    fireEvent.click(screen.getByRole("button", { name: RETNING_GEM }));
    await waitFor(() => expect(onGem).toHaveBeenCalledWith({ lykkedes_12mdr: "Vi har 2 mio. i årstakt", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" }));
    await waitFor(() => expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).not.toBe("redigerer"));
  });

  it("en fejl fra skrivningen står i feltet, og redigeringen bliver åben", async () => {
    const onGem = vi.fn(async () => "Kunne ikke gemme retningen — prøv igen");
    render(<JeresRetning retning={tom} isLoading={false} fejlede={false} onGem={onGem} kanRette skrevetAfAnden={false} />);
    fireEvent.click(screen.getByRole("button", { name: RETNING_INVITATION }));
    fireEvent.click(screen.getByRole("button", { name: RETNING_GEM }));
    await screen.findByText("Kunne ikke gemme retningen — prøv igen");
    expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).toBe("redigerer");
  });
});

describe("JeresRetning — udfyldt, henter, fejl", () => {
  it("udfyldt: svarene læsbare med «Ret» diskret; et ubesvaret spørgsmål siger det", () => {
    render(<JeresRetning retning={udfyldt} isLoading={false} fejlede={false} onGem={vi.fn(async () => null)} kanRette skrevetAfAnden={false} />);
    expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).toBe("udfyldt");
    expect(screen.getByText("Vi har 2 mio. i årstakt")).toBeInTheDocument();
    expect(screen.getByText("Ikke svaret endnu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: RETNING_RET }));
    expect((screen.getByLabelText(RETNING_ORD.spoergsmaal.lykkedes_12mdr) as HTMLTextAreaElement).value).toBe("Vi har 2 mio. i årstakt");
  });
  it("henter: et skelet; fejl: en rolig linje", () => {
    const { unmount } = render(<JeresRetning retning={null} isLoading fejlede={false} onGem={vi.fn(async () => null)} kanRette skrevetAfAnden={false} />);
    expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).toBe("henter");
    unmount();
    render(<JeresRetning retning={null} isLoading={false} fejlede onGem={vi.fn(async () => null)} kanRette skrevetAfAnden={false} />);
    expect(screen.getByText(RETNING_FEJL_TEKST)).toBeInTheDocument();
  });
});

describe("JeresRetning — rådets fund 3, 6 og 14", () => {
  it("fund 3: rådgiveren (kanRette false) ser hverken «Ret» eller invitationen — kun teksten", () => {
    const onGem = vi.fn(async () => null);
    const { unmount } = render(<JeresRetning retning={udfyldt} isLoading={false} fejlede={false} onGem={onGem} kanRette={false} skrevetAfAnden />);
    expect(screen.getByText("Vi har 2 mio. i årstakt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RETNING_RET })).toBeNull();
    expect(document.querySelector("[data-retning-skrevet-af-anden]")!.textContent).toContain(RETNING_SKREVET_AF_ANDEN);
    unmount();
    render(<JeresRetning retning={tom} isLoading={false} fejlede={false} onGem={onGem} kanRette={false} skrevetAfAnden={false} />);
    expect(screen.queryByRole("button", { name: RETNING_INVITATION })).toBeNull();
    expect(screen.getByText(RETNING_IKKE_SKREVET_TEKST)).toBeInTheDocument();
    expect(onGem).not.toHaveBeenCalled();
  });
  it("fund 14: egen række viser ikke «Skrevet af en anden»", () => {
    render(<JeresRetning retning={udfyldt} isLoading={false} fejlede={false} onGem={vi.fn(async () => null)} kanRette skrevetAfAnden={false} />);
    expect(document.querySelector("[data-retning-skrevet-af-anden]")).toBeNull();
  });
  it("fund 6: tre tomme svar oven på eksisterende svar gemmes ikke — fejlen står, onGem kaldes ikke", async () => {
    const onGem = vi.fn(async () => null);
    render(<JeresRetning retning={udfyldt} isLoading={false} fejlede={false} onGem={onGem} kanRette skrevetAfAnden={false} />);
    fireEvent.click(screen.getByRole("button", { name: RETNING_RET }));
    for (const n of ["lykkedes_12mdr", "anderledes_hverdag", "konsekvenser_ingen_aendring"] as const) {
      fireEvent.change(screen.getByLabelText(RETNING_ORD.spoergsmaal[n]), { target: { value: "  " } });
    }
    fireEvent.click(screen.getByRole("button", { name: RETNING_GEM }));
    await screen.findByText(RETNING_TOM_KLADDE_TEKST);
    expect(onGem).not.toHaveBeenCalled();
    expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).toBe("redigerer");
  });
});
