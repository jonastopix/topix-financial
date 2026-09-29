/**
 * Sendelinjen over skrivefeltet (29/9): tre tilstande, ingen toast, «Prøv igen»
 * kun ved fejl — og den kalder det, den får.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatVideoSendeLinje } from "@/components/ChatVideoSendeLinje";

afterEach(cleanup);

describe("ChatVideoSendeLinje", () => {
  it("null tegner intet", () => {
    const { container } = render(<ChatVideoSendeLinje tilstand={null} onProevIgen={() => undefined} />);
    expect(container.innerHTML).toBe("");
  });
  it("sender: procenten i en rolig status-linje, uden knap", () => {
    render(<ChatVideoSendeLinje tilstand={{ tilstand: "sender", procent: 42 }} onProevIgen={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sender video … 42 %");
    expect(screen.getByRole("status")).toHaveAttribute("data-tilstand", "sender");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("sendt: «Videoen er sendt.» uden knap", () => {
    render(<ChatVideoSendeLinje tilstand={{ tilstand: "sendt" }} onProevIgen={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Videoen er sendt.");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("fejl: beskeden og «Prøv igen», som kalder onProevIgen", () => {
    const igen = vi.fn();
    render(<ChatVideoSendeLinje tilstand={{ tilstand: "fejl", besked: "Videoen kunne ikke uploades. Prøv igen." }} onProevIgen={igen} />);
    expect(screen.getByRole("status")).toHaveTextContent("Videoen kunne ikke uploades. Prøv igen.");
    fireEvent.click(screen.getByRole("button", { name: "Prøv igen" }));
    expect(igen).toHaveBeenCalledTimes(1);
  });
});
