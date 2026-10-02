import "@/styles/hjemmebane.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KONTAKT_ADRESSE, mailtoKontakt } from "@/lib/kontaktadresse";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbField, HbInput } from "@/components/hjemmebane/admin/HbField";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { afgoerRingKnap, RING_TEKST, tolkRingFejl, type RingOpslag } from "@/lib/opkald/side";
import { normaliserTelefon, OPBEVARING_DAGE, SAMTYKKE_ORDLYD } from "@/lib/opkald/dom";

/** /ring-mig-op?t=<token> — «Må vi ringe til dig?» (2/10-2026,
    docs/samtykke-og-opkald.md del 2). En webinarDELTAGER uden konto lander
    her fra Klaviyos «Deltog»-mail. Uguardet rute som /aftale — ALLE kald går
    gennem edge-funktionen ring-mig-op, som verificerer tokenet og dømmer, om
    tilmeldingen deltog. Én skærm, mobil først: navn (forudfyldt), telefon,
    ÉT TOMT kryds med ordlyden fra opkaldDom.SAMTYKKE_ORDLYD, knappen «Ring
    mig op», kvittering PÅ SIDEN — ingen kvitteringsmail (overmailing).
    Ukendt token, udløbet link (sessionen + 30 dage) og «deltog ikke» er ét og
    samme svar (403). En ÅBEN anmodning vises som «Du har allerede bedt om et
    opkald» uden formular — den kan ikke ændres via linket. */

type Tilstand =
  | { art: "henter" }
  | { art: "ukendt" }
  | { art: "fejl" }
  | { art: "klar"; opslag: RingOpslag }
  | { art: "sendt" };

const MAILTO = mailtoKontakt("The Boardroom — ring mig op");

async function kald(body: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; status: number | null }> {
  const { data, error } = await supabase.functions.invoke("ring-mig-op", { body });
  if (error) {
    const ctx = (error as { context?: Response } | null)?.context;
    // Svarets krop bærer «grund» (fx for_snart) — læst fail-soft; uden den falder teksten tilbage på status.
    let krop: Record<string, unknown> | null = null;
    try {
      krop = ctx ? ((await ctx.clone().json()) as Record<string, unknown>) : null;
    } catch {
      krop = null;
    }
    return { data: krop, status: ctx?.status ?? null };
  }
  return { data: (data as Record<string, unknown>) ?? null, status: 200 };
}

function Ramme({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-hjemmebane min-h-screen-safe bg-hb-paper font-body text-hb-ink antialiased px-4 py-10 md:py-14" data-ring-mig-op>
      <div className="mx-auto max-w-lg space-y-8">{children}</div>
    </div>
  );
}

function Overskrift({ titel, tekst }: { titel: string; tekst?: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-hb-rust">The Boardroom</p>
      <h1 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">{titel}</h1>
      {tekst && <p className="mx-auto max-w-md text-hb-ink-soft">{tekst}</p>}
    </div>
  );
}

function SkrivTilOs() {
  return (
    <p className="text-center text-sm text-hb-ink-soft">
      Spørgsmål? Skriv til{" "}
      <a href={MAILTO} className="text-hb-evergreen hover:underline">
        {KONTAKT_ADRESSE}
      </a>
    </p>
  );
}

export default function RingMigOp() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("t") || "").trim();
  const [tilstand, setTilstand] = useState<Tilstand>({ art: "henter" });
  const [navn, setNavn] = useState("");
  const [telefon, setTelefon] = useState("");
  // TOMT som standard — et forhåndsafkrydset felt er ikke et samtykke (spamvejledningen kap. 7.3).
  const [kryds, setKryds] = useState(false);
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);
  useHbDokumentGrund();

  useEffect(() => {
    if (!token) {
      setTilstand({ art: "ukendt" });
      return;
    }
    let aktiv = true;
    (async () => {
      const { data, status } = await kald({ t: token, handling: "opslag" });
      if (!aktiv) return;
      if (!data || status !== 200) {
        setTilstand(status === 403 ? { art: "ukendt" } : { art: "fejl" });
        return;
      }
      const opslag: RingOpslag = {
        navn: typeof data.navn === "string" ? data.navn : "",
        session_tid: typeof data.session_tid === "string" ? data.session_tid : null,
        har_anmodet: data.har_anmodet === true,
      };
      setNavn(opslag.navn);
      setTilstand({ art: "klar", opslag });
    })();
    return () => {
      aktiv = false;
    };
  }, [token]);

  const send = async () => {
    setFejl(null);
    setArbejder(true);
    try {
      const { data, status } = await kald({
        t: token,
        handling: "indsend",
        navn,
        telefon,
        // Ordlyden sendes med, PRÆCIS som den stod ved krydset — det er den, der gemmes.
        samtykke: { kryds, ordlyd: SAMTYKKE_ORDLYD },
      });
      if (status === 200 && data?.ok === true) {
        setTilstand({ art: "sendt" });
        return;
      }
      if (status === 409 && tilstand.art === "klar") {
        // En åben anmodning fandtes — siden viser det i stedet for formularen.
        setTilstand({ art: "klar", opslag: { ...tilstand.opslag, har_anmodet: true } });
        return;
      }
      setFejl(tolkRingFejl(status, data));
    } finally {
      setArbejder(false);
    }
  };

  if (tilstand.art === "henter") {
    return (
      <Ramme>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-hb-ink-soft" />
        </div>
      </Ramme>
    );
  }
  if (tilstand.art === "ukendt") {
    return (
      <Ramme>
        <Overskrift titel={RING_TEKST.ukendtTitel} tekst={RING_TEKST.ukendtTekst} />
        <SkrivTilOs />
      </Ramme>
    );
  }
  if (tilstand.art === "fejl") {
    return (
      <Ramme>
        <Overskrift titel={RING_TEKST.fejlTitel} tekst={RING_TEKST.fejlTekst} />
        <SkrivTilOs />
      </Ramme>
    );
  }
  if (tilstand.art === "sendt") {
    return (
      <Ramme>
        <HbCard className="space-y-4 p-6 text-center" data-ring-kvittering>
          <CheckCircle2 className="mx-auto h-8 w-8 text-hb-evergreen" />
          <h1 className="font-editorial text-2xl font-medium text-hb-ink">{RING_TEKST.takTitel}</h1>
          <p className="text-hb-ink-soft">{RING_TEKST.takTekst}</p>
        </HbCard>
        <SkrivTilOs />
      </Ramme>
    );
  }

  if (tilstand.opslag.har_anmodet) {
    // En ÅBEN anmodning kan ikke ændres herfra (rådets fund 2/10, punkt 3) — ingen formular.
    return (
      <Ramme>
        <Overskrift titel={RING_TEKST.harAnmodetTitel} tekst={RING_TEKST.harAnmodet} />
        <SkrivTilOs />
      </Ramme>
    );
  }

  const knap = afgoerRingKnap({ navn, telefonOk: normaliserTelefon(telefon) !== null, kryds, arbejder });
  return (
    <Ramme>
      <Overskrift titel={RING_TEKST.titel} tekst={RING_TEKST.indledning} />
      <HbCard className="space-y-5 p-6">
        <HbField label="Dit navn" htmlFor="ring-navn">
          <HbInput id="ring-navn" value={navn} onChange={(e) => setNavn(e.target.value)} autoComplete="name" maxLength={80} disabled={arbejder} />
        </HbField>
        <HbField label="Dit telefonnummer" htmlFor="ring-telefon" help={RING_TEKST.telefonHjaelp}>
          <HbInput
            id="ring-telefon"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="12 34 56 78"
            disabled={arbejder}
          />
        </HbField>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-hb-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-hb-evergreen"
            checked={kryds}
            onChange={(e) => setKryds(e.target.checked)}
            disabled={arbejder}
            data-ring-samtykke
          />
          <span>{SAMTYKKE_ORDLYD}</span>
        </label>
        <p className="text-xs leading-relaxed text-hb-ink-soft">{RING_TEKST.samtykkeForklaring(OPBEVARING_DAGE)}</p>
        {fejl && <p className="text-sm text-hb-rust">{fejl}</p>}
        <HbButton variant="primary" onClick={() => void send()} disabled={!knap.ok} className="w-full">
          {arbejder ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
          {RING_TEKST.knap}
        </HbButton>
      </HbCard>
      <SkrivTilOs />
    </Ramme>
  );
}
