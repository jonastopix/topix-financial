import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { raadgiverKortKey, useRaadgiverKort } from "@/hooks/raadgiverKort";
import { indsaetChatBesked } from "@/lib/chatSkrivevej";
import { sendeUdfald } from "@/lib/chatSendefejl";
import { notifyChatMessage } from "@/lib/chatNotify";
import { MAX_MESSAGE_LENGTH } from "@/lib/chatShared";
import {
  beskedLinje, beskedTid, kortetsContent, RAADGIVER_KORT, raadgiverAdresse, raadgiverFornavn, sendtKvittering,
} from "@/lib/hjemmebane/raadgiverKort";
import { laesChatVideo } from "@/lib/chatVideo";
import { cn } from "@/lib/utils";
import { HbAvatar } from "../HbAvatar";
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
    sende som rådgiveren).

    FORSIDE V3 (2/10-2026 aften, docs/forside-v3.md §5 — mockup v3 godkendt 20:41): rådgivernes ANSIGTER +
    «Morten og Jonas» øverst; derunder den seneste besked FRA EN RÅDGIVER (aldrig medlemmets egen — hooken
    vælger den), en video som kursiv «Sendte en video»; composeren «Skriv til …» med en sekundær «Send».
    Efter en afsendelse står kvitteringen («Sendt. Morten og Jonas svarer i chatten.») — medlemmets egen
    besked vises ikke i kortet. `className` lader forsidens pakning styre luften. */
export const ForsideRaadgiverKort = ({ className = "mt-10 md:mt-12" }: { className?: string }) => {
  const { user, companyId, isAdvisor, membershipTier } = useAuth();
  const queryClient = useQueryClient();
  const aktiv = !isAdvisor && !!companyId && !!user;
  const { kort, raadgiverNavne } = useRaadgiverKort(companyId, user?.id, aktiv);
  const [tekst, setTekst] = useState("");
  const [sender, setSender] = useState(false);
  const [sendefejl, setSendefejl] = useState(false);
  const [sendt, setSendt] = useState(false);
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
      setSendt(true);
      const ny = svar.data as { id: string };
      setNu(new Date());
      notifyChatMessage(ny.id);
      void queryClient.invalidateQueries({ queryKey: raadgiverKortKey(companyId, user.id) });
    } else {
      // Teksten bliver STÅENDE i feltet — en fejlet besked må aldrig være tavs (chatSendefejl.ts).
      console.error("[ForsideRaadgiverKort] beskeden blev ikke sendt:", svar.error);
      setSendefejl(true);
    }
    setSender(false);
  };

  const raadgivere = data?.raadgivere ?? [];
  const linje = data?.seneste ? beskedLinje(data.seneste, (m) => laesChatVideo(m) !== null) : null;

  return (
    <HbSection eyebrow={RAADGIVER_KORT.eyebrow} linkLabel={RAADGIVER_KORT.aabnChatten} linkTo={RAADGIVER_KORT.chatSti} hairline className={className} data-forside-raadgiver>
      <HbCard className="p-5">
        {kort.isError ? (
          <p className="text-sm text-hb-rust" data-raadgiver-kort-fejl>
            {RAADGIVER_KORT.hentefejl}{" "}
            <button type="button" onClick={() => void kort.refetch()} className="underline-offset-4 hover:underline">Prøv igen</button>
          </p>
        ) : (
          <>
            {raadgivere.length > 0 && (
              <div className="flex items-center gap-3" data-raadgiver-kort-ansigter={raadgivere.length}>
                <div className="flex -space-x-2">
                  {raadgivere.map((r) => (
                    <span key={r.user_id} className="rounded-full ring-2 ring-hb-surface">
                      <HbAvatar navn={r.full_name} avatarUrl={r.avatar_url} />
                    </span>
                  ))}
                </div>
                <p className="text-sm text-hb-ink">{raadgiverAdresse(raadgivere.map((r) => r.full_name))}</p>
              </div>
            )}
            {!data?.samtaleId ? (
              <p className={cn("text-sm text-hb-ink-soft", raadgivere.length > 0 && "mt-4 border-t border-hb-line pt-3")} data-raadgiver-kort-ingen-samtale>
                {RAADGIVER_KORT.ingenSamtale}{" "}
                <Link to={RAADGIVER_KORT.chatSti} className="text-hb-evergreen underline-offset-4 hover:underline">{RAADGIVER_KORT.aabnChatten}</Link>
              </p>
            ) : (
              <>
                {data.seneste && linje ? (
                  <div className={cn(raadgivere.length > 0 && "mt-4 border-t border-hb-line pt-3")} data-raadgiver-kort-seneste={data.seneste.id}>
                    <p className="text-xs text-hb-ink-soft">
                      <span className="font-medium text-hb-ink">{raadgiverFornavn(data.seneste.sender_id, raadgivere)}</span>
                      {" · "}
                      {beskedTid(data.seneste.created_at, nu)}
                    </p>
                    <p className={cn("mt-1 break-words text-[15px] leading-relaxed", linje.kursiv ? "italic text-hb-ink-soft" : "text-hb-ink")} data-raadgiver-kort-linje={linje.kursiv ? "kursiv" : "tekst"}>{linje.tekst}</p>
                  </div>
                ) : data.harSkrevet ? (
                  <p className={cn("text-sm text-hb-ink-soft", raadgivere.length > 0 && "mt-4 border-t border-hb-line pt-3")} data-raadgiver-kort-venter>{RAADGIVER_KORT.venterPaaSvar}</p>
                ) : (
                  <p className={cn("text-[15px] text-hb-ink", raadgivere.length > 0 && "mt-4 border-t border-hb-line pt-3")} data-raadgiver-kort-foerste>{RAADGIVER_KORT.foersteBesked}</p>
                )}
                {udloebet ? (
                  <p className="mt-3 text-sm text-hb-ink-soft">{RAADGIVER_KORT.udloebet}</p>
                ) : (
                  <form
                    className="mt-4 flex gap-2"
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
                        if (sendt) setSendt(false);
                      }}
                      disabled={sender}
                      placeholder={RAADGIVER_KORT.pladsholder}
                      aria-label={RAADGIVER_KORT.feltLabel}
                      className="h-10 min-w-0 flex-1 rounded-full border border-hb-line bg-hb-surface px-4 text-sm text-hb-ink placeholder:text-hb-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen disabled:opacity-60"
                    />
                    <HbButton type="submit" variant="secondary" className="h-10 shrink-0 px-5 text-sm" disabled={sender || !tekst.trim() || forLang}>
                      {sender ? RAADGIVER_KORT.sender : RAADGIVER_KORT.send}
                    </HbButton>
                  </form>
                )}
                {sendt && <p className="mt-2 text-sm text-hb-evergreen" role="status" data-raadgiver-kort-sendt>{sendtKvittering(raadgiverNavne)}</p>}
                {forLang && <p className="mt-2 text-sm text-hb-rust">{RAADGIVER_KORT.forLang}</p>}
                {sendefejl && <p className="mt-2 text-sm text-hb-rust" role="alert">{RAADGIVER_KORT.sendefejl}</p>}
              </>
            )}
          </>
        )}
      </HbCard>
    </HbSection>
  );
};
