import "@/styles/hjemmebane.css";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import {
  alleIndgangsmuligheder,
  type Betalingsmodel,
  type Indgangsmulighed,
} from "@/lib/indgangspris";

/** /betal?token=<uuid> — betalingssiden i indgangen (docs/indgangen-design.md
    §5, §12-§16). En person UDEN konto lander her fra dag 0-mailen og vælger
    én af tre betalingsmodeller. Ruten er uguardet (App.tsx); AuthProvider
    kalder ikke fetchUserData uden session, så siden koster intet.

    Datakilden er SQL-funktionen public.hent_betalingstilbud(betalingstoken
    uuid) — SECURITY DEFINER, tokenet som argument, aldrig et klientopslag
    i tabellen (samme mønster som lookup_invite_company_info). Svaret er
    json eller null; null = tokenet findes ikke.

    Standalone Hb-flade uden skal — samme ydre div og klasser som
    MembershipExpiredGate og FornyelseKvittering. Siden sætter BEVIDST ikke
    document.title: ingen side i appen gør det, og virksomhedsnavnet skal
    ikke i browserhistorikken. */

type Betalingsstatus =
  | "betalt"
  | "afventer_pris"
  | "klar_til_mail"
  | "afventer_betaling"
  | "frist_overskredet";

interface Betalingstilbud {
  status: Betalingsstatus;
  virksomhed: string | null;
  prisniveau_oere: number | null;
  /** "YYYY-MM-DD" fra SQL'ens (betalingsmail_sendt_at::date + 30)::text. */
  frist: string | null;
  dage_tilbage: number | null;
}

/* De fire udfald af opslaget holdes adskilt — især "ukendt" og "fejl".
   Et link der ikke virker og en database der ikke svarer er IKKE det
   samme: den der lige har fået en regning på 50.000 skal ikke tro at
   deres link er falsk, fordi vores server hostede. "ukendt" er et svar
   (null); "fejl" er fravær af svar (error fra rpc, eller en exception).
   Auth.tsx' opslag skelner ikke — det mønster er bevidst ikke kopieret. */
type Opslag =
  | { tilstand: "henter" }
  | { tilstand: "ukendt" }
  | { tilstand: "fejl" }
  | { tilstand: "tilbud"; tilbud: Betalingstilbud };

// Øre → dansk kronestreng. Hele beløb uden decimaler ("2.000"), skæve med
// to ("2.187,50") — ører må ikke forsvinde i formateringen.
// Kopieret fra MembershipExpiredGate.tsx, som ikke eksporterer den; de to
// bør samles i en delt hjælper (fx src/lib/beloeb.ts) senere.
function kr(oere: number): string {
  const kroner = oere / 100;
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: Number.isInteger(kroner) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(kroner);
}

function beskrivMulighed(m: Indgangsmulighed): string {
  switch (m.betalingsmodel) {
    case "fuld":
      return "Betal på én gang";
    case "rate2":
      return `2 rater à ${kr(m.rate_oere)} kr. — nu og om 6 måneder`;
    case "rate12":
      return `12 rater à ${kr(m.rate_oere)} kr. — i alt ${kr(m.samlet_oere)} kr.`;
  }
}

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** "2026-10-02" → "2. oktober 2026". Splitter selv frem for new Date(),
    så datoen ikke skifter med maskinens tidszone (nextStep.ts-mønstret). */
function formaterFrist(iso: string): string {
  const [aar, md, dag] = iso.split("-").map((s) => Number(s));
  if (!aar || !md || !dag || md < 1 || md > 12) return iso;
  return `${dag}. ${MAANEDER[md - 1]} ${aar}`;
}

const MAILTO = `mailto:jonas@topix.dk?subject=${encodeURIComponent("The Boardroom — mit betalingslink")}`;

/** Fælles ramme: samme ydre div som MembershipExpiredGate:148. */
function Ramme({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased px-4 py-12">
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
      <a href="mailto:jonas@topix.dk" className="text-hb-evergreen hover:underline">
        jonas@topix.dk
      </a>
    </p>
  );
}

export default function Betal() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [opslag, setOpslag] = useState<Opslag>({ tilstand: "henter" });
  const [forsoeg, setForsoeg] = useState(0);
  const proevIgen = useCallback(() => setForsoeg((n) => n + 1), []);
  // Hvilken betalingsmodel der er ved at åbne Checkout — alle tre knapper
  // deaktiveres imens, så ét klik giver én session. Hook i topblokken, før
  // enhver betinget return (React #310-lærdommen).
  const [starter, setStarter] = useState<Betalingsmodel | null>(null);

  useEffect(() => {
    // Intet token i URL'en er samme udfald som et ukendt token: linket er
    // ufuldstændigt. Ingen grund til at spørge databasen.
    if (!token) {
      setOpslag({ tilstand: "ukendt" });
      return;
    }
    let aktiv = true;
    setOpslag({ tilstand: "henter" });
    (async () => {
      try {
        // Funktionen er ikke i de genererede Supabase-typer endnu — samme
        // as-any-mønster som get_member_directory (memberProfile.ts).
        const { data, error } = await supabase.rpc("hent_betalingstilbud" as never, {
          betalingstoken: token,
        } as never);
        if (!aktiv) return;
        if (error) {
          console.error("[betal] hent_betalingstilbud fejlede:", error);
          setOpslag({ tilstand: "fejl" });
          return;
        }
        if (data === null || data === undefined) {
          setOpslag({ tilstand: "ukendt" });
          return;
        }
        setOpslag({ tilstand: "tilbud", tilbud: data as unknown as Betalingstilbud });
      } catch (e) {
        if (!aktiv) return;
        console.error("[betal] hent_betalingstilbud kastede:", e);
        setOpslag({ tilstand: "fejl" });
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [token, forsoeg]);

  // ── 1. Henter ──────────────────────────────────────────────────────────
  if (opslag.tilstand === "henter") {
    return (
      <Ramme>
        <Overskrift titel="Et øjeblik" />
        <HbCard className="p-5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 shrink-0 text-hb-ink-soft animate-spin" />
            <p className="text-sm text-hb-ink-soft">Vi finder dit tilbud…</p>
          </div>
        </HbCard>
      </Ramme>
    );
  }

  // ── 2. Intet token / ukendt token (ResetPassword.tsx:59-76-formen) ──────
  if (opslag.tilstand === "ukendt") {
    return (
      <Ramme>
        <Overskrift
          titel="Vi kan ikke finde det link"
          tekst="Linket er måske ufuldstændigt, eller det hører til noget der er afsluttet. Skriv til os, så finder vi ud af det sammen."
        />
        <HbCard className="p-5">
          <HbButton
            variant="secondary"
            onClick={() => { window.location.href = MAILTO; }}
            className="w-full justify-between text-left"
          >
            Skriv til os
            <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
          </HbButton>
        </HbCard>
        <SkrivTilOs />
      </Ramme>
    );
  }

  // ── 3. Kaldet fejlede — en ANDEN besked end nummer 2 (se Opslag) ────────
  if (opslag.tilstand === "fejl") {
    return (
      <Ramme>
        <Overskrift
          titel="Der gik noget galt"
          tekst="Vi kunne ikke hente dit tilbud lige nu. Det er ikke dit link — prøv igen om lidt."
        />
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

  const { tilbud } = opslag;

  // ── 4. Ikke klar endnu — afventer_pris og klar_til_mail slås BEVIDST
  //       sammen: set fra den besøgende er de det samme, og de skal ikke
  //       kunne aflæse hvor vores proces halter (§17, §19). ─────────────
  if (tilbud.status === "afventer_pris" || tilbud.status === "klar_til_mail") {
    return (
      <Ramme>
        <Overskrift
          titel="Linket er ikke klar endnu"
          tekst="Vi mangler at gøre noget i vores ende, før du kan betale. Du hører fra os — du behøver ikke gøre noget nu."
        />
        <SkrivTilOs />
      </Ramme>
    );
  }

  // ── 6. Fristen er passeret — aftalen bortfalder IKKE (§4) ───────────────
  if (tilbud.status === "frist_overskredet") {
    return (
      <Ramme>
        <Overskrift
          titel="Fristen er passeret"
          tekst="Vi har sendt en faktura på det fulde beløb, og pladsen står stadig klar til dig. Har du spørgsmål til fakturaen, så skriv til os."
        />
        <HbCard className="p-5">
          <HbButton
            variant="secondary"
            onClick={() => { window.location.href = MAILTO; }}
            className="w-full justify-between text-left"
          >
            Skriv til os
            <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
          </HbButton>
        </HbCard>
        <SkrivTilOs />
      </Ramme>
    );
  }

  // ── 7. Betalt — også hvad man ser ved at klikke linket igen bagefter ────
  if (tilbud.status === "betalt") {
    return (
      <Ramme>
        <Overskrift
          titel={tilbud.virksomhed ? `Tak — ${tilbud.virksomhed} er inde` : "Tak — du er inde"}
          tekst="Betalingen er modtaget. Du får en mail med dit login om et øjeblik."
        />
        <SkrivTilOs />
      </Ramme>
    );
  }

  // ── 5. Hovedskærmen: afventer_betaling ──────────────────────────────────
  const priser = alleIndgangsmuligheder(tilbud.prisniveau_oere);
  if (priser.ok === false) {
    // En datafejl en rådgiver skal opdage: prisniveauet på rækken matcher
    // ikke Stripe-kataloget. Den besøgende ser skærm 3, ikke et forkert tal.
    console.error(
      `[betal] alleIndgangsmuligheder fejlede for prisniveau_oere=${String(tilbud.prisniveau_oere)}: ${priser.grund} — ${priser.detalje}`,
    );
    return (
      <Ramme>
        <Overskrift
          titel="Der gik noget galt"
          tekst="Vi kunne ikke hente dit tilbud lige nu. Det er ikke dit link — prøv igen om lidt."
        />
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

  // Åbner Stripe Checkout via opret-indgangs-checkout: token + model i
  // body, alt andet udledes serverside (§5). Kaldet går med anon-nøglen —
  // funktionen har verify_jwt = false, og tokenet er legitimationen.
  // Fejl får en menneskelig besked, aldrig err.message: den der lige har
  // fået en regning på 50.000, skal ikke læse en teknisk fejltekst.
  const vaelg = async (betalingsmodel: Betalingsmodel) => {
    if (starter !== null) return;
    setStarter(betalingsmodel);
    const besked = "Vi kunne ikke åbne betalingen lige nu — prøv igen om lidt, eller skriv til os.";
    try {
      const { data, error } = await supabase.functions.invoke("opret-indgangs-checkout", {
        body: { token, betalingsmodel },
      });
      if (error || !data?.url) {
        console.error("[betal] opret-indgangs-checkout fejlede:", error ?? "intet url i svaret");
        toast.error(besked);
        setStarter(null);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      console.error("[betal] opret-indgangs-checkout kastede:", e);
      toast.error(besked);
      setStarter(null);
    }
  };

  const naerFrist = tilbud.dage_tilbage !== null && tilbud.dage_tilbage <= 7;

  return (
    <Ramme>
      <Overskrift
        titel={tilbud.virksomhed ? `Velkommen i The Boardroom, ${tilbud.virksomhed}` : "Velkommen i The Boardroom"}
        tekst="Vælg hvordan du vil betale."
      />

      <HbCard className="p-5">
        <div className="space-y-3">
          <p className="font-editorial text-4xl md:text-5xl font-medium text-hb-ink">
            {kr(priser.grundbeloeb_oere)}{" "}
            <span className="font-body text-base font-normal text-hb-ink-soft">kr. ekskl. moms</span>
          </p>
          {/* Ydelsen som tekst, ikke et kort — den forklarer beløbet, den
              konkurrerer ikke med det. */}
          <p className="text-sm text-hb-ink-soft">
            12 måneder med to rådgivere, løbende sparring og adgang til platformen.
          </p>
          {/* pt-3 oven i kortets space-y-3: beløbet er sidens svar og skal
              stå frit. ChevronRight, ikke ArrowRight: knapperne er et VALG
              mellem tre ligeværdige muligheder, ikke navigation fremad —
              nøjagtig som gatens betalingsknapper. */}
          <div className="space-y-2 pt-3">
            {priser.muligheder.map((m) => (
              <HbButton
                key={m.lookup_key}
                variant="secondary"
                onClick={() => vaelg(m.betalingsmodel)}
                disabled={starter !== null}
                className="w-full justify-between text-left"
              >
                {beskrivMulighed(m)}
                {starter === m.betalingsmodel ? (
                  <Loader2 className="h-4 w-4 shrink-0 text-hb-ink-soft animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
                )}
              </HbButton>
            ))}
          </div>
          {/* Fristen er ikke en fodnote: centreret, med luft og en hairline
              over, så den læses som en frist og ikke som en note. */}
          {(tilbud.frist || naerFrist) && (
            <div className="pt-4 mt-1 border-t border-hb-line text-center space-y-0.5">
              {tilbud.frist && (
                <p className="text-sm font-medium text-hb-ink">Betal inden {formaterFrist(tilbud.frist)}.</p>
              )}
              {naerFrist && (
                <p className="text-sm text-hb-ink-soft">
                  Der er {tilbud.dage_tilbage} {tilbud.dage_tilbage === 1 ? "dag" : "dage"} tilbage.
                </p>
              )}
            </div>
          )}
        </div>
      </HbCard>

      <SkrivTilOs />
    </Ramme>
  );
}
