import "@/styles/hjemmebane.css";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KONTAKT_ADRESSE, mailtoKontakt } from "@/lib/kontaktadresse";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { AftaleDokument } from "@/components/hjemmebane/AftaleDokument";
import { HbField, HbInput } from "@/components/hjemmebane/admin/HbField";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { afgoerKnap, kodeHjaelp, tolkFejl, type FunktionsFejl } from "@/lib/aftaleSide";
import { formaterAftryk } from "@/lib/aftryk";
import { formaterDanskTid } from "@/lib/revisionsspor";

/** /aftale?token=<uuid> — underskriftssiden (UDKAST 18/9). En person UDEN
    konto lander her fra linkmailen og LÆSER aftalegrundlaget på siden (ikke
    som en fil), skriver sit navn, sætter kryds ved «Jeg har læst
    aftalegrundlaget og accepterer det», taster koden fra mailen og trykker
    «Underskriv». NAVNET OG KRYDSET ER UNDERSKRIFTEN; koden beviser hvem;
    sporet beviser hvornår.

    Forlæg: src/pages/Betal.tsx (uguardet rute, standalone Hb-flade,
    useHbDokumentGrund, samme Ramme/Overskrift/SkrivTilOs). Forskellen:
    ALLE kald går gennem edge-funktionen aftale-underskrift (ingen anon-RPC),
    fordi hvert opslag skal logges i sporet med IP og browser — og fordi
    funktionen dømmer tilstanden (kan_underskrives / underskrevet / udloebet /
    annulleret) med grunden, som siden viser som fire forskellige skærme.

    Dommene er rene (src/lib/aftaleSide.ts, src/lib/underskriftDom.ts). */

type Tilstand = "kan_underskrives" | "underskrevet" | "udloebet" | "annulleret" | "ugyldig";

interface AftaleSvar {
  tilstand: Tilstand;
  virksomhed: string | null;
  cvr: string | null;
  titel: string;
  tekst: string | null;
  aftryk: string;
  email_hint: string;
  udloeber_at: string | null;
  dage_tilbage: number | null;
  udloeb_at: string | null;
  underskrevet_at: string | null;
  underskrevet_navn: string | null;
  underskrevet_tid: string | null;
  dokument_klar: boolean;
  kode_gyldig_minutter: number;
  kode_max_forsoeg: number;
}

type Opslag =
  | { tilstand: "henter" }
  | { tilstand: "ukendt" }
  | { tilstand: "fejl" }
  | { tilstand: "aftale"; aftale: AftaleSvar };

const MAILTO = mailtoKontakt("The Boardroom — mit aftalegrundlag");

async function laesFejl(error: unknown): Promise<FunktionsFejl> {
  const ctx = (error as { context?: Response } | null)?.context;
  let status: number | null = null;
  let body: Record<string, unknown> | null = null;
  try {
    status = ctx?.status ?? null;
    const t = await ctx?.text();
    body = t ? (JSON.parse(t) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { status, body };
}

async function kald(body: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; fejl: FunktionsFejl | null }> {
  const { data, error } = await supabase.functions.invoke("aftale-underskrift", { body });
  if (error) return { data: null, fejl: await laesFejl(error) };
  return { data: (data as Record<string, unknown>) ?? null, fejl: null };
}

function Ramme({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-hjemmebane min-h-screen-safe bg-hb-paper font-body text-hb-ink antialiased px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">{children}</div>
    </div>
  );
}

function Overskrift({ titel, tekst }: { titel: string; tekst?: string }) {
  return (
    <div className="text-center space-y-3">
      <p className="text-sm uppercase tracking-widest text-hb-rust font-medium">The Boardroom</p>
      <h1 className="font-editorial text-3xl md:text-4xl font-medium leading-tight text-hb-ink">{titel}</h1>
      {tekst && <p className="text-hb-ink-soft max-w-lg mx-auto">{tekst}</p>}
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

/** Aftalegrundlaget som læsbar tekst — afsnit for afsnit, ingen fil. */
function Dokument({ titel, tekst }: { titel: string; tekst: string }) {
  return (
    <HbCard className="p-6 md:p-8">
      <h2 className="font-editorial text-xl font-medium text-hb-ink mb-4">{titel}</h2>
      {/* Markdown → struktur uden HTML fra data (aftaleMarkdown.ts). Samme visning som rådgiverens forhåndsvisning. */}
      <AftaleDokument tekst={tekst} />
    </HbCard>
  );
}

export default function Aftale() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [opslag, setOpslag] = useState<Opslag>({ tilstand: "henter" });
  const [forsoeg, setForsoeg] = useState(0);
  const proevIgen = useCallback(() => setForsoeg((n) => n + 1), []);
  // Formularens tilstand — hooks i topblokken, før enhver betinget return.
  const [navn, setNavn] = useState("");
  const [accepteret, setAccepteret] = useState(false);
  const [kode, setKode] = useState("");
  const [kodeBestilt, setKodeBestilt] = useState(false);
  const [arbejder, setArbejder] = useState<"kode" | "underskriv" | "dokument" | null>(null);
  const [fejl, setFejl] = useState<string | null>(null);
  const [kvittering, setKvittering] = useState<{ navn: string; tid: string; aftryk: string } | null>(null);
  useHbDokumentGrund();

  useEffect(() => {
    if (!token) {
      setOpslag({ tilstand: "ukendt" });
      return;
    }
    let aktiv = true;
    setOpslag({ tilstand: "henter" });
    (async () => {
      const { data, fejl: f } = await kald({ token, handling: "hent" });
      if (!aktiv) return;
      if (f) {
        setOpslag(f.status === 403 ? { tilstand: "ukendt" } : { tilstand: "fejl" });
        return;
      }
      setOpslag({ tilstand: "aftale", aftale: data as unknown as AftaleSvar });
    })();
    return () => {
      aktiv = false;
    };
  }, [token, forsoeg]);

  const sendKode = async () => {
    setFejl(null);
    setArbejder("kode");
    try {
      const { fejl: f } = await kald({ token, handling: "send_kode" });
      if (f) {
        setFejl(tolkFejl(f));
        return;
      }
      setKodeBestilt(true);
      setKode("");
    } finally {
      setArbejder(null);
    }
  };

  const underskriv = async () => {
    setFejl(null);
    setArbejder("underskriv");
    try {
      const { data, fejl: f } = await kald({ token, handling: "underskriv", navn, accepteret, kode });
      if (f) {
        setFejl(tolkFejl(f));
        if (f.body?.error === "kode_laast" || f.body?.error === "kode_ugyldig") setKodeBestilt(false);
        return;
      }
      setKvittering({
        navn: String(data?.navn ?? navn),
        tid: String(data?.underskrevet_tid ?? ""),
        aftryk: String(data?.aftryk ?? ""),
      });
    } finally {
      setArbejder(null);
    }
  };

  const hentDokument = async () => {
    setFejl(null);
    setArbejder("dokument");
    try {
      const { data, fejl: f } = await kald({ token, handling: "hent_dokument" });
      if (f) {
        setFejl(f.body?.error === "dokument_ikke_klar" ? "Dokumentet er ved at blive lavet — prøv igen om et øjeblik." : tolkFejl(f));
        return;
      }
      const url = typeof data?.url === "string" ? data.url : null;
      if (url) window.location.href = url;
    } finally {
      setArbejder(null);
    }
  };

  // ── 1. Henter ──
  if (opslag.tilstand === "henter") {
    return (
      <Ramme>
        <Overskrift titel="Et øjeblik" />
        <HbCard className="p-5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 shrink-0 text-hb-ink-soft animate-spin" />
            <p className="text-sm text-hb-ink-soft">Vi finder aftalegrundlaget…</p>
          </div>
        </HbCard>
      </Ramme>
    );
  }

  // ── 2. Ukendt link ──
  if (opslag.tilstand === "ukendt") {
    return (
      <Ramme>
        <Overskrift titel="Linket kendes ikke" tekst="Tjek at hele linket fra mailen kom med. Er du i tvivl, så skriv til os." />
        <SkrivTilOs />
      </Ramme>
    );
  }

  // ── 3. Fejl (ikke det samme som ukendt) ──
  if (opslag.tilstand === "fejl") {
    return (
      <Ramme>
        <Overskrift titel="Der gik noget galt" tekst="Vi kunne ikke hente aftalegrundlaget lige nu. Det er ikke dit link — prøv igen om lidt." />
        <HbCard className="p-5">
          <HbButton variant="primary" onClick={proevIgen} className="w-full">
            <RefreshCw className="h-4 w-4 shrink-0" />
            Prøv igen
          </HbButton>
        </HbCard>
        <SkrivTilOs />
      </Ramme>
    );
  }

  const a = opslag.aftale;

  // ── 4. Lige underskrevet (kvitteringen) eller underskrevet tidligere ──
  if (kvittering || a.tilstand === "underskrevet") {
    const navnVist = kvittering?.navn ?? a.underskrevet_navn ?? "";
    const tidVist = kvittering?.tid ?? a.underskrevet_tid ?? (a.underskrevet_at ? formaterDanskTid(a.underskrevet_at) : "");
    const aftrykVist = kvittering?.aftryk ?? a.aftryk;
    return (
      <Ramme>
        <Overskrift
          titel="Tak — aftalegrundlaget er underskrevet"
          tekst={`Underskrevet af ${navnVist} den ${tidVist}. Du får en kvittering på mail med et link til dokumentet.`}
        />
        <HbCard className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-hb-evergreen mt-0.5" />
            <div className="text-sm text-hb-ink-soft space-y-1">
              <p>{a.virksomhed ? `${a.virksomhed}${a.cvr ? ` · CVR ${a.cvr}` : ""}` : a.titel}</p>
              <p className="font-mono text-xs break-all">Aftryk (SHA-256): {formaterAftryk(aftrykVist)}</p>
            </div>
          </div>
          <HbButton variant="primary" onClick={() => void hentDokument()} disabled={arbejder !== null} className="w-full">
            {arbejder === "dokument" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Download className="h-4 w-4 shrink-0" />}
            Hent det underskrevne dokument
          </HbButton>
          {fejl && <p className="text-sm text-hb-rust">{fejl}</p>}
          <p className="text-sm text-hb-ink-soft">Næste skridt kommer i en mail for sig: betalingen, som åbner adgangen til platformen.</p>
        </HbCard>
        <SkrivTilOs />
      </Ramme>
    );
  }

  // ── 5. Udløbet / annulleret / ugyldig ──
  if (a.tilstand !== "kan_underskrives") {
    const tekst =
      a.tilstand === "udloebet"
        ? `Linket udløb ${a.udloeb_at ? formaterDanskTid(a.udloeb_at) : ""}. Skriv til os, så sender vi et nyt.`
        : a.tilstand === "annulleret"
          ? "Denne udgave af aftalegrundlaget er trukket tilbage. Har du fået et nyere link, så brug det — ellers skriv til os."
          : "Aftalen kan ikke vises. Skriv til os.";
    return (
      <Ramme>
        <Overskrift titel="Aftalen kan ikke underskrives her" tekst={tekst} />
        <HbCard className="p-5">
          <HbButton variant="secondary" onClick={() => { window.location.href = MAILTO; }} className="w-full">
            Skriv til os
            <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
          </HbButton>
        </HbCard>
      </Ramme>
    );
  }

  // ── 6. Kan underskrives — dokumentet, så formularen ──
  const knap = afgoerKnap({ navn, accepteret, kode, kodeBestilt, arbejder: arbejder !== null });
  return (
    <Ramme>
      <Overskrift
        titel="Aftalegrundlag til underskrift"
        tekst={`${a.virksomhed ?? ""}${a.cvr ? ` · CVR ${a.cvr}` : ""}. Læs teksten herunder, og skriv under nederst på siden. Linket gælder ${a.dage_tilbage} ${a.dage_tilbage === 1 ? "dag" : "dage"} endnu.`}
      />
      <Dokument titel={a.titel} tekst={a.tekst ?? ""} />
      <HbCard className="p-6 space-y-5">
        <h2 className="font-editorial text-xl font-medium text-hb-ink">Underskriv</h2>
        <HbField label="Dit fulde navn" htmlFor="aftale-navn" help="Navnet er din underskrift.">
          <HbInput id="aftale-navn" value={navn} onChange={(e) => setNavn(e.target.value)} autoComplete="name" disabled={arbejder !== null} />
        </HbField>
        <label className="flex items-start gap-3 text-sm text-hb-ink cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-hb-evergreen"
            checked={accepteret}
            onChange={(e) => setAccepteret(e.target.checked)}
            disabled={arbejder !== null}
          />
          <span>Jeg har læst aftalegrundlaget og accepterer det.</span>
        </label>
        <HbField label="Kode fra mailen" htmlFor="aftale-kode" help={kodeHjaelp(a.email_hint, a.kode_gyldig_minutter, kodeBestilt)}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <HbInput
              id="aftale-kode"
              value={kode}
              onChange={(e) => setKode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 cifre"
              disabled={arbejder !== null || !kodeBestilt}
              className="sm:flex-1"
            />
            <HbButton type="button" variant="secondary" onClick={() => void sendKode()} disabled={arbejder !== null} className="w-full sm:w-auto">
              {arbejder === "kode" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
              {kodeBestilt ? "Send ny kode" : "Send kode"}
            </HbButton>
          </div>
        </HbField>
        {fejl && <p className="text-sm text-hb-rust">{fejl}</p>}
        <HbButton variant="primary" onClick={() => void underskriv()} disabled={!knap.ok} className="w-full">
          {arbejder === "underskriv" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
          Underskriv
        </HbButton>
        <p className="text-xs text-hb-ink-soft font-mono break-all">Dokumentets aftryk (SHA-256): {formaterAftryk(a.aftryk)}</p>
      </HbCard>
      <SkrivTilOs />
    </Ramme>
  );
}
