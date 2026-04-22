import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useScrollToHash } from "../useScrollToHash";

function TestPage({ delay }: { delay?: number }) {
  useScrollToHash(delay);
  return (
    <div>
      <div id="upload" data-testid="upload">Upload</div>
      <div id="annual-reports" data-testid="annual-reports">Annual Reports</div>
      <div id="goals" data-testid="goals">Goals</div>
      <div id="forecast" data-testid="forecast">Forecast</div>
    </div>
  );
}

function renderWithHash(hash: string, delay = 0) {
  return render(
    <MemoryRouter initialEntries={[`/test${hash}`]}>
      <TestPage delay={delay} />
    </MemoryRouter>
  );
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
        renderWithHash(hash, 0);

        // Hook uses setTimeout(delay) — flush it.
        vi.runAllTimers();

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "start",
        });

        // Confirm the element that scrolled is the one with the expected id.
        const calledOn = scrollIntoView.mock.instances[0] as HTMLElement;
        expect(calledOn.id).toBe(targetId);
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
      renderWithHash("", 0);
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
      renderWithHash("#does-not-exist", 0);
      expect(() => vi.runAllTimers()).not.toThrow();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });
});
