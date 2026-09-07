import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Betalingsmodel } from "@/lib/fornyelsespris";
import { beskrivMulighed, fornyelsesbaandTekst, type Fornyelsestilbud } from "@/lib/hjemmebane/fornyelsesbaand";
import { HbButton } from "../HbButton";

/**
 * Fornyelsesbåndet — øverst på medlemmets forside, KUN når der er et
 * tilbud. Besluttet 7/9 (Jonas): siden #684 kan et medlem betale sin
 * fornyelse FØR slutdatoen (klar_til_tilbud), men den eneste dør til
 * checkout var MembershipExpiredGate, som kun vises ved tier expired.
 * PHILBERT (slut 29/9) kunne betale og havde intet sted at gøre det.
 *
 * FORMEN er chattens udløbsbånd (MemberChatPane: «flex items-center gap-2
 * px-3 py-3 rounded-hb bg-hb-sage/20 border border-hb-line text-xs
 * text-hb-ink-soft») — men i invitationens tone: evergreen-ikon, ikke
 * rust; medlemmet har fuld adgang og mister ingen dage ved at handle nu.
 *
 * DOMMEN er serverens: hent-fornyelsestilbud kalder motoren
 * (afgoerFornyelsestilstand) og svarer { tilbud: null } for alle uden
 * tilbud — beslutning_mangler, tilbyd_ikke, ophoert, lukket vindue,
 * ikke i vinduet. Svaret røber ingen kategori (ordningens §2), og der
 * findes ingen tier- eller tilstandslæsning i klienten: intet tilbud →
 * null, ingen plads optaget. Samme queryKey som gaten, så cachen deles.
 *
 * SLUTDATOEN kommer ikke med i funktionens svar (kun grundbeloeb_oere og
 * muligheder), og useAuth eksponerer kun tier. Derfor læses
 * companies.contract_end_date her, kun når der ER et tilbud — samme
 * medlemslæsning som BookSessionView (RLS: id = user_company_id).
 *
 * KUN medlemmer: funktionen udleder virksomheden af kalderens egen
 * company_members-række, så en rådgiver i «Visning som» ville få 403 om
 * sin egen (ikke-eksisterende) virksomhed — enabled er derfor !isAdvisor.
 *
 * CHECKOUT åbnes ad samme vej som gaten (opret-fornyelse-checkout), med
 * gatens fejlhåndtering ordret: 403-beskeden vises som den er, alt andet
 * får den neutrale besked. Én knap pr. betalingsmodel, som i gaten — at
 * vælge model for medlemmet ville være et gæt.
 */
export const FornyelsesBaand = () => {
  const { user, companyId, isAdvisor } = useAuth();
  const [loadingFornyelse, setLoadingFornyelse] = useState<Betalingsmodel | null>(null);

  const { data: tilbud = null } = useQuery({
    queryKey: ["fornyelsestilbud"],
    queryFn: async (): Promise<Fornyelsestilbud | null> => {
      const { data, error } = await supabase.functions.invoke("hent-fornyelsestilbud");
      if (error) throw error;
      return (data?.tilbud ?? null) as Fornyelsestilbud | null;
    },
    enabled: !!user && !isAdvisor && !!companyId,
    staleTime: 5 * 60_000,
  });

  const { data: slutdato = null } = useQuery({
    queryKey: ["boardroom", "contract-end-date", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("contract_end_date")
        .eq("id", companyId!)
        .maybeSingle();
      return data?.contract_end_date ?? null;
    },
    enabled: !!companyId && tilbud !== null,
    staleTime: 5 * 60_000,
  });

  if (!tilbud) return null;

  const handleFornyelse = async (betalingsmodel: Betalingsmodel) => {
    setLoadingFornyelse(betalingsmodel);
    try {
      const { data, error } = await supabase.functions.invoke("opret-fornyelse-checkout", {
        body: { betalingsmodel },
      });
      if (error) {
        // 403-beskeden "Fornyelse er ikke tilgængelig." kan vises som den
        // er — den rammes fx hvis beslutningen er trukket tilbage mens
        // medlemmet sad på siden. Alt andet får en neutral besked; aldrig
        // en teknisk fejlbesked til medlemmet.
        let besked = "Noget gik galt — skriv til os, så hjælper vi dig videre.";
        try {
          const body = await (
            error as { context?: { json: () => Promise<{ error?: string }> } }
          ).context?.json();
          if (body?.error === "Fornyelse er ikke tilgængelig.") besked = body.error;
        } catch {
          // uparsebart fejlsvar — behold den neutrale besked
        }
        console.error("[FornyelsesBaand] opret-fornyelse-checkout fejlede:", error);
        toast.error(besked);
        setLoadingFornyelse(null);
        return;
      }
      if (!data?.url) throw new Error("Ingen checkout URL");
      window.location.href = data.url;
    } catch (err) {
      console.error("[FornyelsesBaand] opret-fornyelse-checkout fejlede:", err);
      toast.error("Noget gik galt — skriv til os, så hjælper vi dig videre.");
      setLoadingFornyelse(null);
    }
  };

  const tekst = fornyelsesbaandTekst({ contract_end_date: slutdato, grundbeloeb_oere: tilbud.grundbeloeb_oere });

  return (
    <div
      role="status"
      className="mt-6 flex flex-col gap-3 rounded-hb border border-hb-line bg-hb-sage/20 px-3 py-3 text-xs text-hb-ink-soft md:flex-row md:items-center md:gap-4"
    >
      <div className="flex items-start gap-2">
        <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-hb-evergreen" />
        <span>
          <span className="font-medium text-hb-ink">{tekst.overskrift}</span>
          {" — "}
          {tekst.linje}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 md:ml-auto md:shrink-0">
        {tilbud.muligheder.map((m) => (
          <HbButton
            key={m.lookup_key}
            variant="secondary"
            onClick={() => handleFornyelse(m.betalingsmodel)}
            disabled={loadingFornyelse !== null}
            className="h-9 px-3 text-xs"
          >
            {beskrivMulighed(m)}
            {loadingFornyelse === m.betalingsmodel ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-hb-ink-soft" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-hb-evergreen" />
            )}
          </HbButton>
        ))}
      </div>
    </div>
  );
};
