import "@/styles/hjemmebane.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { HB_RAMME } from "@/components/hjemmebane/hbFormKlasser";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { AnsoegIntro } from "@/components/ansoegning/AnsoegIntro";
import { AnsoegFremdrift } from "@/components/ansoegning/AnsoegFremdrift";
import { AnsoegSkaerm, type CvrTilstand } from "@/components/ansoegning/AnsoegSkaerm";
import { AnsoegMellemstykke } from "@/components/ansoegning/AnsoegMellemstykke";
import { AnsoegKvittering } from "@/components/ansoegning/AnsoegKvittering";
import {
  type KvitteringsUdfald,
  AnsoegningsFejl,
  gemSvar,
  hentAnsoegning,
  indsendAnsoegning,
  opretAnsoegning,
  slaaCvrOp,
} from "@/lib/ansoegning/api";
import { gemLokaltToken, glemLokaltToken, laesLokaltToken } from "@/lib/ansoegning/lokalt";
import { type Mellemstykke, mellemstykkeEfter } from "@/lib/ansoegning/mellemstykker";
import {
  afgoerFremdrift,
  afgoerKilde,
  type AnsoegningsSvar,
  type CvrVisning,
  type FeltId,
  HJEMMESIDE_INGEN,
  KILDE_PARAM,
  laesAnnoncespor,
  laesGa,
  SKAERME,
  TOKEN_PARAM,
  TOMME_SVAR,
  ansatteTekst,
  validerFelt,
} from "@/lib/ansoegning/skema";
import { CVR_NAVN_FEJL, GENOPTAG } from "@/lib/ansoegning/spoergsmaal";

/** /ansoeg — ansøgningsformularen (udkast 18/9-2026, README i
    ~/Downloads/udkast-ansoegning-formular). Erstatter superform.spot-nik.com.

    EN PERSON UDEN KONTO, på en telefon, om aftenen. Ruten er uguardet som
    /betal; AuthProvider kalder ikke fetchUserData uden session, så siden
    koster intet. Standalone Hb-flade uden skal (HB_RAMME + useHbDokumentGrund),
    men mere åben og salgsagtig end fladerne indeni.

    ÉT SPØRGSMÅL AD GANGEN. Elleve skærme (SKAERME i lib/ansoegning/skema.ts),
    fremdriften er skema.ts' dom over de gemte svar — ikke skærmindekset.
    Mellem grupperne tre brudstykker om hvad The Boardroom er
    (lib/ansoegning/mellemstykker.ts).

    GEM UNDERVEJS. Første «Næste» opretter rækken (ansoegning-gem «opret»)
    og udleverer et token, som lægges i URL'en (?t=) og localStorage. Hvert
    senere «Næste» gemmer skærmens felter («gem»). Åbnes siden med ?t= —
    fra påmindelsesmailen eller et bogmærke — hentes svarene, og formularen
    springer til første ubesvarede skærm. Ingen konto, intet login: tokenet
    ER legitimationen (_shared/ansoegningToken.ts).

    CVR. Nummeret slås op (ansoegning-cvr) og vises tilbage som en sætning:
    «Nordic Byg ApS, stiftet 2019, 10–19 ansatte. Rigtigt?». «Ja» bekræfter
    og udfylder hjemmeside + ansatte-hint fra registret; «Nej» retter.
    Findes nummeret ikke, eller er opslaget utilgængeligt, kan ansøgeren
    fortsætte — nummeret gemmes som tastet, og rådgiveren slår op bagefter.

    KILDEN (webinar, anbefaling, linkedin, direkte, andet) afgøres én gang
    ved oprettelsen af ?kilde=, ?utm_source= eller document.referrer
    (afgoerKilde) og sendes med «opret». */

type Fase =
  | { slags: "starter" }
  | { slags: "intro"; genoptager: boolean }
  | { slags: "skema"; velkommenTilbage: boolean }
  | { slags: "mellem"; stykke: Mellemstykke; naesteSkaerm: number }
  | { slags: "kvittering"; udgave: "sendt" | "allerede"; mail?: KvitteringsUdfald };

type Kladde = Partial<Record<FeltId, string>>;

/** Svar → kladde: tal og valg som strenge, null som tomt. */
function kladdeAf(svar: AnsoegningsSvar): Kladde {
  const k: Kladde = {};
  for (const id of Object.keys(svar) as FeltId[]) {
    const v = svar[id];
    if (v === null || v === undefined) continue;
    k[id] = String(v);
  }
  return k;
}

const Ansoeg = () => {
  useHbDokumentGrund();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fase, setFase] = useState<Fase>({ slags: "starter" });
  const [skaerm, setSkaerm] = useState(0);
  const [svar, setSvar] = useState<AnsoegningsSvar>(TOMME_SVAR);
  const [kladde, setKladde] = useState<Kladde>({});
  const [fejl, setFejl] = useState<Partial<Record<FeltId, string>>>({});
  const [token, setToken] = useState<string | null>(null);
  const [gemmer, setGemmer] = useState(false);
  const [gemt, setGemt] = useState(false);
  const [cvr, setCvr] = useState<CvrTilstand>({ slags: "tom" });
  const [cvrOpslag, setCvrOpslag] = useState<(CvrVisning & { cvr: string }) | null>(null);
  const [cvrBekraeftet, setCvrBekraeftet] = useState(false);
  const [honning, setHonning] = useState("");
  const [virksomhedsnavn, setVirksomhedsnavn] = useState("");
  const [virksomhedsnavnFejl, setVirksomhedsnavnFejl] = useState<string | null>(null);

  // Kilden afgøres én gang, af den URL siden blev åbnet med — før ?t= erstatter den.
  const kilde = useRef(
    afgoerKilde({
      kilde: searchParams.get(KILDE_PARAM),
      utmSource: searchParams.get("utm_source"),
      referrer: typeof document !== "undefined" ? document.referrer : null,
    }),
  );
  // Annoncesporet (udkast 2, 21/9): samme øjeblik, samme URL — utm_*, fbclid,
  // landing (uden ?t=) og referrer. Sendes med «opret», gemmes på rækken.
  const annoncespor = useRef(
    laesAnnoncespor({
      get: (navn) => searchParams.get(navn),
      href: typeof window !== "undefined" ? window.location.href : null,
      referrer: typeof document !== "undefined" ? document.referrer : null,
    }),
  );
  // GA's klient-id og session-id (21/9 aften): _ga og _ga_6LHR66CDJ4 fra document.cookie,
  // læst ÉN gang ved mount som sporet. Findes de ikke (intet samtykke på theboardroom.dk),
  // er begge null — aldrig et gæt. Sendes med «opret», gemmes i en egen fail-soft update.
  const ga = useRef(laesGa(typeof document !== "undefined" ? document.cookie : null));

  const fremdrift = useMemo(() => afgoerFremdrift(svar), [svar]);

  // ── Genoptagelse: ?t= eller localStorage ─────────────────────────────
  useEffect(() => {
    let aktiv = true;
    const fraUrl = searchParams.get(TOKEN_PARAM);
    const t = fraUrl ?? laesLokaltToken();
    if (!t) {
      setFase({ slags: "intro", genoptager: false });
      return;
    }
    hentAnsoegning(t)
      .then((h) => {
        if (!aktiv) return;
        setToken(t);
        gemLokaltToken(t);
        setSvar(h.svar);
        setKladde(kladdeAf(h.svar));
        setCvrOpslag(h.cvr_opslag);
        setCvrBekraeftet(h.cvr_bekraeftet);
        if (h.cvr_opslag && h.cvr_opslag.kilde === "ansoeger") setVirksomhedsnavn(h.cvr_opslag.navn ?? "");
        const f = afgoerFremdrift(h.svar);
        setSkaerm(Math.min(f.naesteSkaerm, SKAERME.length - 1));
        // Et token uden ét eneste svar (fx afbrudt efter «opret») starter forfra på intro.
        setFase(f.besvarede === 0 ? { slags: "intro", genoptager: true } : { slags: "skema", velkommenTilbage: true });
        // Linket skal åbne i toppen (Jonas 18/9, pkt. 1) — feltets fokus ruller ikke længere (fokusUdenScroll), og siden står øverst.
        window.scrollTo({ top: 0 });
      })
      .catch(() => {
        if (!aktiv) return;
        // Ukendt, lukket eller indsendt — tokenet er dødt. Forfra, stille.
        glemLokaltToken();
        setFase({ slags: "intro", genoptager: false });
      });
    return () => {
      aktiv = false;
    };
    // Kun ved mount: senere ændringer af ?t= er vores egne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const husk = useCallback(
    (t: string) => {
      setToken(t);
      gemLokaltToken(t);
      setSearchParams({ [TOKEN_PARAM]: t }, { replace: true });
    },
    [setSearchParams],
  );

  /** Gemmer en delmængde — opretter først, hvis der intet token er. Svarer det samlede svar. */
  const gem = useCallback(
    async (del: Partial<AnsoegningsSvar>, bekraeftCvr = false, navn?: string): Promise<AnsoegningsSvar | null> => {
      setGemmer(true);
      try {
        if (!token) {
          const o = await opretAnsoegning({ kilde: kilde.current.kilde, kilde_raa: kilde.current.raa, annoncespor: annoncespor.current, ga: ga.current, svar: del, firma: honning });
          husk(o.token);
          if (navn) await gemSvar(o.token, {}, false, navn);
        } else {
          await gemSvar(token, del, bekraeftCvr, navn);
        }
        const samlet = { ...svar, ...del };
        setSvar(samlet);
        setGemt(true);
        return samlet;
      } catch (e) {
        haandterFejl(e);
        return null;
      } finally {
        setGemmer(false);
      }
    },
    [token, svar, husk, honning],
  );

  function haandterFejl(e: unknown) {
    if (e instanceof AnsoegningsFejl) {
      if (Object.keys(e.fejl).length > 0) {
        setFejl(e.fejl);
        return;
      }
      if (e.status === 404) {
        glemLokaltToken();
        setToken(null);
        toast.error("Ansøgningen er lukket eller sendt — start gerne forfra.");
        setFase({ slags: "intro", genoptager: false });
        return;
      }
      toast.error(e.message);
      return;
    }
    console.error("[ansoeg] fejl:", e);
    toast.error("Kunne ikke gemme — prøv igen.");
  }

  const gaaTil = useCallback(
    (naeste: number, efterGemt: number) => {
      const stykke = mellemstykkeEfter(efterGemt);
      if (stykke) setFase({ slags: "mellem", stykke, naesteSkaerm: naeste });
      else setSkaerm(naeste);
      setFejl({});
      setGemt(false);
      window.scrollTo({ top: 0 });
    },
    [],
  );

  /** Dømmer skærmens felter lokalt (samme dom som serveren) og svarer delmængden — eller sætter fejl. */
  function doemSkaerm(): Partial<AnsoegningsSvar> | null {
    const def = SKAERME[skaerm];
    const del: Record<string, string | number> = {};
    const nyFejl: Partial<Record<FeltId, string>> = {};
    for (const f of def.felter) {
      const raa = f === "hjemmeside" && svar.hjemmeside === HJEMMESIDE_INGEN && !(kladde.hjemmeside ?? "").trim() ? HJEMMESIDE_INGEN : (kladde[f] ?? "");
      const d = validerFelt(f, raa);
      if (d.ok === false) nyFejl[f] = d.fejl;
      else del[f] = d.vaerdi;
    }
    if (Object.keys(nyFejl).length > 0) {
      setFejl(nyFejl);
      return null;
    }
    setFejl({});
    return del as Partial<AnsoegningsSvar>;
  }

  const naeste = async () => {
    if (gemmer) return;
    const def = SKAERME[skaerm];
    const del = doemSkaerm();
    if (!del) return;

    if (def.id === "cvr") {
      const nummer = del.cvr as string;
      // Allerede bekræftet på dette nummer → videre uden nyt opslag.
      if (cvrBekraeftet && cvrOpslag?.cvr === nummer && svar.cvr === nummer) {
        gaaTil(skaerm + 1, skaerm);
        return;
      }
      const samlet = await gem({ cvr: nummer });
      if (!samlet) return;
      setCvrBekraeftet(false);
      setCvr({ slags: "slaar_op" });
      try {
        const r = await slaaCvrOp(token ?? laesLokaltToken() ?? "", nummer);
        if (r.udfald === "fundet") {
          setCvrOpslag({ cvr: nummer, ...r.visning });
          setCvr({ slags: "fundet", visning: r.visning, saetning: r.saetning, aktiv: !r.visning.status || r.visning.status.toLowerCase() === "aktiv" });
        } else {
          setCvrOpslag(null);
          setCvr({ slags: r.udfald });
        }
      } catch (e) {
        setCvrOpslag(null);
        setCvr({ slags: "utilgaengelig" });
        console.error("[ansoeg] cvr-opslag fejlede:", e);
      }
      return;
    }

    const sidste = skaerm === SKAERME.length - 1;
    if (sidste) {
      setGemmer(true);
      try {
        const t = token ?? laesLokaltToken();
        if (!t) throw new AnsoegningsFejl(404, "Intet token");
        const svar = await indsendAnsoegning(t, del);
        glemLokaltToken();
        setFase({ slags: "kvittering", udgave: "sendt", mail: svar.kvittering ?? "sendt" });
        window.scrollTo({ top: 0 });
      } catch (e) {
        // 409: mailen har allerede en åben, indsendt ansøgning (A's indeks) — ikke en fejl for ansøgeren.
        if (e instanceof AnsoegningsFejl && e.status === 409) {
          glemLokaltToken();
          setFase({ slags: "kvittering", udgave: "allerede" });
          window.scrollTo({ top: 0 });
        } else {
          haandterFejl(e);
        }
      } finally {
        setGemmer(false);
      }
      return;
    }

    const samlet = await gem(del);
    if (samlet) gaaTil(skaerm + 1, skaerm);
  };

  const cvrJa = async () => {
    if (cvr.slags !== "fundet" || !cvrOpslag) return;
    const samlet = await gem({ cvr: cvrOpslag.cvr }, true);
    if (!samlet) return;
    setCvrBekraeftet(true);
    // Registret udfylder det, ansøgeren ellers skulle taste.
    if (cvr.visning.hjemmeside && !kladde.hjemmeside) setKladde((k) => ({ ...k, hjemmeside: cvr.visning.hjemmeside ?? "" }));
    setCvr({ slags: "tom" });
    gaaTil(skaerm + 1, skaerm);
  };

  const cvrNej = () => {
    setCvr({ slags: "tom" });
    setCvrOpslag(null);
  };

  // Fallback (Jonas 18/9): uden opslag skal ansøgeren selv give navnet — ellers hedder de «{navn}s virksomhed» i alle mails.
  const cvrFortsaet = async () => {
    const navn = virksomhedsnavn.replace(/\s+/g, " ").trim();
    if (navn.length < 2) {
      setVirksomhedsnavnFejl(CVR_NAVN_FEJL);
      return;
    }
    setVirksomhedsnavnFejl(null);
    const samlet = await gem({}, false, navn);
    if (!samlet) return;
    setCvrOpslag({ cvr: svar.cvr ?? "", navn, stiftet_aar: null, antal_ansatte: null, selskabsform: null, branche: null, status: null, hjemmeside: null });
    setCvr({ slags: "tom" });
    gaaTil(skaerm + 1, skaerm);
  };

  const ingenHjemmeside = async () => {
    setKladde((k) => ({ ...k, hjemmeside: "" }));
    const samlet = await gem({ hjemmeside: HJEMMESIDE_INGEN });
    if (samlet) gaaTil(skaerm + 1, skaerm);
  };

  const tilbage = () => {
    setFejl({});
    setCvr({ slags: "tom" });
    if (skaerm === 0) setFase({ slags: "intro", genoptager: token !== null });
    else setSkaerm(skaerm - 1);
    window.scrollTo({ top: 0 });
  };

  const onKladde = (felt: FeltId, vaerdi: string) => {
    setKladde((k) => ({ ...k, [felt]: vaerdi }));
    setGemt(false);
    if (fejl[felt]) setFejl((f) => ({ ...f, [felt]: undefined }));
    if (felt === "cvr" && cvr.slags !== "tom") setCvr({ slags: "tom" });
  };

  const start = () => {
    setFase({ slags: "skema", velkommenTilbage: false });
    setSkaerm(token ? Math.min(fremdrift.naesteSkaerm, SKAERME.length - 1) : 0);
    window.scrollTo({ top: 0 });
  };

  let indhold: JSX.Element | null = null;
  switch (fase.slags) {
    case "starter":
      indhold = <div className="mx-auto h-40 max-w-xl animate-pulse rounded-hb bg-hb-line/60" aria-busy="true" />;
      break;
    case "intro":
      indhold = <AnsoegIntro onStart={start} genoptager={fase.genoptager} />;
      break;
    case "mellem":
      indhold = <AnsoegMellemstykke stykke={fase.stykke} onVidere={() => { setFase({ slags: "skema", velkommenTilbage: false }); setSkaerm(fase.naesteSkaerm); window.scrollTo({ top: 0 }); }} />;
      break;
    case "kvittering":
      indhold = <AnsoegKvittering udgave={fase.udgave} mail={fase.mail} />;
      break;
    case "skema":
      indhold = (
        <div className="mx-auto max-w-xl space-y-8">
          {fase.velkommenTilbage && (
            <div className="rounded-hb border border-hb-line bg-hb-surface p-4">
              <p className="text-[15px] font-medium text-hb-ink">{GENOPTAG.titel}</p>
              <p className="mt-0.5 text-sm text-hb-ink-soft">{GENOPTAG.tekst}</p>
            </div>
          )}
          <AnsoegFremdrift skaerm={skaerm + 1} ialt={SKAERME.length} procent={fremdrift.procent} />
          <AnsoegSkaerm
            skaerm={skaerm}
            kladde={kladde}
            fejl={fejl}
            onKladde={onKladde}
            onNaeste={naeste}
            onTilbage={tilbage}
            onIngenHjemmeside={ingenHjemmeside}
            gemmer={gemmer}
            gemt={gemt}
            cvr={cvr}
            onCvrJa={cvrJa}
            onCvrNej={cvrNej}
            onCvrFortsaet={cvrFortsaet}
            cvrAnsatteHint={cvrOpslag ? ansatteTekst(cvrOpslag.antal_ansatte) : null}
            svar={svar}
            honning={honning}
            onHonning={setHonning}
            virksomhedsnavn={virksomhedsnavn}
            onVirksomhedsnavn={(v) => {
              setVirksomhedsnavn(v);
              if (virksomhedsnavnFejl) setVirksomhedsnavnFejl(null);
            }}
            virksomhedsnavnFejl={virksomhedsnavnFejl}
          />
        </div>
      );
      break;
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

export default Ansoeg;
