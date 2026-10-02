import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { stedForSti, STEDS_SAETNINGER } from "@/lib/hjemmebane/stedsSaetninger";

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
    rollen selv. Hooks i topblokken, før den betingede return. */
export const HbStedsSaetning = ({ sti, className }: { sti: string; className?: string }) => {
  const { isAdvisor, membershipTier } = useAuth();
  const { viewingAsMember } = useViewMode();
  const sted = stedForSti(sti);
  const vises = (!isAdvisor || viewingAsMember) && membershipTier !== "subscriber";
  if (!sted || !vises) return null;
  return (
    <p className={`max-w-3xl text-[15px] leading-relaxed text-hb-ink-soft ${className ?? ""}`} data-steds-saetning={sted}>
      {STEDS_SAETNINGER[sted]}
    </p>
  );
};
