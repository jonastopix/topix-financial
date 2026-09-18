import "@/styles/hjemmebane.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { AnsoegSamtale } from "@/components/ansoegning/AnsoegSamtale";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW, HB_H1, HB_RAMME } from "@/components/hjemmebane/hbFormKlasser";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";
import { AnsoegningsFejl, hentStatus, sigIkkeNu, tagOpIgen, svarPaaPladsen, type StatusSvar } from "@/lib/ansoegning/api";
import { afgoerStatus, danskDato, laesPladsHandling, PLADS_UDLOEBET, pladsSpoergsmaal, pladsSvarTekst, type PladsSvar } from "@/lib/ansoegning/status";
import { TOKEN_PARAM } from "@/lib/ansoegning/skema";

/** /ansoeg/status?t=<token>[&handling=ikke_nu] — ansøgerens egen side EFTER
    indsendelse (18/9, flow-gennemgangen §1/§10). Linket står i alle rykkermails
    («Se din ansøgning») og i «ikke nu»-linjen. Uguardet som /ansoeg; tokenet er
    legitimationen (A's ansoegning-link: verifyAnsoegningslink, fasen indsendt).
    Lille med vilje (Jonas): hvad der sker nu, hvad vi venter på, og to knapper —
    tidsvælgeren når de er indkaldt (samtalen i kalenderen, udkast 18/9: tiden
    vælges HER og oprettes i Calendly bagved — AnsoegSamtale), og «Ikke nu». Kommer man med
    &handling=ikke_nu, vises bekræftelsen med det samme — ét klik, aldrig
    automatisk (et link i en mail må ikke kunne udføre noget ved et uheld). */

type Tilstand =
  | { slags: "henter" }
  | { slags: "ukendt" }
  | { slags: "fejl" }
  | { slags: "klar"; svar: StatusSvar };

const AnsoegStatus = () => {
  useHbDokumentGrund();
  const [searchParams] = useSearchParams();
  const token = searchParams.get(TOKEN_PARAM) ?? "";
  const [tilstand, setTilstand] = useState<Tilstand>({ slags: "henter" });
  const [bekraefter, setBekraefter] = useState(searchParams.get("handling") === "ikke_nu");
  // Ventelisten (rettelse 19/9): ?handling=tag_pladsen|afslaa_pladsen → bekræftelseskort → svarPaaPladsen. Ét klik, aldrig automatisk.
  const [pladsSvar, setPladsSvar] = useState<PladsSvar | null>(() => laesPladsHandling(searchParams.get("handling")));
  const [pladsResultat, setPladsResultat] = useState<{ titel: string; tekst: string } | null>(null);
  const [sender, setSender] = useState(false);
  const [sagtIkkeNu, setSagtIkkeNu] = useState<string | null>(null);
  // Pausen taget af fra siden (18/9 aften): én grøn linje, siden viser trinnet igen.
  const [genoptaget, setGenoptaget] = useState(false);
  // Samtalen: efter book/flyt/aflys hentes status igen (version++), og en linje siger hvad der skete.
  const [version, setVersion] = useState(0);
  const [samtaleBesked, setSamtaleBesked] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    if (!token) {
      setTilstand({ slags: "ukendt" });
      return;
    }
    hentStatus(token)
      .then((svar) => aktiv && setTilstand({ slags: "klar", svar }))
      .catch((e) => aktiv && setTilstand({ slags: e instanceof AnsoegningsFejl && e.status === 404 ? "ukendt" : "fejl" }));
    return () => {
      aktiv = false;
    };
  }, [token, version]);

  const svarPlads = async () => {
    if (sender || !pladsSvar) return;
    setSender(true);
    try {
      const r = await svarPaaPladsen(token, pladsSvar);
      setPladsResultat(pladsSvarTekst(pladsSvar, r.genaabnet));
      setPladsSvar(null);
      setVersion((x) => x + 1);
    } catch (e) {
      if (e instanceof AnsoegningsFejl && e.status === 409) {
        setPladsResultat(PLADS_UDLOEBET);
        setPladsSvar(null);
      } else {
        console.error("[ansoeg/status] svar på pladsen fejlede:", e);
        setTilstand({ slags: "fejl" });
      }
    } finally {
      setSender(false);
    }
  };

  const ikkeNu = async () => {
    if (sender) return;
    setSender(true);
    try {
      const r = await sigIkkeNu(token);
      setSagtIkkeNu(r.paa_pause_til ?? "");
      setTilstand({ slags: "klar", svar: r });
      setBekraefter(false);
    } catch (e) {
      console.error("[ansoeg/status] ikke nu fejlede:", e);
      setTilstand({ slags: "fejl" });
    } finally {
      setSender(false);
    }
  };

  const tagOp = async () => {
    if (sender) return;
    setSender(true);
    try {
      const r = await tagOpIgen(token);
      setSagtIkkeNu(null);
      setBekraefter(false);
      setGenoptaget(true);
      setTilstand({ slags: "klar", svar: r });
      setVersion((x) => x + 1);
    } catch (e) {
      console.error("[ansoeg/status] tag op igen fejlede:", e);
      setTilstand({ slags: "fejl" });
    } finally {
      setSender(false);
    }
  };

  let indhold: JSX.Element;
  if (tilstand.slags === "henter") {
    indhold = <div className="mx-auto h-32 max-w-xl animate-pulse rounded-hb bg-hb-line/60" aria-busy="true" />;
  } else if (tilstand.slags === "ukendt") {
    indhold = (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className={HB_H1}>Linket virker ikke længere</h1>
        <p className="text-hb-ink-soft">Ansøgningen er enten ikke sendt endnu, eller linket er ikke det rigtige. Skriv til {KONTAKT_ADRESSE}, så finder vi ud af det.</p>
      </div>
    );
  } else if (tilstand.slags === "fejl") {
    indhold = (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className={HB_H1}>Der gik noget galt</h1>
        <p className="text-hb-ink-soft">Vi kunne ikke hente din ansøgning lige nu. Prøv igen om lidt — eller skriv til {KONTAKT_ADRESSE}.</p>
      </div>
    );
  } else {
    const v = afgoerStatus(tilstand.svar);
    const pladsKort = pladsSvar ? pladsSpoergsmaal(pladsSvar) : null;
    indhold = (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="space-y-3">
          <p className={HB_EYEBROW}>{tilstand.svar.virksomhedsnavn}</p>
          <h1 className={HB_H1}>{pladsResultat ? pladsResultat.titel : pladsKort ? pladsKort.titel : sagtIkkeNu !== null ? "Vi holder pause" : v.titel}</h1>
          <p className="text-base leading-relaxed text-hb-ink-soft">
            {pladsResultat
              ? pladsResultat.tekst
              : pladsKort
                ? pladsKort.tekst
                : sagtIkkeNu !== null
                  ? `Tak for besked. Vi skriver ikke til dig${sagtIkkeNu ? ` før ${danskDato(sagtIkkeNu)}` : " de næste tre måneder"} — og gerne før, hvis du selv siger til.`
                  : v.tekst}
          </p>
        </div>
        {pladsKort && (
          <div className="rounded-hb border border-hb-line bg-hb-surface p-5" data-plads-bekraeft={pladsSvar}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <HbButton type="button" onClick={svarPlads} disabled={sender}>
                {sender ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {pladsKort.knap}
              </HbButton>
              <HbButton type="button" variant="secondary" onClick={() => setPladsSvar(null)} disabled={sender}>
                Fortryd
              </HbButton>
            </div>
          </div>
        )}
        {!pladsKort && !pladsResultat && sagtIkkeNu === null && bekraefter && v.visIkkeNu && (
          <div className="rounded-hb border border-hb-line bg-hb-surface p-5" data-ikke-nu-bekraeft>
            <p className="text-[15px] font-medium text-hb-ink">Skal vi sætte ansøgningen på pause?</p>
            <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">Så skriver vi ikke til dig i tre måneder. Du kan altid vende tilbage før.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <HbButton type="button" onClick={ikkeNu} disabled={sender}>
                {sender ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Ja, sæt på pause
              </HbButton>
              <HbButton type="button" variant="secondary" onClick={() => setBekraefter(false)} disabled={sender}>
                Nej, lad den stå
              </HbButton>
            </div>
          </div>
        )}
        {samtaleBesked && <p className="text-sm font-medium text-hb-evergreen" data-samtale-besked>{samtaleBesked}</p>}
        {genoptaget && !v.visGenoptag && <p className="text-sm font-medium text-hb-evergreen" data-genoptaget>Pausen er taget af — vi er i gang igen.</p>}
        {/* På pause (18/9 aften): «ikke nu» er en udvej, ikke en spærring — er de klar før datoen, tager de selv pausen af. Samme dom som rådgiverens «Genoptag nu». */}
        {!pladsKort && !pladsResultat && (v.visGenoptag || sagtIkkeNu !== null) && (
          <div className="rounded-hb border border-hb-line bg-hb-surface p-5" data-genoptag>
            <p className="text-[15px] font-medium text-hb-ink">Klar før tid?</p>
            <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">Så tag ansøgningen op igen nu. Den fortsætter, hvor den slap, og Jonas får besked med det samme.</p>
            <div className="mt-4">
              <HbButton type="button" onClick={tagOp} disabled={sender}>
                {sender ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Tag ansøgningen op igen
              </HbButton>
            </div>
          </div>
        )}
        {!pladsKort && sagtIkkeNu === null && !bekraefter && (v.book || v.booket) && (
          <AnsoegSamtale token={token} booket={v.booket} onAendret={(besked) => { setSamtaleBesked(besked); setVersion((x) => x + 1); }} />
        )}
        {/* Ventelisten (19/9): et tilbud ude → de to knapper her på siden, samme bekræftelseskort som fra mailen. */}
        {!pladsKort && !pladsResultat && v.plads === "tilbud" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-plads-tilbud>
            <HbButton type="button" onClick={() => setPladsSvar("ja")}>Ja tak, jeg vil have pladsen</HbButton>
            <HbButton type="button" variant="secondary" onClick={() => setPladsSvar("nej")}>Nej tak — giv den videre</HbButton>
          </div>
        )}
        {!pladsKort && sagtIkkeNu === null && !bekraefter && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {v.aftale && (
              <a href={v.aftale} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-hb-evergreen px-6 text-sm font-medium text-white hover:bg-hb-evergreen/90">
                Læs og underskriv
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {v.visIkkeNu && (
              <button type="button" onClick={() => setBekraefter(true)} className="text-sm font-medium text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline">
                Ikke nu — sæt på pause
              </button>
            )}
          </div>
        )}
        <p className="border-t border-hb-line pt-5 text-sm text-hb-ink-soft">Spørgsmål? Skriv til {KONTAKT_ADRESSE}.</p>
      </div>
    );
  }

  return (
    <div className={HB_RAMME}>
      <div className="mx-auto max-w-3xl">
        <p className="mb-10 text-center text-sm font-medium uppercase tracking-widest text-hb-ink-soft">The Boardroom</p>
        {indhold}
      </div>
    </div>
  );
};

export default AnsoegStatus;
