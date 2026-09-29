/**
 * /certifikat/forhaandsvisning (29/9-2026): rådgiveren ser den ægte
 * CertificatePage med eksempeldata, kan skifte mellem Låst og Åben, upload
 * giver en besked, og en download logger intet. Skallen og eksporten er
 * mocket (Certifikat.test-mønstret). At et medlem sendes væk, er ruten bag
 * AdvisorRoute — låst i certifikatForhaandsvisning.guard.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getCertificateStatus } from "@/components/hjemmebane/certifikat/format";
import {
  FORHAANDSVISNING_LINJE,
  UPLOAD_SLAAET_FRA,
  forhaandsvisningsStart,
} from "@/lib/certifikat/forhaandsvisning";

vi.mock("@/components/hjemmebane/HbMemberShell", () => ({
  HbMemberShell: ({ children, active }: { children: React.ReactNode; active: string }) => <div data-testid="skal" data-active={active}>{children}</div>,
}));
const eksport = vi.hoisted(() => ({ pdf: vi.fn(async () => undefined), png: vi.fn(async () => undefined) }));
vi.mock("@/components/hjemmebane/certifikat/exportCertificate", () => ({
  downloadCertificatePdf: eksport.pdf,
  downloadCertificatePng: eksport.png,
  renderCertificatePng: vi.fn(),
}));
const hentninger = vi.hoisted(() => ({ skriv: vi.fn(async () => undefined) }));
vi.mock("@/lib/certifikat/hentninger", () => ({ skrivHentning: hentninger.skriv, taelHentninger: vi.fn() }));

import CertifikatForhaandsvisning from "@/pages/CertifikatForhaandsvisning";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("forhaandsvisningsStart — regnet af dagens dato", () => {
  const dage = [
    new Date("2026-09-29T10:00:00Z"),
    new Date("2026-01-31T12:00:00Z"),
    new Date("2026-03-01T12:00:00Z"),
    new Date("2027-02-28T22:30:00Z"),
    new Date("2026-12-31T23:30:00Z"),
  ];
  it("låst giver «locked» med cirka 5 måneder til 12-månedersdatoen", () => {
    for (const nu of dage) {
      const s = getCertificateStatus(forhaandsvisningsStart("laast", nu), true, nu);
      expect(s.state, nu.toISOString()).toBe("locked");
      expect(s.daysUntilUnlock, nu.toISOString()).toBeGreaterThan(130);
      expect(s.daysUntilUnlock, nu.toISOString()).toBeLessThan(160);
    }
  });
  it("åben giver «open» (12-månedersdatoen er passeret)", () => {
    for (const nu of dage) {
      const s = getCertificateStatus(forhaandsvisningsStart("aaben", nu), true, nu);
      expect(s.state, nu.toISOString()).toBe("open");
      expect(s.daysUntilUnlock).toBe(0);
    }
  });
});

describe("/certifikat/forhaandsvisning — siden", () => {
  it("viser linjen, eksempeldata og den åbne side; skifter til låst og tilbage", () => {
    render(<CertifikatForhaandsvisning />);
    expect(screen.getByText(FORHAANDSVISNING_LINJE)).toBeInTheDocument();
    expect(screen.getByTestId("skal").getAttribute("data-active")).toBe("certifikat");
    expect(screen.getByDisplayValue("Anne Sofie Holm")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Holm & Co. ApS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Låst" }));
    expect(screen.getByRole("button", { name: "Låst" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
    expect(screen.getByText(/Dit certifikat er klar om \d+ dage/)).toBeInTheDocument();
    expect(screen.getByText(/^Åbner /)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Åben" }));
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  });

  it("upload giver beskeden og gemmer intet", async () => {
    const { container } = render(<CertifikatForhaandsvisning />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(UPLOAD_SLAAET_FRA));
  });

  it("PDF og PNG virker — og intet logges i certificate_downloads", async () => {
    render(<CertifikatForhaandsvisning />);
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(eksport.pdf).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Hent som billede" }));
    await waitFor(() => expect(eksport.png).toHaveBeenCalledTimes(1));
    expect(hentninger.skriv).not.toHaveBeenCalled();
  });
});
