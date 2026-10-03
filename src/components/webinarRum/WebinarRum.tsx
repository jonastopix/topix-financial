import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Radio } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { cn } from "@/lib/utils";
import type { PulsRaa } from "@/lib/webinarMotor/puls";
import { rumSti } from "@/lib/webinarMotor/token";
import { type Rum, urForskydning, type UrMaaling } from "@/lib/webinarMotor/ur";
import {
  type GenTilmeldSvar,
  genTilmeld,
  type HandlingUd,
  hentTilstand,
  nytKlientId,
  type SeerInteraktion,
  sendFoerNavigation,
  sendPuls,
  type TilstandSvar,
  WebinarFejl,
} from "@/lib/webinarRum/api";
import { gaarIndAfSigSelv, glatForskydning, lokalPosition, senIndgang, serverNu, skalHenteTilstand, urFraTider, type Visning, visningsFase } from "@/lib/webinarRum/fase";
import { enhedId } from "@/lib/webinarRum/lager";
import { ansoegUrl, klokkeTekst, sessionTekst } from "@/lib/webinarRum/links";
import { afspillerTilstand, kortPaaSkaermen, mindsteRundtur } from "@/lib/webinarRum/overlay";
import { byggPuls, efterSvar, laegIKoe, maaSendes, pulsInterval, type StraksHaendelse, ventTil } from "@/lib/webinarRum/pulsplan";
import { Afspiller, type AfspillerSpejl, tomtSpejl } from "./Afspiller";
import { InteraktionsKort } from "./InteraktionsKort";
import { Kalenderknapper } from "./Kalenderknapper";
import { Nedtaelling } from "./Nedtaelling";
import { Reaktioner } from "./Reaktioner";
import { type EgetSpoergsmaal, SpoergPanel } from "./SpoergPanel";
import { Vaerelse } from "./Vaerelse";
import { BROED, EYEBROW, H1, H2, INDHOLD, STOR_KNAP } from "./stil";

/**
 * Rummet — ÉN side med motorens faser (skive 2, 30/9-2026; spec §A4–§A10):
 * venter → venteværelse → (sen indgang | gå ind) → live → exitrum → afsluttet.
 *
 * SERVEREN EJER URET. Fasen er fase.ts:visningsFase over serverens
 * positionDom, regnet lokalt hvert halve sekund på serverens tider med
 * klientens ur rettet af urForskydning (tre første målinger, mindste rundtur;
 * derefter glattet ±250 ms). Krydses en grænse, hentes «tilstand» igen — den
 * signerede embed findes kun i intro og afspilning.
 *
 * PULSEN (pulsplan.ts) tjekkes hvert sekund og sendes, når dens interval er gået
 * (15 s spiller · 60 s ellers · 5 s mens et spørgsmål venter på svar), straks ved
 * play/pause/ended/fanen skjult/fejl, og som keepalive ved «pagehide».
 * Handlinger (svar, spørgsmål, reaktioner) rider med; værtens svar kommer
 * tilbage i pulsens svar. Serveren afgør ALT om kredit og gyldighed.
 *
 * REACT #310: alle hooks står i topblokken, før den første betingede return.
 */
export function WebinarRum({ slug, token, onNytToken, onGlemToken }: { slug: string; token: string; onNytToken: (t: string) => void; onGlemToken: () => void }) {
  const [tilstand, setTilstand] = useState<TilstandSvar | null>(null);
  const [fejl, setFejl] = useState<"ukendt" | "net" | null>(null);
  const [forskydning, setForskydning] = useState<number | null>(null);
  const [lokalNu, setLokalNu] = useState(() => Date.now());
  const [gaaetInd, setGaaetInd] = useState(false);
  const [seAlligevel, setSeAlligevel] = useState(false);
  const [lukkede, setLukkede] = useState<ReadonlySet<string>>(() => new Set());
  const [egneSvar, setEgneSvar] = useState<Record<string, unknown>>({});
  const [spoergsmaal, setSpoergsmaal] = useState<EgetSpoergsmaal[]>([]);
  const [iRummet, setIRummet] = useState<number | null>(null);
  const [setProcent, setSetProcent] = useState(0);
  const [rtt, setRtt] = useState<number | null>(null);
  const [nyTilmelding, setNyTilmelding] = useState<GenTilmeldSvar | null>(null);
  const [genStatus, setGenStatus] = useState<"hviler" | "sender" | "fejl" | "ingen" | "fuld">("hviler");

  const spejl = useRef<AfspillerSpejl>(tomtSpejl());
  const maalinger = useRef<UrMaaling[]>([]);
  const forrigeVisning = useRef<Visning | null>(null);
  const henter = useRef(false);
  const puls = useRef({ seq: 0, koe: [] as PulsRaa[], handlinger: [] as HandlingUd[], sidstSendt: null as number | null, iGang: false, igen: false, sidstSpurgt: null as number | null });
  const enhed = useMemo(() => enhedId(), []);
  const tilstandRef = useRef(tilstand);
  tilstandRef.current = tilstand;
  const forskydningRef = useRef(forskydning);
  forskydningRef.current = forskydning;
  const visningRef = useRef<Visning | null>(null);

  const noterMaaling = useCallback((m: UrMaaling | null) => {
    if (!m) return;
    const liste = [...maalinger.current, m].slice(-10);
    maalinger.current = liste;
    setRtt(mindsteRundtur(liste));
    // De tre første: den med mindst rundtur vinder. Derefter glattes hver ny måling ±250 ms.
    if (liste.length <= 3) setForskydning(urForskydning(liste));
    else setForskydning((f) => glatForskydning(f, urForskydning([m])));
  }, []);

  const hent = useCallback(async () => {
    if (henter.current) return;
    henter.current = true;
    try {
      const { data, maaling } = await hentTilstand(token);
      noterMaaling(maaling);
      setTilstand(data);
      setSetProcent((p) => Math.max(p, data.set_procent ?? 0));
      setEgneSvar((s) => ({ ...data.egne_svar, ...s }));
      setFejl(null);
    } catch (e) {
      setFejl(e instanceof WebinarFejl && e.status === 403 ? "ukendt" : "net");
    } finally {
      henter.current = false;
    }
  }, [token, noterMaaling]);

  /** Positionen lige nu, læst af refs — til pulsen, som ikke må vente på en gentegning. */
  const positionNu = useCallback(() => {
    const t = tilstandRef.current;
    const f = forskydningRef.current;
    if (!t || f === null) return null;
    const u = urFraTider(t.tider, t.rum === "aflyst");
    return u ? lokalPosition(u, Date.now(), f) : null;
  }, []);

  const send = useCallback(
    async (medPuls: boolean): Promise<void> => {
      const p = puls.current;
      if (p.iGang) {
        p.igen = p.igen || medPuls || p.handlinger.length > 0;
        return;
      }
      const pos = positionNu();
      if (!pos || pos.rum === "foer_lobby" || pos.rum === "aflyst") return;
      const nu = Date.now();
      const pulsRum = pos.rum !== "afsluttet";
      if (medPuls && pulsRum) {
        if (maaSendes(p.sidstSendt, nu)) {
          const s = spejl.current;
          const live = visningRef.current === "live";
          p.seq += 1;
          p.koe = laegIKoe(
            p.koe,
            byggPuls({
              enhedId: enhed,
              seq: p.seq,
              klientMs: nu,
              posSek: s.posSek,
              tilstand: live ? afspillerTilstand(s.sidsteHaendelse, s.sidsteTidMs, nu) : "lobby",
              iHovedvideo: live && s.iHovedvideo && pos.rum === "afspilning",
              synlig: typeof document === "undefined" || document.visibilityState === "visible",
              lyd: s.muted === false,
              korrigeret: s.korrigeret,
            }),
          );
          s.korrigeret = false;
        } else {
          window.setTimeout(() => void send(true), ventTil(p.sidstSendt, nu));
        }
      }
      const pulser = pulsRum ? [...p.koe] : [];
      const handlinger = p.handlinger.slice(0, 10);
      if (pulser.length === 0 && handlinger.length === 0) return;
      p.iGang = true;
      if (pulser.length > 0) p.sidstSendt = nu;
      try {
        const { data, maaling } = await sendPuls(token, pulser, handlinger);
        noterMaaling(maaling);
        p.koe = efterSvar(p.koe, pulser, true);
        const sendteIds = new Set(handlinger.map((h) => h.klient_id));
        p.handlinger = p.handlinger.filter((h) => !sendteIds.has(h.klient_id));
        if (data.set_procent !== null) setSetProcent((x) => Math.max(x, data.set_procent ?? 0));
        setIRummet(data.i_rummet);
        const udfald = new Map(data.handlinger.map((h) => [h.klient_id, h.udfald]));
        let hentIgen = false;
        for (const h of handlinger) {
          const u = udfald.get(h.klient_id) ?? "fejl";
          const ok = u === "ok" || u === "dublet";
          if (h.art === "spoergsmaal") {
            setSpoergsmaal((l) => l.map((s) => (s.klientId === h.klient_id ? { ...s, modtaget: ok, afvist: !ok } : s)));
          } else if (h.art === "svar" && h.interaktion_id) {
            const id = h.interaktion_id;
            if (!ok) setEgneSvar((e) => { const { [id]: _fjernet, ...rest } = e; return rest; });
            else if (tilstandRef.current?.tidslinje.find((i) => i.id === id)?.art === "quiz") hentIgen = true; // facit kommer først efter svaret
          }
        }
        if (data.svar.length > 0) {
          setSpoergsmaal((l) => {
            let ud = [...l];
            for (const sv of data.svar) {
              const n = ud.findIndex((s) => s.svar === null && s.tekst === sv.spoergsmaal);
              if (n >= 0) ud[n] = { ...ud[n], svar: sv.svar, modtaget: true };
              else ud = [...ud, { klientId: sv.spoergsmaal_id, tekst: sv.spoergsmaal, svar: sv.svar, modtaget: true, afvist: false }];
            }
            return ud;
          });
        }
        const t = tilstandRef.current;
        if (hentIgen || (t && data.tidslinje_version !== null && data.tidslinje_version !== t.tidslinje_version)) void hent();
      } catch (e) {
        if (e instanceof WebinarFejl && e.status === 403) setFejl("ukendt");
        // Ellers: køen står, og næste forsøg sender den igen (serveren dedupper på seq og klient_id).
      } finally {
        p.iGang = false;
        if (p.igen) {
          p.igen = false;
          window.setTimeout(() => void send(true), ventTil(p.sidstSendt, Date.now()));
        }
      }
    },
    [token, enhed, positionNu, noterMaaling, hent],
  );

  const koeHandling = useCallback(
    (h: HandlingUd) => {
      puls.current.handlinger = [...puls.current.handlinger, h].slice(-10);
      void send(false);
    },
    [send],
  );

  const straks = useCallback((_h: StraksHaendelse) => void send(true), [send]);

  // ── Første hentning, og igen hvert 10. sekund ved en netfejl ─────────────
  useEffect(() => {
    void hent();
  }, [hent]);
  useEffect(() => {
    if (fejl !== "net") return;
    const t = window.setInterval(() => void hent(), 10_000);
    return () => window.clearInterval(t);
  }, [fejl, hent]);

  // ── Uret på skærmen ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = window.setInterval(() => setLokalNu(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  // ── Afledt (ingen hooks) ─────────────────────────────────────────────────
  const ur = tilstand ? urFraTider(tilstand.tider, tilstand.rum === "aflyst") : null;
  const pos = ur && forskydning !== null ? lokalPosition(ur, lokalNu, forskydning) : null;
  const rum: Rum | null = pos ? pos.rum : tilstand?.rum ?? null;
  const serverNuMs = serverNu(lokalNu, forskydning ?? 0);
  const kanNaaSet = pos && tilstand ? senIndgang(pos, tilstand.webinar.varighed_sek) : null;
  const visning: Visning | null = rum ? visningsFase({ rum, kanNaaSet, seAlligevel, gaaetInd }) : null;
  visningRef.current = visning;

  // ── Grænser: gå ind af sig selv fra venteværelset; hent igen ved et nyt rum ──
  useEffect(() => {
    if (!rum) return;
    if (gaarIndAfSigSelv(forrigeVisning.current, rum)) setGaaetInd(true);
    forrigeVisning.current = visning;
  }, [rum, visning]);
  useEffect(() => {
    if (!tilstand || !rum || !skalHenteTilstand(tilstand.rum, rum)) return;
    // Et øjebliks forskel på de to ure må ikke blive en løkke: ét forsøg pr. sekund, til serveren er enig.
    const t = window.setTimeout(() => void hent(), 1000);
    return () => window.clearTimeout(t);
  }, [tilstand, rum, hent]);

  // ── Pulsen ───────────────────────────────────────────────────────────────
  const pulsAktiv = visning === "vaerelse" || visning === "gaa_ind" || visning === "sen_indgang" || visning === "live" || visning === "exitrum";
  useEffect(() => {
    if (!pulsAktiv) return;
    const t = window.setInterval(() => {
      const p = puls.current;
      const nu = Date.now();
      const s = spejl.current;
      const tilst = visningRef.current === "live" ? afspillerTilstand(s.sidsteHaendelse, s.sidsteTidMs, nu) : "lobby";
      if (p.sidstSendt === null || nu - p.sidstSendt >= pulsInterval(tilst, p.sidstSpurgt, nu)) void send(true);
    }, 1000);
    const synlighed = () => void send(true);
    const forlad = () => {
      // Den sidste puls, der skal overleve, at fanen lukkes: keepalive, ingen svar.
      const p = puls.current;
      const s = spejl.current;
      const nu = Date.now();
      if (visningRef.current !== "live" || !maaSendes(p.sidstSendt, nu)) return;
      p.seq += 1;
      const sidste = byggPuls({ enhedId: enhed, seq: p.seq, klientMs: nu, posSek: s.posSek, tilstand: afspillerTilstand(s.sidsteHaendelse, s.sidsteTidMs, nu), iHovedvideo: s.iHovedvideo, synlig: false, lyd: s.muted === false, korrigeret: s.korrigeret });
      sendFoerNavigation(token, { puls: laegIKoe(p.koe, sidste) });
      p.sidstSendt = nu;
    };
    document.addEventListener("visibilitychange", synlighed);
    window.addEventListener("pagehide", forlad);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", synlighed);
      window.removeEventListener("pagehide", forlad);
    };
  }, [pulsAktiv, send, enhed, token]);

  // ── Handlinger fra fladen ────────────────────────────────────────────────
  const svar = useCallback(
    (i: SeerInteraktion, s: Record<string, unknown>) => {
      setEgneSvar((e) => ({ ...e, [i.id]: s }));
      koeHandling({ klient_id: nytKlientId(), art: "svar", interaktion_id: i.id, svar: s });
    },
    [koeHandling],
  );
  const ansoeg = useCallback(
    (i: SeerInteraktion) => {
      // FØR navigationen og uden at vente (spec §A6): klikket skal med, også hvis fanen skifter.
      setEgneSvar((e) => ({ ...e, [i.id]: { maal: "ansoeg" } }));
      sendFoerNavigation(token, { handlinger: [{ klient_id: nytKlientId(), art: "svar", interaktion_id: i.id, svar: { maal: "ansoeg" } }] });
    },
    [token],
  );
  const luk = useCallback((id: string) => setLukkede((l) => new Set([...l, id])), []);
  const spoerg = useCallback(
    (tekst: string) => {
      const klientId = nytKlientId();
      setSpoergsmaal((l) => [...l, { klientId, tekst, svar: null, modtaget: false, afvist: false }]);
      puls.current.sidstSpurgt = Date.now();
      koeHandling({ klient_id: klientId, art: "spoergsmaal", tekst });
    },
    [koeHandling],
  );
  const reager = useCallback((emoji: string) => koeHandling({ klient_id: nytKlientId(), art: "reaktion", emoji }), [koeHandling]);
  const tagNaeste = useCallback(async () => {
    setGenStatus("sender");
    try {
      setNyTilmelding(await genTilmeld(token));
      setGenStatus("hviler");
    } catch (e) {
      const kode = e instanceof WebinarFejl ? e.kode : "";
      setGenStatus(kode === "ingen_naeste_session" ? "ingen" : kode === "fuld" ? "fuld" : "fejl");
    }
  }, [token]);
  const forventetPos = useCallback(() => {
    const p = positionNu();
    if (!p) return 0;
    return p.rum === "intro" ? p.introPosSek : p.forventetPosSek;
  }, [positionNu]);

  // ════════════════════════ Herfra: kun tegning ════════════════════════════

  if (fejl === "ukendt") {
    return (
      <div className={cn(INDHOLD, "space-y-4 text-center")}>
        <p className={EYEBROW}>Webinaret</p>
        <h1 className={H1}>Linket kendes ikke</h1>
        <p className={BROED}>Tjek at hele linket fra din mail kom med. Du kan også tilmelde dig igen.</p>
        <HbButton className={STOR_KNAP} onClick={onGlemToken}>
          Til tilmeldingen
        </HbButton>
      </div>
    );
  }
  if (!tilstand || !visning) {
    return (
      <div className={cn(INDHOLD, "text-center")} role="status">
        <p className={BROED}>{fejl === "net" ? "Vi kan ikke få forbindelse lige nu — vi prøver igen af os selv." : "Henter rummet …"}</p>
      </div>
    );
  }

  const w = tilstand.webinar;
  const vaert = w.vaert_navn ?? "værten";
  const fornavn = tilstand.hilsen.fornavn;
  const naeste = tilstand.naeste_session;
  const kontekst = { svar: egneSvar, setProcent };
  const kort = pos ? kortPaaSkaermen(tilstand.tidslinje, pos.rum, pos.forventetPosSek, kontekst, lukkede) : [];
  const harExitCta = tilstand.tidslinje.some((i) => i.art === "cta" && i.placering === "exitrum" && i.indhold.maal === "ansoeg");

  const kortListe = kort.length > 0 && (
    <div className="space-y-4" aria-live="polite">
      {kort.map((i) => (
        <InteraktionsKort key={i.id} i={i} svar={egneSvar[i.id]} serverNuMs={serverNuMs} token={token} onSvar={svar} onLuk={luk} onAnsoeg={ansoeg} />
      ))}
    </div>
  );

  const naesteKnap = naeste && (
    <div className="space-y-2">
      <HbButton variant="secondary" className="h-12" onClick={() => void tagNaeste()} disabled={genStatus === "sender"}>
        <CalendarClock className="h-4 w-4" aria-hidden="true" /> {genStatus === "sender" ? "Tilmelder …" : `Tag næste session — ${sessionTekst(naeste.starter_at)}`}
      </HbButton>
      {genStatus === "fejl" && <p className="text-sm text-hb-rust" role="alert">Det gik ikke — prøv igen om lidt.</p>}
      {genStatus === "fuld" && <p className="text-sm text-hb-rust" role="alert">Den session er fuld.</p>}
      {genStatus === "ingen" && <p className="text-sm text-hb-ink-soft" role="status">Der er ingen ny session planlagt endnu.</p>}
    </div>
  );

  const ansoegKnap = (
    <a
      href={ansoegUrl(token)}
      target="_blank"
      rel="noopener"
      className="inline-flex h-12 items-center justify-center rounded-full bg-hb-evergreen px-7 text-base font-medium text-white hover:bg-hb-evergreen/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2"
    >
      Ansøg om en plads i The Boardroom
    </a>
  );

  const panel = <SpoergPanel vaertNavn={vaert} fornavn={fornavn} spoergsmaal={spoergsmaal} onSend={spoerg} />;

  if (nyTilmelding) {
    return (
      <div className={cn(INDHOLD, "space-y-6")}>
        <p className={EYEBROW}>Du er tilmeldt</p>
        <h1 className={H1}>{sessionTekst(nyTilmelding.session.starter_at)}</h1>
        <p className={BROED}>Linket til rummet kommer også på mail. Du kan gå direkte videre herfra.</p>
        <Kalenderknapper titel={w.titel} starterAt={nyTilmelding.session.starter_at} token={nyTilmelding.token} rumSti={nyTilmelding.rum_sti} />
        <div className="flex flex-wrap gap-2">
          <HbButton
            className={STOR_KNAP}
            onClick={() => {
              // En FLYTTET tilmelding beholder sit token (samme række, samme version) — så hentes rummet blot igen.
              if (nyTilmelding.token === token) {
                setNyTilmelding(null);
                void hent();
              } else onNytToken(nyTilmelding.token);
            }}
          >
            Til den nye session
          </HbButton>
          {nyTilmelding.token !== token && visning !== "afsluttet" && visning !== "aflyst" && (
            <HbButton variant="secondary" className="h-12" onClick={() => setNyTilmelding(null)}>
              Bliv i denne
            </HbButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(INDHOLD, "space-y-8")}>
      {visning === "venter" && (
        <div className="space-y-6 text-center">
          <p className={EYEBROW}>Du er tilmeldt</p>
          <h1 className={H1}>{w.titel}</h1>
          <p className="font-editorial text-2xl font-medium text-hb-ink">{sessionTekst(tilstand.tider.starter_at)}</p>
          <p className={BROED}>
            Rummet åbner kl. {klokkeTekst(tilstand.tider.lobby_aabner_at)}. Kom gerne lidt før — så kan du teste lyden og stille {vaert} et spørgsmål.
          </p>
          {pos && <Nedtaelling sek={Math.max(0, Math.ceil((pos.tider.lobbyAabnerMs - serverNuMs) / 1000))} label="Rummet åbner om" />}
          <div className="mx-auto max-w-md text-left">
            <Kalenderknapper titel={w.titel} starterAt={tilstand.tider.starter_at} token={token} rumSti={rumSti(slug, token)} />
          </div>
        </div>
      )}

      {visning === "vaerelse" && pos && (
        <Vaerelse titel={w.titel} vaertNavn={vaert} vaertBillede={w.vaert_billede} sekTilStart={pos.sekTilStart} rttMs={rtt} iRummet={iRummet} onLydtest={() => undefined}>
          {panel}
        </Vaerelse>
      )}

      {visning === "sen_indgang" && pos && (
        <div className="space-y-6 text-center">
          <p className={EYEBROW}>Webinaret er i gang</p>
          <h1 className={H1}>Webinaret er {Math.round((pos.forventetPosSek / w.varighed_sek) * 100)} % inde</h1>
          <p className={BROED}>
            Du kan stadig se med, men du når ikke det hele.{naeste ? ` Vil du hellere se det fra start, er næste session ${sessionTekst(naeste.starter_at)}.` : ""}
          </p>
          <div className="flex flex-col items-center gap-3">
            <HbButton className={STOR_KNAP} onClick={() => { setSeAlligevel(true); setGaaetInd(true); }}>
              <Radio className="h-5 w-5" aria-hidden="true" /> Se med alligevel
            </HbButton>
            {naesteKnap}
          </div>
        </div>
      )}

      {visning === "gaa_ind" && (
        <div className="space-y-6 text-center">
          <p className={EYEBROW}>Live nu</p>
          <h1 className={H1}>{w.titel}</h1>
          <p className={BROED}>Webinaret er i gang. Tryk for at gå ind — med lyd.</p>
          <HbButton className={STOR_KNAP} onClick={() => setGaaetInd(true)} autoFocus>
            <Radio className="h-5 w-5" aria-hidden="true" /> Gå ind
          </HbButton>
        </div>
      )}

      {visning === "live" && (
        <>
          <header>
            <p className={cn(EYEBROW, "flex items-center gap-2")}>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-hb-rust" aria-hidden="true" /> Live
            </p>
            <h1 className={cn(H2, "mt-1")}>{w.titel}</h1>
          </header>
          {tilstand.embed ? (
            <Afspiller embedUrl={tilstand.embed.url} iHovedvideo={pos?.rum === "afspilning"} forventetPos={forventetPos} spejl={spejl} onHaendelse={straks} titel={w.titel}>
              {pos?.rum === "afspilning" && <Reaktioner onReaktion={reager} />}
            </Afspiller>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-hb border border-hb-line bg-hb-surface px-8 text-center text-base text-hb-ink-soft" role="status">
              {tilstand.embed_status === "intet_rum" ? "Henter videoen …" : "Videoen er ikke sat op endnu."}
            </div>
          )}
          {kortListe}
          {tilstand.kapitler.length > 0 && pos && (
            <nav aria-label="Agenda" className="rounded-hb border border-hb-line bg-hb-surface px-5 py-4">
              <p className={EYEBROW}>Agenda</p>
              <ol className="mt-2 space-y-1">
                {tilstand.kapitler.map((k, n) => {
                  const nu = pos.forventetPosSek >= k.fraSek && (n === tilstand.kapitler.length - 1 || pos.forventetPosSek < tilstand.kapitler[n + 1].fraSek);
                  return (
                    <li key={k.id} aria-current={nu ? "step" : undefined} className={cn("text-base", nu ? "font-medium text-hb-ink" : "text-hb-ink-soft")}>
                      {k.titel}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
          {panel}
        </>
      )}

      {visning === "exitrum" && (
        <>
          <header className="text-center">
            <p className={EYEBROW}>Tak for i dag</p>
            <h1 className={cn(H1, "mt-2")}>Tak fordi du så med{fornavn ? `, ${fornavn}` : ""}</h1>
            <p className={cn(BROED, "mt-3")}>{vaert} er her stadig og svarer på spørgsmål, til rummet lukker.</p>
          </header>
          {kortListe}
          {!harExitCta && <div className="flex justify-center">{ansoegKnap}</div>}
          {naeste && <div className="flex justify-center">{naesteKnap}</div>}
          {panel}
        </>
      )}

      {visning === "afsluttet" && (
        <div className="space-y-6 text-center">
          <p className={EYEBROW}>Webinaret er slut</p>
          <h1 className={H1}>Tak for i dag{fornavn ? `, ${fornavn}` : ""}</h1>
          <p className={BROED}>Vil du videre med {vaert} og The Boardroom, er ansøgningen næste skridt.</p>
          <div className="flex flex-col items-center gap-3">
            {ansoegKnap}
            {naesteKnap}
          </div>
        </div>
      )}

      {visning === "aflyst" && (
        <div className="space-y-6 text-center">
          <p className={EYEBROW}>Aflyst</p>
          <h1 className={H1}>Sessionen er aflyst</h1>
          <p className={BROED}>Vi beklager. {naeste ? "Du kan tage næste session med ét tryk." : "Der er ingen ny session planlagt endnu."}</p>
          <div className="flex justify-center">{naesteKnap}</div>
        </div>
      )}
    </div>
  );
}
