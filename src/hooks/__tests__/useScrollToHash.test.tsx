import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useScrollToHash } from "../useScrollToHash";

function TestPage() {
  useScrollToHash();
  return (
    <div>
      <div id="upload" data-testid="upload">Upload</div>
      <div id="annual-reports" data-testid="annual-reports">Annual Reports</div>
      <div id="goals" data-testid="goals">Goals</div>
      <div id="forecast" data-testid="forecast">Forecast</div>
    </div>
  );
}

function renderWithHash(hash: string) {
  return render(
    <MemoryRouter initialEntries={[`/test${hash}`]}>
      <TestPage />
    </MemoryRouter>
  );
}

/** Side uden ankre — bruges til kold-load-scenariet, hvor målet først
    dukker op i DOM efter datahentning. */
function EmptyPage() {
  useScrollToHash();
  return <div />;
}

describe("useScrollToHash → documented Guide anchors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const cases: { route: string; hash: string; targetId: string }[] = [
    { route: "/reports", hash: "#upload", targetId: "upload" },
    { route: "/reports", hash: "#annual-reports", targetId: "annual-reports" },
    { route: "/kpis", hash: "#goals", targetId: "goals" },
    { route: "/budget", hash: "#forecast", targetId: "forecast" },
  ];

  for (const { route, hash, targetId } of cases) {
    it(`scrolls to #${targetId} when navigating to ${route}${hash}`, () => {
      const scrollIntoView = vi.fn();
      // Patch prototype so the element rendered by JSX uses the mock.
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = scrollIntoView;

      try {
        renderWithHash(hash);

        // Straksforsøget rammer allerede-renderede ankre uden timere —
        // ingen pending timers må være nødvendige.
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "start",
        });

        // Confirm the element that scrolled is the one with the expected id.
        const calledOn = scrollIntoView.mock.instances[0] as HTMLElement;
        expect(calledOn.id).toBe(targetId);

        // Polling må ikke fortsætte (og dobbelt-scrolle) efter fund.
        vi.runAllTimers();
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      } finally {
        HTMLElement.prototype.scrollIntoView = original;
      }
    });
  }

  it("does not scroll when no hash is present", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      renderWithHash("");
      vi.runAllTimers();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("does not throw when target id does not exist", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      renderWithHash("#does-not-exist");
      // Polling stopper selv ved 6 s-loftet — runAllTimers må terminere.
      expect(() => vi.runAllTimers()).not.toThrow();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("scrolls to an element that first appears in the DOM after ~1 s (cold load)", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const late = document.createElement("div");
    late.id = "goals";

    try {
      render(
        <MemoryRouter initialEntries={["/test#goals"]}>
          <EmptyPage />
        </MemoryRouter>
      );

      // Endnu intet mål i DOM — hverken straksforsøg eller polling må ramme.
      vi.advanceTimersByTime(900);
      expect(scrollIntoView).not.toHaveBeenCalled();

      // "Datahentningen" lander — ankeret renderes ind i dokumentet.
      document.body.appendChild(late);
      vi.advanceTimersByTime(300);

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      const calledOn = scrollIntoView.mock.instances[0] as HTMLElement;
      expect(calledOn.id).toBe("goals");

      // Efter fund er intervallet stoppet — ingen yderligere scrolls.
      vi.runAllTimers();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
      late.remove();
    }
  });
});
