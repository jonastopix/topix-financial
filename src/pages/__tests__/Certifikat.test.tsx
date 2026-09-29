/**
 * /certifikat — siden (29/9-2026, trin 1): skjult → forsiden (også ved direkte
 * URL), fejl → en linje (ikke en redirect), åben → siden med HANDOFF §11's
 * tekster, låst → «Åbner 15. oktober 2026» og «klar om 16 dage». En download
 * kalder onDownloaded med (design, format) — det er rækken i certificate_downloads.
 *
 * jsdom tegner ikke: eksporten (html-to-image + jsPDF) er mocket. Skallen er
 * mocket til en ramme (den kræver useAuth, klokke, events), og hooken gives
 * ind som et objekt, prøven selv sætter.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Certifikat as CertifikatHook } from "@/hooks/useCertificate";
import { getCertificateStatus } from "@/components/hjemmebane/certifikat/format";

const hook = vi.hoisted(() => ({ vaerdi: null as unknown }));
vi.mock("@/hooks/useCertificate", () => ({ useCertificate: () => hook.vaerdi }));
vi.mock("@/components/hjemmebane/HbMemberShell", () => ({
  HbMemberShell: ({ children, active }: { children: React.ReactNode; active: string }) => <div data-testid="skal" data-active={active}>{children}</div>,
}));
const eksport = vi.hoisted(() => ({ pdf: vi.fn(async () => undefined), png: vi.fn(async () => undefined) }));
vi.mock("@/components/hjemmebane/certifikat/exportCertificate", () => ({
  downloadCertificatePdf: eksport.pdf,
  downloadCertificatePng: eksport.png,
  renderCertificatePng: vi.fn(),
}));

import Certifikat from "@/pages/Certifikat";
import { CertificatePage } from "@/components/hjemmebane/certifikat/CertificatePage";

const NU = new Date("2026-09-29T10:00:00Z");
const AABEN = getCertificateStatus(new Date(2025, 9, 6), true, NU);
const LAAST = getCertificateStatus(new Date(2025, 9, 22), true, NU);

function hookVaerdi(over: Partial<CertifikatHook>): CertifikatHook {
  return {
    loading: false,
    fejl: null,
    dom: { synlig: true, status: AABEN },
    menu: "ny",
    navn: "Anne Sofie Holm",
    virksomhed: "Holm Consulting ApS",
    portraetUrl: null,
    uploadPortraet: vi.fn(async () => undefined),
    logHentning: vi.fn(async () => undefined),
    ...over,
  };
}

const tegn = () =>
  render(
    <MemoryRouter initialEntries={["/certifikat"]}>
      <Routes>
        <Route path="/certifikat" element={<Certifikat />} />
        <Route path="/" element={<div>forsiden</div>} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/certifikat — hvem ser hvad", () => {
  it("skjult (ikke berettiget) → forsiden, også ved direkte URL", () => {
    hook.vaerdi = hookVaerdi({ dom: { synlig: false, grund: "ikke_berettiget" }, menu: null });
    tegn();
    expect(screen.getByText("forsiden")).toBeInTheDocument();
    expect(screen.queryByText("Dit certifikat")).toBeNull();
  });
  it("skjult (rådgiver, ikke fuldt medlem, ingen startdato) → forsiden", () => {
    for (const grund of ["raadgiver", "ikke_fuldt_medlem", "ingen_startdato", "ugyldig_startdato"] as const) {
      hook.vaerdi = hookVaerdi({ dom: { synlig: false, grund }, menu: null });
      tegn();
      expect(screen.getByText("forsiden")).toBeInTheDocument();
      cleanup();
    }
  });
  it("en FEJL i opslaget er ikke et nej: en linje i skallen, ingen redirect", () => {
    hook.vaerdi = hookVaerdi({ fejl: "42703", dom: { synlig: false, grund: "ikke_berettiget" }, menu: null });
    tegn();
    expect(screen.getByRole("alert")).toHaveTextContent("Certifikatet kunne ikke hentes lige nu.");
    expect(screen.queryByText("forsiden")).toBeNull();
    expect(screen.getByTestId("skal")).toHaveAttribute("data-active", "certifikat");
  });
  it("loading → skallen uden indhold og uden redirect", () => {
    hook.vaerdi = hookVaerdi({ loading: true, dom: { synlig: false, grund: "ikke_berettiget" } });
    tegn();
    expect(screen.queryByText("forsiden")).toBeNull();
    expect(screen.getByTestId("skal")).toBeInTheDocument();
  });
  it("åben → siden i skallen med navn og virksomhed i felterne, og perioden fra medlemskabet", () => {
    hook.vaerdi = hookVaerdi({});
    tegn();
    expect(screen.getByRole("heading", { level: 1, name: "Dit certifikat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Navn")).toHaveValue("Anne Sofie Holm");
    expect(screen.getByLabelText("Virksomhed")).toHaveValue("Holm Consulting ApS");
    expect(screen.getByLabelText("Periode")).toHaveValue("Oktober 2025 – oktober 2026");
    expect(screen.getByText(/runder 12 måneder den/)).toHaveTextContent("6. oktober 2026");
  });
});

describe("/certifikat — låst (HANDOFF §11: start 22.10.2025 set 29.9.2026)", () => {
  it("«Åbner 15. oktober 2026», «klar om 16 dage», måned 12 af 12 — og ingen download-knap", () => {
    hook.vaerdi = hookVaerdi({ dom: { synlig: true, status: LAAST }, menu: "laast" });
    tegn();
    expect(screen.getByText("Åbner 15. oktober 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Dit certifikat er klar om 16 dage");
    expect(screen.getByText("Måned 12 af 12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  });
  it("én dag før: «dag», ikke «dage»", () => {
    const status = getCertificateStatus(new Date(2025, 9, 22), true, new Date("2026-10-14T10:00:00Z"));
    render(<CertificatePage status={status} initialName="A" initialCompany="B" portraitUrl={null} onPortraitUpload={async () => undefined} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Dit certifikat er klar om 1 dag");
  });
});

describe("/certifikat — download logger rækken", () => {
  it("«Download PDF» → eksporten kaldes med den skjulte fuldstørrelses-node, og onDownloaded får (design, format)", async () => {
    const logHentning = vi.fn(async () => undefined);
    hook.vaerdi = hookVaerdi({ logHentning });
    tegn();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(logHentning).toHaveBeenCalledWith("mork-klassiker", "pdf"));
    expect(eksport.pdf).toHaveBeenCalledTimes(1);
    const [node, filnavn] = eksport.pdf.mock.calls[0] as unknown as [HTMLElement, string];
    expect(node.className).toContain("crt");
    expect(filnavn).toBe("the-boardroom-certifikat-anne-sofie-holm");
  });
  it("«Hent som billede» → png, og et rettet navn står i filnavnet, ikke i profilen", async () => {
    const logHentning = vi.fn(async () => undefined);
    hook.vaerdi = hookVaerdi({ logHentning });
    tegn();
    fireEvent.change(screen.getByLabelText("Navn"), { target: { value: "Mette Ørsted Ågaard" } });
    fireEvent.click(screen.getByRole("button", { name: "Hent som billede" }));
    await waitFor(() => expect(logHentning).toHaveBeenCalledWith("mork-klassiker", "png"));
    expect((eksport.png.mock.calls[0] as unknown as [HTMLElement, string])[1]).toBe("the-boardroom-certifikat-mette-oersted-aagaard");
  });
  it("fejler eksporten, logges intet, og fladen siger det", async () => {
    eksport.pdf.mockRejectedValueOnce(new Error("canvas"));
    const logHentning = vi.fn(async () => undefined);
    hook.vaerdi = hookVaerdi({ logHentning });
    tegn();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Certifikatet kunne ikke laves."));
    expect(logHentning).not.toHaveBeenCalled();
  });
  it("uden portræt er de tre portræt-designs slået fra, og den valgte kan hentes", () => {
    hook.vaerdi = hookVaerdi({ portraetUrl: null });
    tegn();
    for (const navn of [/Med rådgiverne · mørk/, /Med rådgiverne · lys/, /Dit portræt/]) expect(screen.getByRole("button", { name: navn })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Mørk klassiker/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });
});
