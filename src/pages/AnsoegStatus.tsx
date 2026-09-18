import "@/styles/hjemmebane.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW, HB_H1, HB_RAMME } from "@/components/hjemmebane/hbFormKlasser";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";
import { AnsoegningsFejl, hentStatus, sigIkkeNu, type StatusSvar } from "@/lib/ansoegning/api";
import { afgoerStatus, danskDato } from "@/lib/ansoegning/status";
import { TOKEN_PARAM } from "@/lib/ansoegning/skema";

/** /ansoeg/status?t=<token>[&handling=ikke_nu] — ansøgerens egen side EFTER
    indsendelse (18/9, flow-gennemgangen §1/§10). Linket står i alle rykkermails
    («Se din ansøgning») og i «ikke nu»-linjen. Uguardet som /ansoeg; tokenet er
    legitimationen (A's ansoegning-link: verifyAnsoegningslink, fasen indsendt).
    Lille med vilje (Jonas): hvad der sker nu, hvad vi venter på, og to knapper —
    «Book samtalen med Jonas» når de er indkaldt, og «Ikke nu». Kommer man med
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
  const [sender, setSender] = useState(false);
  const [sagtIkkeNu, setSagtIkkeNu] = useState<string | null>(null);

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
  }, [token]);

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
    indhold = (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="space-y-3">
          <p className={HB_EYEBROW}>{tilstand.svar.virksomhedsnavn}</p>
          <h1 className={HB_H1}>{sagtIkkeNu !== null ? "Vi holder pause" : v.titel}</h1>
          <p className="text-base leading-relaxed text-hb-ink-soft">
            {sagtIkkeNu !== null
              ? `Tak for besked. Vi skriver ikke til dig${sagtIkkeNu ? ` før ${danskDato(sagtIkkeNu)}` : " de næste tre måneder"} — og gerne før, hvis du selv siger til.`
              : v.tekst}
          </p>
        </div>
        {sagtIkkeNu === null && bekraefter && v.visIkkeNu && (
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
        {sagtIkkeNu === null && !bekraefter && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {v.book && (
              <a href={v.book} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-hb-evergreen px-6 text-sm font-medium text-white hover:bg-hb-evergreen/90">
                Book samtalen med Jonas
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
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
