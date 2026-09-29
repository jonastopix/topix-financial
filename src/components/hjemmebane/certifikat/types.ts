export type DesignId =
  | "mork-klassiker"
  | "legat-segl"
  | "raadgivere-mork"
  | "raadgivere-lys"
  | "portraet";

/** Alt der skifter fra medlem til medlem. Resten er fast i designet. */
export interface CertificateData {
  /** Medlemmets fulde navn, fx "Anne Sofie Holm". */
  memberName: string;
  /** Virksomhedsnavn. Tom streng eller null = linjen udelades. */
  companyName?: string | null;
  /** Færdigformateret periode, fx "oktober 2025 – oktober 2026". Se formatPeriod(). */
  period: string;
  /** URL til medlemmets portræt (skal kunne hentes med CORS). Påkrævet for designs med portræt. */
  portraitUrl?: string | null;
}

/** Faste assets. Standard peger på /public/certificates og platformens rådgiverfotos. */
export interface CertificateAssets {
  signatureJonasLight: string;
  signatureJonasDark: string;
  signatureMortenLight: string;
  signatureMortenDark: string;
  /** Genbrug de rådgiverfotos, platformen allerede bruger på "Fortæl det videre". */
  advisorPhotoJonas: string;
  advisorPhotoMorten: string;
}

export interface CertificateProps {
  data: CertificateData;
  assets?: Partial<CertificateAssets>;
}
