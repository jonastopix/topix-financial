import "@/styles/hjemmebane.css";
import { KONTAKT_ADRESSE, mailtoKontakt } from "@/lib/kontaktadresse";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import {
  alleIndgangsmuligheder,
  type Betalingsmodel,
  type Indgangsmulighed,
} from "@/lib/indgangspris";
import {
  afgoerKvittering,
  BETALT_PARAM,
  KVITTERING_GRAENSE_MS,
  KVITTERING_RETRY_MS,
  laesBetaltHint,
  skalHenteIgen,
} from "@/lib/betalKvittering";

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
    ikke i browserhistorikken.

    HJEMKOMSTEN FRA STRIPE (fund A, 14/9): success_url er
    /betal?token=…&betalt=1 (opret-indgangs-checkout:114). Stripe sender
    ansøgeren tilbage i samme øjeblik betalingen er gennemført, mens
    stripe-webhook, der skriver contract_end_date, fyrer selvstændigt. Før
    læste siden aldrig `betalt`, slog status op én gang og viste — når
    webhooken ikke var landet — betalingsskærmen IGEN med tre aktive knapper.
    Nu: er hintet sat, kvitterer siden straks, henter stille igen hvert
    KVITTERING_RETRY_MS i op til KVITTERING_GRAENSE_MS, og siger derefter
    ærligt at bekræftelsen mangler. Dommen «betalt» er stadig databasens
    alene — hintet vælger kun venteskærmen (src/lib/betalKvittering.ts).
    Forlæg: fornyelses-låsen i Index.tsx og FornyelseKvittering. */

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
  /** "YYYY-MM-DD" fra SQL'ens (underskrevet_at::date + 30)::text — kontraktens frist (rettet 2/9). */
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

// Kontaktadressen (14/9): kontakt@theboardroom.dk, ét sted — lib/kontaktadresse.ts.
const MAILTO = mailtoKontakt("The Boardroom — mit betalingslink");
/** Emnet når betalingen er gennemført, men bekræftelsen mangler — så mailen kan kendes fra linkspørgsmål. */
const MAILTO_BETALING = mailtoKontakt("The Boardroom — min betaling mangler bekræftelse");

/** Fælles ramme: samme ydre div som MembershipExpiredGate:148 — men
    min-h-screen-SAFE (dvh), ikke 100vh, som HB_RAMME (4/9, mobilens grønne
    bundstykke). Lærredet bag rammen males i Betal() nedenfor. */
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
      <a href={mailtoKontakt()} className="text-hb-evergreen hover:underline">
        {KONTAKT_ADRESSE}
      </a>
    </p>
  );
}

export default function Betal() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  // Hintet fra Stripes success_url. IKKE bevis for betaling (kan skrives i
  // adressefeltet) — det afgør kun hvilken venteskærm der vises, aldrig
  // dommen. Se betalKvittering.ts.
  const betaltHint = laesBetaltHint(searchParams.get(BETALT_PARAM));
  const [opslag, setOpslag] = useState<Opslag>({ tilstand: "henter" });
  // `stille`: hent igen UDEN at falde tilbage til spinneren — det de stille
  // gen-hentninger efter en betaling bruger. «Prøv igen»-knappen henter højt.
  const [forsoeg, setForsoeg] = useState({ n: 0, stille: false });
  const proevIgen = useCallback(() => setForsoeg((f) => ({ n: f.n + 1, stille: false })), []);
  const hentStille = useCallback(() => setForsoeg((f) => ({ n: f.n + 1, stille: true })), []);
  // Vinduet efter hjemkomsten: `overskredet` er STATE med sin egen timer —
  // ikke en beregning ved render (Index.tsx-lærdommen: rammer den sidste
  // hentning kort før grænsen, ville render aldrig regne igen, og skærmen
  // ville stå i «vi bekræfter» for evigt). `vindue` tæller op når «Tjek
  // igen» åbner et nyt vindue.
  const [overskredet, setOverskredet] = useState(false);
  const [vindue, setVindue] = useState(0);
  // Hvilken betalingsmodel der er ved at åbne Checkout — alle tre knapper
  // deaktiveres imens, så ét klik giver én session. Hook i topblokken, før
  // enhver betinget return (React #310-lærdommen).
  const [starter, setStarter] = useState<Betalingsmodel | null>(null);
  // Lærredet bag rammen er papir mens siden er mountet (4/9) — som Auth og
  // HbMemberShell. I Betal(), ikke i Ramme: Betal er mountet hele vejen,
  // Ramme skifter med tilstanden.
  useHbDokumentGrund();

  useEffect(() => {
    // Intet token i URL'en er samme udfald som et ukendt token: linket er
    // ufuldstændigt. Ingen grund til at spørge databasen.
    if (!token) {
      setOpslag({ tilstand: "ukendt" });
      return;
    }
    let aktiv = true;
    if (!forsoeg.stille) setOpslag({ tilstand: "henter" });
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

  // Kvitteringsdommen — ren i betalKvittering.ts. Status er SQL'ens fem
  // værdier når vi har et svar, ellers opslagets egen tilstand.
  const kvittering = afgoerKvittering({
    betaltHint,
    status: opslag.tilstand === "tilbud" ? opslag.tilbud.status : opslag.tilstand,
    overskredet,
  });

  // Vinduet lukker efter KVITTERING_GRAENSE_MS — kun med hint. Ryddes i
  // cleanup; et nyt `vindue` starter det forfra.
  useEffect(() => {
    if (!betaltHint) return;
    setOverskredet(false);
    const t = setTimeout(() => setOverskredet(true), KVITTERING_GRAENSE_MS);
    return () => clearTimeout(t);
  }, [betaltHint, vindue]);

  // Mens vi bekræfter: hent stille igen KVITTERING_RETRY_MS efter hvert svar
  // (ikke oven i et opslag der kører). Stopper af sig selv, når dommen
  // falder ('betalt' → «ingen») eller vinduet lukker («ubekraeftet»).
  // `opslag` i deps: hvert svar er et nyt objekt, også når status er uændret.
  useEffect(() => {
    if (!skalHenteIgen(kvittering) || opslag.tilstand === "henter") return;
    const t = setTimeout(hentStille, KVITTERING_RETRY_MS);
    return () => clearTimeout(t);
  }, [kvittering, opslag, hentStille]);

  const tjekIgen = useCallback(() => {
    setVindue((v) => v + 1);
    hentStille();
  }, [hentStille]);

  // ── 0a. Hjem fra Stripe, webhooken er ikke landet endnu — kvitteringen
  //        vises STRAKS, også mens første opslag kører (aldrig «Vi finder
  //        dit tilbud…» til én der lige har betalt). Ingen knapper: der er
  //        intet at gøre, og især ikke at betale igen. ────────────────────
  if (kvittering === "bekraefter") {
    return (
      <Ramme>
        <Overskrift
          titel="Tak — vi bekræfter din betaling"
          tekst="Stripe har modtaget den. Vi åbner din adgang om et øjeblik — siden opdaterer sig selv, du behøver ikke gøre noget."
        />
        <HbCard className="p-5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 shrink-0 text-hb-ink-soft animate-spin" />
            <p className="text-sm text-hb-ink-soft">Venter på den sidste bekræftelse…</p>
          </div>
        </HbCard>
        <SkrivTilOs />
      </Ramme>
    );
  }

  // ── 0b. Vinduet er lukket uden 'betalt'. Ansøgeren HAR betalt — Stripe
  //        sender kun til success_url efter en gennemført betaling, og
  //        pengene er taget. At vise betalingsknapperne her ville sige «du
  //        har ikke betalt» til én der har, og et klik ville åbne en ny
  //        Checkout. Så: sig hvad vi ved (betalingen er registreret hos
  //        Stripe), hvad vi ikke ved (vores bekræftelse mangler), og giv to
  //        udgange — Tjek igen (nyt vindue) og Skriv til os. Samme form som
  //        FornyelseKvitterings «Adgangen åbner snarest». En der selv skrev
  //        &betalt=1 uden at betale, ender også her — uden adgang, uden
  //        knapper, og kan fjerne parameteren og betale. ─────────────────
  if (kvittering === "ubekraeftet") {
    return (
      <Ramme>
        <Overskrift
          titel="Vi mangler den sidste bekræftelse"
          tekst="Betalingen er registreret hos Stripe, og du skal ikke betale igen. Beskeden til os tager længere end normalt — tjek igen om lidt, eller skriv til os, så åbner vi adgangen i hånden."
        />
        <HbCard className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <HbButton variant="primary" onClick={tjekIgen} className="w-full sm:flex-1">
              <RefreshCw className="h-4 w-4 shrink-0" />
              Tjek igen
            </HbButton>
            <HbButton
              variant="secondary"
              onClick={() => { window.location.href = MAILTO_BETALING; }}
              className="w-full sm:flex-1"
            >
              Skriv til os
              <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
            </HbButton>
          </div>
        </HbCard>
        <SkrivTilOs />
      </Ramme>
    );
  }

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
