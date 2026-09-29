import React, { useId } from "react";
import type { CertificateAssets } from "./types";

export const DEFAULT_ASSETS: CertificateAssets = {
  signatureJonasLight: "/certificates/signatures/jonas-herlev-light.svg",
  signatureJonasDark: "/certificates/signatures/jonas-herlev-dark.svg",
  signatureMortenLight: "/certificates/signatures/morten-larsen-light.svg",
  signatureMortenDark: "/certificates/signatures/morten-larsen-dark.svg",
  // Husets rådgiverfotos — de samme, «Fortæl det videre» bruger (src/lib/delingskreativ.ts RAADGIVERE).
  // Målt 29/9-2026: jonas-hi.png 1044 x 1044, morten-hi.png 728 x 728 — rigelige til 3x-eksporten.
  advisorPhotoJonas: "/jonas-hi.png",
  advisorPhotoMorten: "/morten-hi.png",
};

export function useAssets(partial?: Partial<CertificateAssets>): CertificateAssets {
  return { ...DEFAULT_ASSETS, ...(partial ?? {}) };
}

/** Navnelængde -> størrelsestrin. Sættes som data-len på .crt-name. */
export function nameLen(name: string): "s" | "m" | "l" {
  const n = name.trim().length;
  if (n <= 22) return "s";
  if (n <= 30) return "m";
  return "l";
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

/* ---------- Logo-lockup: topix | THE BOARDROOM ----------
 * Huset har ingen topix-SVG (recon-certifikat.md §4), og public/topix-navy.png og
 * topix-shell.png er 260 x 90 px (målt 29/9-2026) — under de 108 px, en 3x-eksport
 * af det store lockup kræver. Derfor bliver pakkens tegning. Størrelsen styres af
 * .crt-lockup--lg / --sm.
 */
export function Lockup({ size, tone }: { size: "lg" | "sm"; tone: "dark" | "light" }) {
  const bubble = tone === "dark" ? "#ffffff" : "#133332";
  const cross = tone === "dark" ? "#133332" : "#e9e9e7";
  const px = size === "lg" ? 36 : 28;
  return (
    <div className={`crt-lockup crt-lockup--${size}`}>
      <div className="crt-topix" aria-label="topix">
        <span>topi</span>
        <svg width={px} height={px} viewBox="0 0 44 44" aria-hidden="true">
          <path d="M22 3 a19 18 0 1 1 -9 34 l-8 5 l3 -9 A19 18 0 0 1 22 3 z" fill={bubble} />
          <path d="M15 13 L29 27 M29 13 L15 27" stroke={cross} strokeWidth={5.5} strokeLinecap="round" />
        </svg>
      </div>
      <span className="crt-lockup-divider" />
      <span className="crt-boardroom">THE BOARDROOM</span>
    </div>
  );
}

export function Signature({
  src,
  name,
  title = "Co-founder & Rådgiver",
  align = "left",
  width,
}: {
  src: string;
  name: string;
  title?: string;
  align?: "left" | "right" | "center";
  width?: number;
}) {
  return (
    <div className={`crt-sig crt-sig--${align}`} style={width ? { width } : undefined}>
      <img className="crt-sig-img" src={src} alt="" crossOrigin="anonymous" />
      <div className="crt-sig-line" />
      <div className="crt-sig-name">{name}</div>
      <div className="crt-sig-title">{title}</div>
    </div>
  );
}

/** Portræt i cirkel. Uden url vises initialer (bruges kun som nødløsning). */
export function Photo({ url, name, size, ring = false }: { url?: string | null; name: string; size: number; ring?: boolean }) {
  const inner = url ? (
    <img className="crt-photo" src={url} alt="" crossOrigin="anonymous" />
  ) : (
    <div className="crt-photo-initials" style={{ fontSize: Math.round(size * 0.32) }}>
      {initials(name)}
    </div>
  );
  if (!ring) return <div style={{ width: size, height: size }}>{inner}</div>;
  return (
    <div className="crt-ring" style={{ width: size, height: size }}>
      {inner}
    </div>
  );
}

type SealVariant = "solid-ocean" | "outline";

/** Rundt segl med "12 måneder". viewBox 150 x 150, skaleres via size. */
export function Seal({ size, variant, text = "THE BOARDROOM · MEDLEMSBEVIS · 12 MÅNEDER ·" }: { size: number; variant: SealVariant; text?: string }) {
  const id = `crt-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (variant === "outline") {
    return (
      <svg width={size} height={size} viewBox="0 0 150 150" role="img" aria-label="Segl: The Boardroom, 12 måneder">
        <defs>
          <path id={id} d="M75 75 m-57 0 a57 57 0 1 1 114 0 a57 57 0 1 1 -114 0" />
        </defs>
        <circle cx="75" cy="75" r="73" fill="none" stroke="#a3d9c4" strokeWidth="0.7" />
        <circle cx="75" cy="75" r="65" fill="none" stroke="#a3d9c4" strokeWidth="0.4" />
        <circle cx="75" cy="75" r="44" fill="#a3d9c4" />
        <text fontFamily="Manrope, sans-serif" fontSize="8.2" fontWeight="600" fill="#e9e9e7">
          <textPath href={`#${id}`} textLength={358} lengthAdjust="spacing">THE BOARDROOM · MEDLEMSBEVIS · 12 MÅNEDER ·</textPath>
        </text>
        <text x="75" y="84" textAnchor="middle" fontFamily="Gilda Display, Georgia, serif" fontSize="36" fill="#133332">12</text>
        <text x="75" y="99" textAnchor="middle" fontFamily="Manrope, sans-serif" fontSize="6.5" fontWeight="700" letterSpacing="1.6" fill="#133332">MÅNEDER</text>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" role="img" aria-label="Segl: The Boardroom, 12 måneder">
      <defs>
        <path id={id} d="M75 75 m-55 0 a55 55 0 1 1 110 0 a55 55 0 1 1 -110 0" />
      </defs>
      <circle cx="75" cy="75" r="75" fill="#133332" />
      <circle cx="75" cy="75" r="71" fill="#a3d9c4" />
      <circle cx="75" cy="75" r="65" fill="none" stroke="#133332" strokeWidth="1" />
      <circle cx="75" cy="75" r="42" fill="#133332" />
      <text fontFamily="Manrope, sans-serif" fontSize="9.5" fontWeight="700" fill="#133332">
        <textPath href={`#${id}`} textLength={345} lengthAdjust="spacing">{text}</textPath>
      </text>
      <text x="75" y="84" textAnchor="middle" fontFamily="Gilda Display, Georgia, serif" fontSize="34" fill="#a3d9c4">12</text>
      <text x="75" y="99" textAnchor="middle" fontFamily="Manrope, sans-serif" fontSize="7" fontWeight="700" letterSpacing="1.6" fill="#a3d9c4">MÅNEDER</text>
    </svg>
  );
}

/** Den tynde bue i baggrunden (fra legat-designet). */
export function Arc({ d = "M 1500 -30 C 900 -30 500 180 500 470 C 500 700 660 800 780 830" }: { d?: string }) {
  return (
    <svg className="crt-bg" width="1123" height="794" viewBox="0 0 1123 794" aria-hidden="true">
      <path d={d} fill="none" stroke="#3e5a59" strokeWidth="1.2" />
    </svg>
  );
}

/** Fælles tekstblok for legat-familien: meta, overskrift, tildelt, navn, virksomhed, brødtekst. */
export function LegatText({ memberName, companyName, period }: { memberName: string; companyName?: string | null; period: string }) {
  return (
    <div className="crt-text">
      <div className="crt-meta">
        <span>Certifikat</span>
        <span className="crt-meta-divider" />
        <span>12 måneder</span>
      </div>
      <h1 className="crt-heading">
        The
        <br />
        Boardroom
        <br />
        Certifikat
      </h1>
      <div className="crt-eyebrow">Tildelt</div>
      <div className="crt-name" data-len={nameLen(memberName)}>
        {memberName}
      </div>
      {companyName ? <div className="crt-company">{companyName}</div> : null}
      <p className="crt-body">
        som bevis på 12 måneders medlemskab af The Boardroom, <span className="crt-nowrap">{period}</span>.
      </p>
    </div>
  );
}

export function LegatFooter({ assets }: { assets: CertificateAssets }) {
  return (
    <div className="crt-footer">
      <Lockup size="lg" tone="dark" />
      <div className="crt-sigs">
        <Signature src={assets.signatureJonasLight} name="Jonas Herlev" />
        <Signature src={assets.signatureMortenLight} name="Morten Larsen" />
      </div>
    </div>
  );
}
