/**
 * Siden «Dit certifikat» (åben + låst tilstand) — pakkens CertificatePage
 * (~/Downloads/boardroom-certifikat, 29/9-2026) sat i Hjemmebanes udtryk:
 * HbField/HbInput, HbButton, HbCard og hb-tokens i stedet for pakkens hex.
 * Ren præsentation: al data og alle handlinger kommer ind som props
 * (src/pages/Certifikat.tsx kobler useCertificate på).
 *
 * Certifikatet selv (Certificate.tsx, designs/, parts.tsx, certificate.css) er
 * pakkens og låst af certifikat.guard.test.ts — kun SIDEN omkring er husets.
 *
 * Rettet navn og virksomhed ændrer KUN certifikatet — aldrig profilen (samme
 * regel som «Fortæl det videre»). Eksporten tager billedet af den skjulte
 * fuldstørrelses-node (1123 x 794), aldrig af det nedskalerede preview
 * (HANDOFF §8) — noden må ikke være display:none.
 *
 * Ingen tankestreger i fladens tekster (husets regel); periodens «–» på
 * certifikatet er pakkens format og hører til certifikatet, ikke fladen.
 */
import React, { useRef, useState } from "react";
import { Lock, Upload } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbField, HbInput } from "@/components/hjemmebane/admin/HbField";
import { cn } from "@/lib/utils";
import { Certificate, CertificatePreview } from "./Certificate";
import { DESIGNS } from "./designs";
import { certificateFileName, formatDay, type CertificateStatus } from "./format";
import { downloadCertificatePdf, downloadCertificatePng } from "./exportCertificate";
import type { CertificateAssets, DesignId } from "./types";

export interface CertificatePageProps {
  status: CertificateStatus;
  /** Startværdier. Navn og virksomhed kan rettes på siden; det ændrer kun certifikatet, ikke profilen. */
  initialName: string;
  initialCompany: string;
  /** Portræt: profilbillede som standard, eller det medlemmet har uploadet til certifikatet. */
  portraitUrl: string | null;
  /** Kaster med en dansk besked, når filen afvises (type, størrelse) eller uploaden fejler. */
  onPortraitUpload: (file: File) => Promise<void>;
  /** Kaldes efter en vellykket download (logning, «Ny»-mærket). */
  onDownloaded?: (design: DesignId, format: "pdf" | "png") => void;
  assets?: Partial<CertificateAssets>;
}

export const TEKST = {
  eyebrow: "Certifikat",
  titel: "Dit certifikat",
  aabenUnder: "Tillykke med dine 12 måneder i The Boardroom. Vælg et design, tjek dine oplysninger, og hent dit certifikat.",
  laastUnder: "Et bevis på dit medlemskab af The Boardroom med dit navn, din virksomhed og din periode.",
  hentPng: "Hent som billede",
  hentPdf: "Download PDF",
  laverPng: "Laver billede …",
  laverPdf: "Laver PDF …",
  kraeverPortraet: "Upload et portræt for at bruge dette design.",
  klarTilPrint: "A4 liggende, klar til print",
  vaelgDesign: "Vælg design",
  vaelgDesignUnder: "Fem designs. Dit navn, din virksomhed og din periode sættes ind automatisk.",
  eksportFejl: "Certifikatet kunne ikke laves. Prøv igen om lidt.",
  uploadFejl: "Portrættet kunne ikke uploades. Prøv igen om lidt.",
} as const;

export function CertificatePage(props: CertificatePageProps) {
  return props.status.state === "open" ? <OpenView {...props} /> : <LockedView status={props.status} assets={props.assets} />;
}

function Header({ sub }: { sub: string }) {
  return (
    <header>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">{TEKST.eyebrow}</p>
      <h1 className="mt-1.5 font-brand text-2xl font-semibold text-hb-ink">{TEKST.titel}</h1>
      <p className="mt-1.5 text-sm text-hb-ink-soft">{sub}</p>
    </header>
  );
}

/* ---------------------------- ÅBEN ---------------------------- */

function OpenView({ status, initialName, initialCompany, portraitUrl, onPortraitUpload, onDownloaded, assets }: CertificatePageProps) {
  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState(initialCompany);
  const [showCompany, setShowCompany] = useState(true);
  const [design, setDesign] = useState<DesignId>("mork-klassiker");
  const [busy, setBusy] = useState<null | "pdf" | "png">(null);
  const [uploading, setUploading] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const data = {
    memberName: name.trim() || initialName,
    companyName: showCompany ? company.trim() : "",
    period: status.period,
    portraitUrl,
  };
  const selected = DESIGNS.find((d) => d.id === design)!;
  const blocked = selected.requiresPortrait && !portraitUrl;

  async function download(format: "pdf" | "png") {
    const node = stageRef.current?.firstElementChild as HTMLElement | null;
    if (!node || blocked) return;
    setBusy(format);
    setFejl(null);
    try {
      const base = certificateFileName(data.memberName);
      if (format === "pdf") await downloadCertificatePdf(node, base);
      else await downloadCertificatePng(node, base);
      onDownloaded?.(design, format);
    } catch (e) {
      console.warn("[CertificatePage] eksporten fejlede:", e instanceof Error ? e.message : e);
      setFejl(TEKST.eksportFejl);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col text-hb-ink">
      <Header sub={TEKST.aabenUnder} />

      <div className="mt-5 flex items-center gap-3 rounded-hb bg-hb-sage px-[18px] py-3.5 text-sm text-hb-ink">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
        <span>
          Dit medlemskab runder 12 måneder den <strong>{formatDay(status.twelveMonthDate)}</strong>. Derfor er dit certifikat klar nu.
        </span>
      </div>

      <div className="mt-7 flex flex-col items-start gap-8 lg:flex-row lg:gap-10">
        {/* Formular */}
        <form className="flex w-full shrink-0 flex-col gap-[18px] lg:w-[340px]" onSubmit={(e) => e.preventDefault()}>
          <HbField label="Navn" htmlFor="crt-name">
            <HbInput id="crt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </HbField>
          <HbField label="Virksomhed" htmlFor="crt-company">
            <HbInput id="crt-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={60} disabled={!showCompany} className="disabled:opacity-60" />
          </HbField>
          <HbField label="Periode" htmlFor="crt-period" help="Hentes automatisk fra dit medlemskab.">
            <HbInput id="crt-period" value={capitalize(status.period)} readOnly className="cursor-default bg-hb-paper text-hb-ink-soft" />
          </HbField>

          <div className="flex flex-col gap-2">
            <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Portræt</span>
            <div className="flex items-center gap-3">
              {portraitUrl ? (
                <img src={portraitUrl} alt="Dit portræt" className="h-14 w-14 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-hb-paper text-xs text-hb-ink-soft">Intet</div>
              )}
              <label htmlFor="crt-portrait" className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-hb border border-dashed border-hb-ink/40 bg-hb-surface px-3.5 py-3 transition-colors hover:bg-hb-sage/30">
                <Upload className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-[13px] font-semibold">{uploading ? "Uploader …" : portraitUrl ? "Erstat portræt" : "Upload portræt"}</span>
                  <span className="block text-xs text-hb-ink-soft">jpg, png, webp. Højst 2 MB.</span>
                </span>
              </label>
              <input
                id="crt-portrait"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  setFejl(null);
                  try {
                    await onPortraitUpload(f);
                  } catch (err) {
                    setFejl(err instanceof Error && err.message ? err.message : TEKST.uploadFejl);
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </div>
            <span className="text-xs text-hb-ink-soft">Bruges kun på designs med portræt. Din profil ændres ikke.</span>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={showCompany} onChange={(e) => setShowCompany(e.target.checked)} className="h-[18px] w-[18px] accent-hb-evergreen" />
            Vis virksomhedsnavn på certifikatet
          </label>

          {fejl ? (
            <p role="alert" className="text-sm text-hb-rust">
              {fejl}
            </p>
          ) : null}
        </form>

        {/* Stort preview + download */}
        <HbCard className="w-full min-w-0 flex-1 p-5">
          <div className="overflow-hidden rounded-md">
            <CertificatePreview width={660} design={design} data={data} assets={assets} />
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">{selected.label}</div>
              <div className="text-xs text-hb-ink-soft">{blocked ? TEKST.kraeverPortraet : TEKST.klarTilPrint}</div>
            </div>
            <div className="flex gap-2.5">
              <HbButton type="button" variant="secondary" onClick={() => download("png")} disabled={!!busy || blocked}>
                {busy === "png" ? TEKST.laverPng : TEKST.hentPng}
              </HbButton>
              <HbButton type="button" variant="primary" onClick={() => download("pdf")} disabled={!!busy || blocked}>
                {busy === "pdf" ? TEKST.laverPdf : TEKST.hentPdf}
              </HbButton>
            </div>
          </div>
        </HbCard>
      </div>

      {/* Vælg design */}
      <h2 className="mt-9 font-brand text-lg font-semibold">{TEKST.vaelgDesign}</h2>
      <p className="mt-1 text-[13px] text-hb-ink-soft">{TEKST.vaelgDesignUnder}</p>
      <div className="mt-3.5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {DESIGNS.map((d) => {
          const active = d.id === design;
          const needsPortrait = d.requiresPortrait && !portraitUrl;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={active}
              disabled={needsPortrait}
              onClick={() => setDesign(d.id)}
              className={cn(
                "rounded-hb border-2 bg-hb-surface p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active ? "border-hb-evergreen" : "border-hb-line hover:border-hb-ink/40",
              )}
            >
              <div className="overflow-hidden rounded">
                <CertificatePreview width={185} design={d.id} data={data} assets={assets} />
              </div>
              <div className="mt-2 text-[13px] font-semibold">{d.label}</div>
              <div className="text-xs text-hb-ink-soft">{needsPortrait ? "Kræver portræt" : d.subtitle}</div>
            </button>
          );
        })}
      </div>

      {/* Skjult fuldstørrelses-stage til eksport. Må ikke være display:none. */}
      <div aria-hidden="true" style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
        <div ref={stageRef}>
          <Certificate design={design} data={data} assets={assets} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- LÅST ---------------------------- */

function LockedView({ status, assets }: { status: CertificateStatus; assets?: Partial<CertificateAssets> }) {
  const pct = Math.round(status.progress * 100);
  return (
    <div className="flex flex-col text-hb-ink">
      <Header sub={TEKST.laastUnder} />
      <HbCard className="mt-10 flex flex-col items-center gap-8 p-6 lg:flex-row lg:gap-12 lg:p-10">
        <div className="relative w-full max-w-[440px] shrink-0 overflow-hidden rounded-lg">
          <div className="opacity-35 blur-[3px]">
            <CertificatePreview width={440} design="legat-segl" data={{ memberName: "Dit navn", companyName: "Din virksomhed", period: status.period }} assets={assets} />
          </div>
          <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-hb-evergreen">
            <Lock className="h-8 w-8 text-hb-sage" aria-hidden="true" />
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Åbner {formatDay(status.unlockDate)}</p>
          <h2 className="mt-2 font-brand text-[26px] font-semibold leading-tight">
            Dit certifikat er klar om {status.daysUntilUnlock} {status.daysUntilUnlock === 1 ? "dag" : "dage"}
          </h2>
          <p className="mt-3 max-w-[460px] text-[15px] leading-[1.55]">
            Når du nærmer dig 12 måneder i The Boardroom, kan du selv vælge design og hente dit certifikat her. Området åbner automatisk 7 dage før.
          </p>
          <div className="mt-7 max-w-[420px]">
            <div className="flex justify-between text-[13px]">
              <span className="font-semibold">Måned {status.currentMonth} af 12</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-hb-paper" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-full bg-hb-evergreen" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </HbCard>
    </div>
  );
}

/* ---------------------------- småting ---------------------------- */

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
