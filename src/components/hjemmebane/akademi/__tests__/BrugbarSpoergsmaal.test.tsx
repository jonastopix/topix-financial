/**
 * «Kunne du bruge den?» — rækken under lektionens footer (16/9).
 *
 * Låser: spørgsmålet og de to knapper vises (role=group med spørgsmålet
 * som navn); Ja kalder onSvar(true), Nej kalder onSvar(false); begge
 * knapper er disabled mens gemmer. Komponenten er ren (ingen supabase,
 * ingen useAuth), så kun render og klik — CommunityView.test-formen uden
 * router og QueryClient, som den ikke behøver.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { BrugbarSpoergsmaal } from "../BrugbarSpoergsmaal";

afterEach(cleanup);

describe("BrugbarSpoergsmaal", () => {
  it("viser spørgsmålet og to knapper, Ja og Nej", () => {
    render(<BrugbarSpoergsmaal onSvar={vi.fn()} gemmer={false} />);
    const gruppe = screen.getByRole("group", { name: "Kunne du bruge den?" });
    expect(within(gruppe).getByText("Kunne du bruge den?")).toBeInTheDocument();
    const knapper = within(gruppe).getAllByRole("button");
    expect(knapper.map((k) => k.textContent)).toEqual(["Ja", "Nej"]);
    for (const knap of knapper) expect(knap).toHaveAttribute("type", "button");
  });

  it("Ja kalder onSvar(true) — én gang, intet andet", () => {
    const onSvar = vi.fn();
    render(<BrugbarSpoergsmaal onSvar={onSvar} gemmer={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ja" }));
    expect(onSvar).toHaveBeenCalledTimes(1);
    expect(onSvar).toHaveBeenCalledWith(true);
  });

  it("Nej kalder onSvar(false)", () => {
    const onSvar = vi.fn();
    render(<BrugbarSpoergsmaal onSvar={onSvar} gemmer={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Nej" }));
    expect(onSvar).toHaveBeenCalledTimes(1);
    expect(onSvar).toHaveBeenCalledWith(false);
  });

  it("knapperne er disabled mens gemmer — og et klik kalder ikke onSvar", () => {
    const onSvar = vi.fn();
    render(<BrugbarSpoergsmaal onSvar={onSvar} gemmer={true} />);
    const ja = screen.getByRole("button", { name: "Ja" });
    const nej = screen.getByRole("button", { name: "Nej" });
    expect(ja).toBeDisabled();
    expect(nej).toBeDisabled();
    fireEvent.click(ja);
    fireEvent.click(nej);
    expect(onSvar).not.toHaveBeenCalled();
  });
});
