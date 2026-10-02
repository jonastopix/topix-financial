import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { raadgiverKortKey, useRaadgiverKort, type RaadgiverKortData } from "@/hooks/raadgiverKort";
import { indsaetChatBesked } from "@/lib/chatSkrivevej";
import { sendeUdfald } from "@/lib/chatSendefejl";
import { notifyChatMessage } from "@/lib/chatNotify";
import { MAX_MESSAGE_LENGTH } from "@/lib/chatShared";
import {
  afsenderNavn, beskedForhaandsvisning, kortetsContent, RAADGIVER_KORT, relativDanskTid, skrivTilPladsholder,
} from "@/lib/hjemmebane/raadgiverKort";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";

/** «Din rådgiver» på medlemmets forside (2/10-2026 eftermiddag) — mellem «Dit
    certifikat» og «Næste i Netværket». En FORHÅNDSVISNING af virksomheds-
    samtalen: den seneste menneskelige besked (afsender, «i går kl. 14.12»,
    teksten afkortet) og et lille sendefelt. Afsendelsen går gennem chattens
    skrivevej (lib/chatSkrivevej indsaetChatBesked → sendeUdfald →
    notifyChatMessage — samme funktioner som MemberChatPane), content bygget
    som sendefeltets (kortetsContent → chatAfsendelse). Kortet markerer INTET
    som læst — det sker i /chat. Ingen tildeling: adressen er rådgivernes
    fornavne («Morten og Jonas»), aldrig «din rådgiver X». Kun for medlemmet
    selv (aldrig en rådgiver, heller ikke i «Se som medlem» — kortet ville
    sende som rådgiveren). */
export const ForsideRaadgiverKort = () => {
  const { user, companyId, isAdvisor, membershipTier } = useAuth();
  const queryClient = useQueryClient();
  const aktiv = !isAdvisor && !!companyId && !!user;
  const { kort, raadgiverNavne } = useRaadgiverKort(companyId, user?.id, aktiv);
  const [tekst, setTekst] = useState("");
  const [sender, setSender] = useState(false);
  const [sendefejl, setSendefejl] = useState(false);
  const [nu, setNu] = useState(() => new Date());

  if (!aktiv || kort.isPending) return null;

  const data = kort.data;
  const udloebet = membershipTier === "expired";
  const forLang = tekst.trim().length > MAX_MESSAGE_LENGTH;

  const send = async () => {
    if (!data?.samtaleId || !user || sender || udloebet) return;
    const content = kortetsContent(tekst);
    if (!content) return;
    setSender(true);
    setSendefejl(false);
    const svar = await indsaetChatBesked({ conversation_id: data.samtaleId, sender_id: user.id, content });
    if (sendeUdfald(svar) === "sendt") {
      setTekst("");
      const ny = svar.data as { id: string; sender_id: string; content: string | null; created_at: string };
      const key = raadgiverKortKey(companyId, user.id);
      queryClient.setQueryData<RaadgiverKortData>(key, (f) => ({
        samtaleId: data.samtaleId,
        profiler: f?.profiler ?? [],
        seneste: { id: ny.id, sender_id: ny.sender_id, content: ny.content, created_at: ny.created_at },
      }));
      setNu(new Date());
      notifyChatMessage(ny.id);
      void queryClient.invalidateQueries({ queryKey: key });
    } else {
      // Teksten bliver STÅENDE i feltet — en fejlet besked må aldrig være tavs (chatSendefejl.ts).
      console.error("[ForsideRaadgiverKort] beskeden blev ikke sendt:", svar.error);
      setSendefejl(true);
    }
    setSender(false);
  };

  return (
    <HbSection eyebrow={RAADGIVER_KORT.eyebrow} linkLabel={RAADGIVER_KORT.aabnChatten} linkTo={RAADGIVER_KORT.chatSti} hairline className="mt-10 md:mt-12" data-forside-raadgiver>
      <HbCard className="px-5 py-4 md:px-6">
        {kort.isError ? (
          <p className="text-sm text-hb-rust" data-raadgiver-kort-fejl>
            {RAADGIVER_KORT.hentefejl}{" "}
            <button type="button" onClick={() => void kort.refetch()} className="underline-offset-4 hover:underline">Prøv igen</button>
          </p>
        ) : !data?.samtaleId ? (
          <p className="text-sm text-hb-ink-soft" data-raadgiver-kort-ingen-samtale>
            {RAADGIVER_KORT.ingenSamtale}{" "}
            <Link to={RAADGIVER_KORT.chatSti} className="text-hb-evergreen underline-offset-4 hover:underline">{RAADGIVER_KORT.aabnChatten}</Link>
          </p>
        ) : (
          <>
            {data.seneste ? (
              <div data-raadgiver-kort-seneste={data.seneste.id}>
                <p className="text-sm text-hb-ink-soft">
                  <span className="font-medium text-hb-ink">{afsenderNavn(data.seneste.sender_id, user?.id, data.profiler)}</span>
                  {" · "}
                  {relativDanskTid(data.seneste.created_at, nu)}
                </p>
                <p className="mt-1 break-words text-[15px] leading-relaxed text-hb-ink">{beskedForhaandsvisning(data.seneste.content)}</p>
              </div>
            ) : (
              <p className="text-[15px] text-hb-ink" data-raadgiver-kort-foerste>{RAADGIVER_KORT.foersteBesked}</p>
            )}
            {udloebet ? (
              <p className="mt-3 text-sm text-hb-ink-soft">{RAADGIVER_KORT.udloebet}</p>
            ) : (
              <form
                className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <input
                  type="text"
                  value={tekst}
                  onChange={(e) => {
                    setTekst(e.target.value);
                    if (sendefejl) setSendefejl(false);
                  }}
                  disabled={sender}
                  placeholder={skrivTilPladsholder(raadgiverNavne)}
                  aria-label={RAADGIVER_KORT.feltLabel}
                  className="h-10 min-w-0 flex-1 rounded-full border border-hb-line bg-hb-surface px-4 text-sm text-hb-ink placeholder:text-hb-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen disabled:opacity-60"
                />
                <HbButton type="submit" className="h-10 px-5 text-sm" disabled={sender || !tekst.trim() || forLang}>
                  {sender ? RAADGIVER_KORT.sender : RAADGIVER_KORT.send}
                </HbButton>
              </form>
            )}
            {forLang && <p className="mt-2 text-sm text-hb-rust">{RAADGIVER_KORT.forLang}</p>}
            {sendefejl && <p className="mt-2 text-sm text-hb-rust" role="alert">{RAADGIVER_KORT.sendefejl}</p>}
          </>
        )}
      </HbCard>
    </HbSection>
  );
};
