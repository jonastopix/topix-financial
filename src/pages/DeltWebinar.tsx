import "@/styles/hjemmebane.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { WebinarVisning } from "@/components/hjemmebane/webinar/WebinarView";
import { AnnoncepriserVisning } from "@/components/hjemmebane/annoncer/AnnoncepriserAfsnit";
import type { WebinarDashboardSvar } from "@/lib/webinar/dashboard";
import type { Annoncepriser, HentningStatus, VindueValg } from "@/lib/webinar/annoncepriser";
import { TOKEN_PARAM } from "@/lib/webinar/deling";
import { formaterDanskTid } from "@/lib/revisionsspor";

/** /delt/webinar?t=<token> — /webinar delt med en ekstern (udkast 21/9-2026).
    En person UDEN konto ser ALT på /webinar og INTET andet: samme sektioner
    og tal, skrivebeskyttet, ingen skal, ingen navigation, ingen links ud.
    Uguardet rute som /aftale — ALLE kald går gennem edge-funktionen
    webinar-delt, som verificerer tokenet, logger visningen og svarer med det
    FÆRDIGE dashboard (aldrig en rå række). Periodevælgeren i prisafsnittet er
    et nyt kald med et andet `valg`. Ukendt, udløbet og lukket er ét og samme
    svar (403) — siden siger «Linket kendes ikke», grunden står i sporet. */

interface DeltSvar {
  ok: true;
  udloeber_at: string;
  nu: string;
  dashboard: WebinarDashboardSvar;
  priser: Annoncepriser;
  hentning: HentningStatus | null;
  valg: VindueValg;
}

type Opslag =
  | { tilstand: "henter" }
  | { tilstand: "ukendt" }
  | { tilstand: "fejl" }
  | { tilstand: "klar"; svar: DeltSvar };

async function statusAf(error: unknown): Promise<number | null> {
  const ctx = (error as { context?: Response } | null)?.context;
  return ctx?.status ?? null;
}

function Ramme({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-hjemmebane min-h-screen-safe bg-hb-paper font-body text-hb-ink antialiased" data-delt-webinar>
      {children}
    </div>
  );
}

function Besked({ titel, tekst }: { titel: string; tekst: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-center space-y-3">
      <p className="text-sm uppercase tracking-widest text-hb-rust font-medium">The Boardroom</p>
      <h1 className="font-editorial text-3xl md:text-4xl font-medium leading-tight text-hb-ink">{titel}</h1>
      <p className="text-hb-ink-soft max-w-lg mx-auto">{tekst}</p>
    </div>
  );
}

export default function DeltWebinar() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get(TOKEN_PARAM) || "").trim();
  const [valg, setValg] = useState<VindueValg>("daekning");
  const [opslag, setOpslag] = useState<Opslag>({ tilstand: "henter" });
  const [priserHenter, setPriserHenter] = useState(false);
  useHbDokumentGrund();

  useEffect(() => {
    if (!token) {
      setOpslag({ tilstand: "ukendt" });
      return;
    }
    let aktiv = true;
    // Første hentning viser skelettet; et nyt `valg` henter igen, men beholder tallene på skærmen imens.
    setOpslag((o) => (o.tilstand === "klar" ? o : { tilstand: "henter" }));
    setPriserHenter(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("webinar-delt", { body: { t: token, valg } });
      if (!aktiv) return;
      setPriserHenter(false);
      if (error) {
        setOpslag((await statusAf(error)) === 403 ? { tilstand: "ukendt" } : { tilstand: "fejl" });
        return;
      }
      setOpslag({ tilstand: "klar", svar: data as DeltSvar });
    })();
    return () => {
      aktiv = false;
    };
  }, [token, valg]);

  if (opslag.tilstand === "ukendt") {
    return (
      <Ramme>
        <Besked titel="Linket kendes ikke" tekst="Tjek at hele linket kom med. Er det udløbet eller lukket, kan den, der sendte det, lave et nyt." />
      </Ramme>
    );
  }
  if (opslag.tilstand === "fejl") {
    return (
      <Ramme>
        <Besked titel="Der gik noget galt" tekst="Tallene kunne ikke hentes lige nu. Det er ikke dit link — prøv igen om lidt." />
      </Ramme>
    );
  }

  const svar = opslag.tilstand === "klar" ? opslag.svar : null;
  return (
    <Ramme>
      <div className="mx-auto max-w-5xl px-4 pt-6 md:px-6">
        <HbCard className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-xs text-hb-ink-soft" data-delt-info>
          <span>
            <span className="font-medium uppercase tracking-[0.12em] text-hb-rust">Delt visning</span> · skrivebeskyttet
            {svar ? ` · hentet ${formaterDanskTid(svar.nu)}` : ""}
          </span>
          {svar && <span>Linket gælder til {formaterDanskTid(svar.udloeber_at)}</span>}
        </HbCard>
      </div>
      <WebinarVisning
        tilstand={svar ? "klar" : "henter"}
        dom={svar?.dashboard ?? null}
        priser={
          svar ? (
            <div className="relative" data-delt-priser={priserHenter ? "henter" : "klar"}>
              {priserHenter && <Loader2 className="absolute right-0 top-0 h-4 w-4 animate-spin text-hb-ink-soft" aria-label="Henter perioden" />}
              <AnnoncepriserVisning dom={svar.priser} hentningStatus={svar.hentning} valg={svar.valg} onValg={setValg} nu={new Date(svar.nu)} />
            </div>
          ) : null
        }
      />
    </Ramme>
  );
}
