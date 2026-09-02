import { cn } from "@/lib/utils";

/**
 * De to rådgiverportrætter som ÉT element — Jonas og Morten side om side,
 * 64 px runde, fornavnet under. Samme udtryk som MembershipExpiredGate,
 * ChatShell og BookSessionView skriver hver for sig i dag (recon-
 * portraetter.md §4: fem steder, ingen delt komponent). Bruges i første
 * omgang KUN på signup (/auth); de fire eksisterende steder flytter
 * herover senere.
 *
 * Billederne er statiske filer i public/ (jonas-herlev.png 300×283,
 * morten-larsen.jpg 1035×830) og serveres fra roden uden login — derfor
 * kan komponenten stå på en side uden session. Ingen beskæring på
 * forhånd; object-cover skærer cirklen i browseren.
 */
const RAADGIVERE = [
  { src: "/jonas-herlev.png", alt: "Jonas Herlev", fornavn: "Jonas" },
  { src: "/morten-larsen.jpg", alt: "Morten Larsen", fornavn: "Morten" },
] as const;

export const HbRaadgiverPortraetter = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center justify-center gap-8", className)}>
    {RAADGIVERE.map((r) => (
      <div key={r.fornavn} className="text-center space-y-2">
        <img src={r.src} alt={r.alt} className="h-16 w-16 rounded-full object-cover mx-auto" />
        <p className="text-sm text-hb-ink">{r.fornavn}</p>
      </div>
    ))}
  </div>
);
