import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { stedForSti, STEDS_SAETNINGER, visStedsSaetning } from "@/lib/hjemmebane/stedsSaetninger";

/** «Det her er stedet, hvor …» (seks steder, 2/10-2026) — ÉN rolig sætning
    øverst på hvert af det fulde medlems seks steder. Ordene bor i
    lib/hjemmebane/stedsSaetninger.ts; komponenten vælger af stien og
    tegner null for alt andet (undersider, rådgiverflader). Tegnes af
    HbMemberShell over indholdet — og på forsiden af BoardroomView under
    hilsenen, så «Godmorgen, Mette» stadig står først (forslagets orden).

    GATEN bor HER, ikke i skallen: det fulde medlem — og en rådgiver i «Se
    som medlem» (viewingAsMember), så Jonas ser det, medlemmet ser.
    Abonnenten har ikke de seks steder og får ingen sætning. Skallen selv
    må ikke læse viewingAsMember (online.guard dom 6, raadgiverSkrev-værnet:
    hjerteslag og lytning gater på RÅ isAdvisor) — derfor læser komponenten
    rollen selv. Hooks i topblokken, før den betingede return.

    Gaten er FAIL-CLOSED (rådets fund 2, 2/10): `membershipTier === "full"`,
    ikke `!== "subscriber"`. Tieren er null, mens useAuth henter — og i det
    første render er en abonnent også null. Med «ikke abonnent» ville
    abonnenten se Netværkets sætning et øjeblik,
    før tieren landede; et sted, abonnenten ikke har. null = intet, og
    «expired» = intet. Rådgiveren dømmes KUN af viewingAsMember — IKKE af
    tieren, for useAuth sætter rådgiveren til «full» («rådgiveren er altid
    "full"»), og rådets formel `tier === "full" || (isAdvisor &&
    viewingAsMember)` ville derfor vise medlemmets sætning på rådgiverens
    EGNE flader (/chat er Indbakken, /community, /events, /akademiet …).
    Dommen `visStedsSaetning` er ren og bor i stedsSaetninger.ts (testet). */
/** `ellers`: det, der tegnes i stedet, når sætningen IKKE vises (abonnenten,
    rådgiveren uden «Se som medlem») — sidens gamle intro, så de flader, der
    lod sætningen afløse deres intro (rådets fund 7), ikke står uden
    indledning for dem, sætningen ikke taler til. Udeladt = intet. */
export const HbStedsSaetning = ({ sti, className, ellers = null }: { sti: string; className?: string; ellers?: ReactNode }) => {
  const { isAdvisor, membershipTier } = useAuth();
  const { viewingAsMember } = useViewMode();
  const sted = stedForSti(sti);
  const vises = visStedsSaetning({ isAdvisor, viewingAsMember, membershipTier });
  if (!sted) return null;
  if (!vises) return <>{ellers}</>;
  return (
    <p className={`max-w-3xl text-[15px] leading-relaxed text-hb-ink-soft ${className ?? ""}`} data-steds-saetning={sted}>
      {STEDS_SAETNINGER[sted]}
    </p>
  );
};
