import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getMyMemberProfile, listExistingExpertise, saveMyAdvisorProfile } from "@/lib/hjemmebane/memberProfile";
import { klipTilGraense } from "@/lib/hjemmebane/netvaerksprofil";
import {
  RAADGIVER_PROFIL_ANKER,
  RAADGIVER_VAERET_IGENNEM,
  fletEkspertise,
  raadgiverProfilPayload,
} from "@/lib/hjemmebane/raadgiverNetvaerksprofil";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";
import { HbField, HbInput, HbTextarea } from "../admin/HbField";

/**
 * Rådgiverens profil i netværket på /konto (30/9, Jonas 21:21). Reglerne og
 * målingen bag står i src/lib/hjemmebane/raadgiverNetvaerksprofil.ts.
 *
 * FAIL-SOFT, MEN ALDRIG EN TOM OVERSKRIVNING: formularen tegnes FØRST, når
 * egen række er hentet (også når den ikke findes — null er «aldrig udfyldt»).
 * Fejler hentningen, står der én rolig sætning og ingen knap: et gem på tomme
 * felter ville ellers slette det, der står.
 *
 * Vises kun, når KontoView har dømt visRaadgiverProfilKort (rådgiver, ikke
 * tjenestekonto). Fotoet står allerede i «Navn og billede» ovenfor — det er
 * samme avatar, netværket viser.
 */
export const RaadgiverNetvaerksprofil = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const egenQuery = useQuery({
    queryKey: ["member-profile", "egen", user?.id ?? null],
    queryFn: () => getMyMemberProfile(user!.id),
    enabled: !!user,
    retry: false,
  });
  const forslagQuery = useQuery({
    queryKey: ["member-directory", "ekspertise-forslag"],
    queryFn: listExistingExpertise,
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const [vaeretIgennem, setVaeretIgennem] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [gemmer, setGemmer] = useState(false);

  useEffect(() => {
    if (egenQuery.status !== "success") return;
    const mp = egenQuery.data;
    setVaeretIgennem(mp?.ask_me_about ?? "");
    setLinkedin(mp?.linkedin_url ?? "");
    setTags(mp?.expertise ?? []);
  }, [egenQuery.status, egenQuery.data]);

  const gem = async () => {
    if (!user) return;
    const endeligeTags = fletEkspertise(tags, tagInput);
    setTags(endeligeTags);
    setTagInput("");
    setGemmer(true);
    try {
      await saveMyAdvisorProfile(
        user.id,
        raadgiverProfilPayload({ linkedin_url: linkedin, expertise: endeligeTags, ask_me_about: vaeretIgennem }),
      );
      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      queryClient.invalidateQueries({ queryKey: ["member-directory"] });
      toast.success("Netværksprofil opdateret");
    } catch (e) {
      toast.error("Kunne ikke gemme netværksprofilen", { description: e instanceof Error ? e.message : undefined });
    }
    setGemmer(false);
  };

  const felt = RAADGIVER_VAERET_IGENNEM;
  const forslag = (forslagQuery.data ?? []).filter((s) => !tags.includes(s));

  return (
    <HbSection eyebrow="Netværket" hairline className="mt-12 max-w-3xl">
      <div id={RAADGIVER_PROFIL_ANKER} className="scroll-mt-24">
        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Din profil i netværket</p>
          <p className="mt-4 text-sm leading-relaxed text-hb-ink-soft">
            Medlemmerne ser dig under «Dine rådgivere» i{" "}
            <Link to="/medlemmer" className="text-hb-evergreen underline-offset-4 hover:underline">Netværket</Link>.
            Billedet er det samme som ovenfor.
          </p>

          {egenQuery.status === "pending" ? (
            <p className="mt-5 text-sm text-hb-ink-soft">Henter…</p>
          ) : egenQuery.status === "error" ? (
            <p className="mt-5 text-sm text-hb-ink-soft">Profilen kunne ikke hentes lige nu — prøv igen om lidt.</p>
          ) : (
            <>
              <div className="mt-5 space-y-5">
                <HbField label={felt.label} htmlFor="raadgiver-vaeret-igennem" help={`${felt.hjaelp} ${vaeretIgennem.length}/${felt.graense}`}>
                  <HbTextarea
                    id="raadgiver-vaeret-igennem"
                    value={vaeretIgennem}
                    onChange={(e) => setVaeretIgennem(klipTilGraense(e.target.value, felt.noegle))}
                    maxLength={felt.graense}
                    rows={3}
                    placeholder={felt.eksempel}
                  />
                </HbField>
                <HbField label="LinkedIn" htmlFor="raadgiver-linkedin">
                  <HbInput id="raadgiver-linkedin" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" />
                </HbField>
                <HbField label="Spidskompetencer" htmlFor="raadgiver-expertise" help="Skriv og tryk Enter — fx Finansiering, Bestyrelsesarbejde. Forslagene nedenfor er fra netværket.">
                  {tags.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <HbTag key={tag} className="gap-1 pr-1.5">
                          {tag}
                          <button type="button" onClick={() => setTags((t) => t.filter((x) => x !== tag))} aria-label={`Fjern ${tag}`} className="rounded-full px-1 text-hb-ink-soft hover:text-hb-rust">×</button>
                        </HbTag>
                      ))}
                    </div>
                  )}
                  <HbInput
                    id="raadgiver-expertise"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        setTags((t) => fletEkspertise(t, tagInput));
                        setTagInput("");
                      }
                    }}
                    placeholder="Skriv og tryk Enter"
                  />
                  {forslag.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {forslag.slice(0, 12).map((s) => (
                        <button key={s} type="button" onClick={() => setTags((t) => fletEkspertise(t, s))} className="rounded-full border border-hb-line px-2.5 py-1 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/40 hover:text-hb-ink">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </HbField>
              </div>
              <HbButton type="button" className="mt-5 h-10 px-5" onClick={gem} disabled={gemmer}>
                {gemmer ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gem netværksprofil
              </HbButton>
            </>
          )}
        </HbCard>
      </div>
    </HbSection>
  );
};
