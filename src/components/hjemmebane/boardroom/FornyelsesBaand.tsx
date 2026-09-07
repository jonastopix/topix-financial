import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
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
 * FORMEN (rettet 7/9 efter skærm): første udgave spejlede chattens
 * udløbsbånd (text-xs grå, tre knapper på samme linje) og læstes som en
 * notifikation. Nu er det en invitation i FocusCards typografi — samme
 * sage-flade og hairline som før, men overskriften (dato) i font-editorial
 * som noget man læser først, linjen (beløb) dæmpet under, og ÉN primær
 * knap, «Forny medlemskabet». Klik folder de tre betalingsmodeller ud PÅ
 * STEDET, som OpgaveKnapper gør med datovalget (én knap afløses af
 * valgmulighederne på samme plads) — husets eget mønster på forsiden;
 * HbDialog bruges til bekræftelser og formularer, ikke til et valg mellem
 * tre. Luften over og under er sektionernes rytme (mt-10 md:mt-12), så
 * båndet ikke klistrer op under hilsenen.
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
  /** false = den ene knap; true = de tre betalingsmodeller er foldet ud på stedet. */
  const [valgAabent, setValgAabent] = useState(false);

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
    <section aria-label="Fornyelse" className="mt-10 md:mt-12">
      <div className="rounded-hb border border-hb-line bg-hb-sage/20 p-7 md:p-9">
        <h3 className="font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">{tekst.overskrift}</h3>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{tekst.linje}</p>

        {valgAabent ? (
          /* Foldet ud på stedet (OpgaveKnapper-mønstret): de tre modeller
             med gatens ordlyd, på den plads knappen stod. */
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-hb-ink-soft">Hvordan vil du betale?</span>
            {tilbud.muligheder.map((m) => (
              <HbButton
                key={m.lookup_key}
                variant="secondary"
                onClick={() => handleFornyelse(m.betalingsmodel)}
                disabled={loadingFornyelse !== null}
                className="h-11 px-4"
              >
                {beskrivMulighed(m)}
                {loadingFornyelse === m.betalingsmodel ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-hb-ink-soft" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
                )}
              </HbButton>
            ))}
            <HbButton variant="link" onClick={() => setValgAabent(false)} disabled={loadingFornyelse !== null}>
              Ikke nu
            </HbButton>
          </div>
        ) : (
          <HbButton className="mt-7" onClick={() => setValgAabent(true)}>
            Forny medlemskabet
          </HbButton>
        )}
      </div>
    </section>
  );
};
