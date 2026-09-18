/**
 * AnsoegSamtale — samtalen på ansøgerens statusside (udkast 18/9, rev. 3):
 * tidsvælgeren når de er indkaldt; tid, Meet-link, «Flyt» og «Aflys» når
 * samtalen er booket. Bookingen oprettes i Calendly bagved (ansoegning-samtale);
 * ansøgeren ser aldrig calendly.com. Alle kald går gennem lib/ansoegning/api
 * (tokenet er legitimationen); komponenten regner ingen tider selv.
 * Efter en ændring kaldes onAendret, så siden henter status igen.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { SamtaleVaelger } from "./SamtaleVaelger";
import { aflysSamtale, AnsoegningsFejl, bookSamtale, flytSamtale, hentTider, type TiderSvar } from "@/lib/ansoegning/api";
import { bekraeftOrd, samtaleOrd } from "@/lib/ansoegning/samtaleValg";

export const AnsoegSamtale = ({ token, booket, onAendret }: { token: string; booket: { start: string; slut: string | null; moedeLink: string | null } | null; onAendret: (besked: string) => void }) => {
  const [flytter, setFlytter] = useState(false);
  const [tider, setTider] = useState<{ slags: "henter" } | { slags: "fejl"; tekst: string } | { slags: "klar"; svar: TiderSvar }>({ slags: "henter" });
  const [valgt, setValgt] = useState<string | null>(null);
  const [fejl, setFejl] = useState<string | null>(null);
  const [sender, setSender] = useState(false);
  const visVaelger = !booket || flytter;
  const fejlTekst = (e: unknown) => (e instanceof AnsoegningsFejl ? e.message : "Noget gik galt — prøv igen.");

  useEffect(() => {
    if (!visVaelger) return;
    let aktiv = true;
    setTider({ slags: "henter" });
    hentTider(token)
      .then((svar) => aktiv && setTider({ slags: "klar", svar }))
      .catch((e) => aktiv && setTider({ slags: "fejl", tekst: fejlTekst(e) }));
    return () => { aktiv = false; };
  }, [token, visVaelger]);

  const bekraeft = async () => {
    if (!valgt || sender) return;
    setSender(true);
    setFejl(null);
    try {
      await (flytter ? flytSamtale(token, valgt) : bookSamtale(token, valgt));
      setFlytter(false);
      setValgt(null);
      onAendret(flytter ? "Samtalen er flyttet — du får en ny kalenderinvitation." : "Samtalen er booket — du får en kalenderinvitation med mødelinket.");
    } catch (e) {
      setFejl(fejlTekst(e));
      setValgt(null);
      hentTider(token).then((svar) => setTider({ slags: "klar", svar })).catch(() => undefined);
    } finally {
      setSender(false);
    }
  };
  const aflys = async () => {
    if (sender || !window.confirm("Aflyse samtalen? Du kan vælge en ny tid bagefter.")) return;
    setSender(true);
    setFejl(null);
    try {
      await aflysSamtale(token);
      onAendret("Samtalen er aflyst — kalenderinvitationen trækkes tilbage.");
    } catch (e) {
      setFejl(fejlTekst(e));
    } finally {
      setSender(false);
    }
  };

  if (booket && !flytter) {
    return (
      <div className="rounded-hb border border-hb-line bg-hb-surface p-5" data-samtale-booket>
        <p className="text-[15px] font-medium text-hb-ink">{samtaleOrd(booket.start)}</p>
        <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">
          Online, 30 minutter. {booket.moedeLink ? <>Mødelinket: <a href={booket.moedeLink} className="text-hb-evergreen underline-offset-4 hover:underline">{booket.moedeLink}</a></> : "Mødelinket står i din kalenderinvitation."}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <HbButton type="button" variant="secondary" onClick={() => { setFlytter(true); setFejl(null); }} disabled={sender}>Flyt samtalen</HbButton>
          <HbButton type="button" variant="link" onClick={aflys} disabled={sender}>Aflys</HbButton>
        </div>
        {fejl && <p className="mt-3 text-sm text-hb-rust" role="alert">{fejl}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-hb border border-hb-line bg-hb-surface p-5" data-samtale-vaelg>
      {flytter && booket && <p className="mb-3 text-sm text-hb-ink-soft">Samtalen er sat til {samtaleOrd(booket.start)} — vælg en ny tid herunder.</p>}
      {tider.slags === "henter" ? <p className="text-sm text-hb-ink-soft">Henter ledige tider…</p>
        : tider.slags === "fejl" ? <p className="text-sm text-hb-rust">{tider.tekst}</p>
        : <SamtaleVaelger slots={tider.svar.slots} valgt={valgt} onVaelg={(iso) => { setValgt(iso); setFejl(null); }} varighedMin={tider.svar.varighed_min} />}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <HbButton type="button" onClick={bekraeft} disabled={!valgt || sender} data-samtale-bekraeft>
          {sender ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {bekraeftOrd(flytter ? "flyt" : "book", valgt)}
        </HbButton>
        {flytter && <HbButton type="button" variant="secondary" onClick={() => { setFlytter(false); setValgt(null); }} disabled={sender}>Behold tiden</HbButton>}
      </div>
      {fejl && <p className="mt-3 text-sm text-hb-rust" role="alert">{fejl}</p>}
    </div>
  );
};
