import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { cn } from "@/lib/utils";
import { hentSessioner, type SessionerSvar, tilmeld, type TilmeldSvar, WebinarFejl } from "@/lib/webinarRum/api";
import { laesTilmeldSpor, sessionTekst, type TilmeldFejl, validerTilmelding } from "@/lib/webinarRum/links";
import { Kalenderknapper } from "./Kalenderknapper";
import { BROED, EYEBROW, FEJL, FELT, H1, INDHOLD, LABEL, STOR_KNAP } from "./stil";

/**
 * Tilmeldingen til et webinar på platformen (skive 2, 30/9-2026) — /w/<slug>
 * uden token, og /w/<slug>/tilmeld. Spec'ens hovedformular bor på topix.dk
 * (skive 8: samtykkebanner, pixel, GTM); denne er husets egen, uden
 * tredjeparts-tracking, og er den, skyggesessionen bruger (spec §D5, §E2 P0).
 *
 * Felter: fornavn + mail (påkrævet), samtykke til nyhedsbrevet (valgfrit, IKKE
 * sat på forhånd — kun det giver Hovedliste-samtykke; en tilmelding er ikke
 * samtykke, Jonas 22/9). Honningfeltet «hjemmeside» er usynligt for mennesker.
 * Annoncesporet (utm_*, fbclid, landing, referrer) følger med; cookier læses
 * ikke (app'en har intet samtykkebanner).
 *
 * Svaret: en NY tilmelding giver tokenet ÉN gang → kvittering med kalender og
 * «Gå til rummet». «Samme» og «flyttet» giver intet token (enhver kan taste en
 * mail) — linket kommer på mail.
 */

const SERVER_FEJL: Record<string, string> = {
  origin: "Tilmeldingen virker kun fra vores egen side.",
  loft_ip: "Der er kommet mange tilmeldinger fra dit net lige nu — prøv igen om lidt.",
  loft_i_alt: "Der er travlt lige nu — prøv igen om lidt.",
  fuld: "Den session er fuld — vælg et andet tidspunkt.",
  forbi: "Den session kan man ikke længere tilmelde sig — vælg et andet tidspunkt.",
  aflyst: "Den session er aflyst — vælg et andet tidspunkt.",
  ikke_sat_op: "Tilmeldingen er ikke åbnet endnu.",
  ukendt_session: "Den session findes ikke længere — vælg et andet tidspunkt.",
  intern: "Den session er en intern prøve — kun husets egne adresser kan tilmelde sig.",
};

export function WebinarTilmelding({ slug, onGaaTilRummet }: { slug: string; onGaaTilRummet: (token: string) => void }) {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<SessionerSvar | null>(null);
  const [hentFejl, setHentFejl] = useState<"ukendt" | "net" | null>(null);
  const [valgt, setValgt] = useState<string | null>(null);
  const [fornavn, setFornavn] = useState("");
  const [email, setEmail] = useState("");
  const [samtykke, setSamtykke] = useState(false);
  const [honning, setHonning] = useState("");
  const [fejl, setFejl] = useState<TilmeldFejl>({});
  const [sender, setSender] = useState(false);
  const [serverFejl, setServerFejl] = useState<string | null>(null);
  const [kvittering, setKvittering] = useState<TilmeldSvar | null>(null);
  const spor = useRef(
    laesTilmeldSpor({
      get: (n) => searchParams.get(n),
      href: typeof window !== "undefined" ? window.location.href : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    }),
  );
  const id = useId();
  // Rådgiverens prøvelink til en INTERN session (skive 3): /w/<slug>/tilmeld?session=<id>.
  const bestemtSession = searchParams.get("session");

  useEffect(() => {
    let aktiv = true;
    hentSessioner(slug, bestemtSession)
      .then((d) => {
        if (!aktiv) return;
        setData(d);
        setValgt(d.sessioner[0]?.id ?? null);
      })
      .catch((e) => {
        if (aktiv) setHentFejl(e instanceof WebinarFejl && (e.status === 404 || e.status === 400) ? "ukendt" : "net");
      });
    return () => {
      aktiv = false;
    };
  }, [slug, bestemtSession]);

  if (hentFejl === "ukendt") {
    return (
      <div className={cn(INDHOLD, "space-y-3 text-center")}>
        <p className={EYEBROW}>Webinaret</p>
        <h1 className={H1}>Webinaret findes ikke</h1>
        <p className={BROED}>Tjek linket — eller spørg den, der sendte det.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={cn(INDHOLD, "text-center")} role="status">
        <p className={BROED}>{hentFejl === "net" ? "Vi kan ikke få forbindelse lige nu. Prøv at genindlæse siden." : "Henter webinaret …"}</p>
      </div>
    );
  }

  const w = data.webinar;
  const vaert = w.vaert_navn ?? "værten";
  const minutter = Math.round(w.varighed_sek / 60);

  if (kvittering) {
    const s = kvittering.session;
    return (
      <div className={cn(INDHOLD, "space-y-6")}>
        <p className={cn(EYEBROW, "flex items-center gap-2")}>
          <Check className="h-4 w-4" aria-hidden="true" /> {kvittering.dublet === "ny" ? "Du er tilmeldt" : kvittering.dublet === "flyttet" ? "Din tilmelding er flyttet" : "Du er allerede tilmeldt"}
        </p>
        <h1 className={H1} tabIndex={-1} ref={(el) => el?.focus()}>
          {s ? sessionTekst(s.starter_at) : w.titel}
        </h1>
        {kvittering.token && s && kvittering.rum_sti ? (
          <>
            <p className={BROED}>Vi glæder os til at se dig. Læg tidspunktet i din kalender, så du ikke glemmer det — og gå ind i rummet, når det åbner.</p>
            <Kalenderknapper titel={w.titel} starterAt={s.starter_at} token={kvittering.token} rumSti={kvittering.rum_sti} />
            <HbButton className={STOR_KNAP} onClick={() => onGaaTilRummet(kvittering.token as string)}>
              Gå til rummet
            </HbButton>
          </>
        ) : (
          <p className={BROED}>
            {kvittering.dublet === "flyttet" ? "Din tilmelding med den mail er flyttet til dette tidspunkt." : "Du er allerede tilmeldt med den mail."} Af hensyn til dig selv viser vi ikke linket til rummet her — det kommer på mail.
          </p>
        )}
      </div>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerFejl(null);
    const f = validerTilmelding({ fornavn, email, sessionId: valgt });
    setFejl(f);
    if (Object.keys(f).length > 0) {
      document.getElementById(`${id}-${Object.keys(f)[0]}`)?.focus();
      return;
    }
    setSender(true);
    try {
      const svar = await tilmeld({
        slug,
        session_id: valgt,
        fornavn: fornavn.replace(/\s+/g, " ").trim(),
        email: email.trim().toLowerCase(),
        samtykke_nyhedsbrev: samtykke,
        hjemmeside: honning,
        ...spor.current,
      });
      setKvittering(svar);
    } catch (err) {
      const kode = err instanceof WebinarFejl ? err.kode : "";
      setServerFejl(SERVER_FEJL[kode] ?? "Noget gik galt — prøv igen.");
    } finally {
      setSender(false);
    }
  };

  return (
    <div className={cn(INDHOLD, "space-y-8")}>
      <header className="space-y-3">
        <p className={EYEBROW}>Gratis webinar · {minutter} minutter</p>
        <h1 className={H1}>{w.titel}</h1>
        {w.beskrivelse && <p className={cn(BROED, "whitespace-pre-line")}>{w.beskrivelse}</p>}
        <div className="flex items-center gap-3 pt-1">
          {w.vaert_billede && <img src={w.vaert_billede} alt="" className="h-12 w-12 rounded-full object-cover" />}
          <p className="text-base text-hb-ink">
            Med <span className="font-medium">{vaert}</span>, der svarer på spørgsmål undervejs
          </p>
        </div>
      </header>

      {data.sessioner.length === 0 ? (
        <p className={cn(BROED, "rounded-hb border border-hb-line bg-hb-surface p-5")}>Der er ingen sessioner planlagt lige nu. Kig forbi igen snart.</p>
      ) : (
        <form noValidate onSubmit={send} className="space-y-6 rounded-hb border border-hb-line bg-hb-surface p-5 md:p-7">
          <fieldset>
            <legend className={LABEL}>Vælg tidspunkt</legend>
            <div className="grid gap-2" id={`${id}-session`} tabIndex={-1}>
              {data.sessioner.map((s) => {
                const er = valgt === s.id;
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-hb border px-4 py-3 text-base transition-colors focus-within:ring-2 focus-within:ring-hb-evergreen",
                      er ? "border-hb-evergreen bg-hb-sage/40" : "border-hb-line hover:bg-hb-sage/20",
                    )}
                  >
                    <input type="radio" name="session" value={s.id} checked={er} onChange={() => setValgt(s.id)} className="h-5 w-5 accent-[hsl(170_46%_14%)]" />
                    <span className="first-letter:uppercase">{sessionTekst(s.starter_at)}</span>
                    {s.intern === true && <span className="ml-auto text-xs uppercase tracking-[0.1em] text-hb-ink-soft">Intern prøve</span>}
                  </label>
                );
              })}
            </div>
            {fejl.session && <p className={FEJL}>{fejl.session}</p>}
          </fieldset>

          <div>
            <label htmlFor={`${id}-fornavn`} className={LABEL}>
              Fornavn
            </label>
            <input
              id={`${id}-fornavn`}
              className={FELT}
              value={fornavn}
              onChange={(e) => setFornavn(e.target.value)}
              autoComplete="given-name"
              maxLength={80}
              aria-invalid={!!fejl.fornavn}
              aria-describedby={fejl.fornavn ? `${id}-fornavn-fejl` : undefined}
            />
            {fejl.fornavn && <p id={`${id}-fornavn-fejl`} className={FEJL}>{fejl.fornavn}</p>}
          </div>

          <div>
            <label htmlFor={`${id}-email`} className={LABEL}>
              E-mail
            </label>
            <input
              id={`${id}-email`}
              className={FELT}
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
              aria-invalid={!!fejl.email}
              aria-describedby={fejl.email ? `${id}-email-fejl` : undefined}
            />
            {fejl.email && <p id={`${id}-email-fejl`} className={FEJL}>{fejl.email}</p>}
          </div>

          {/* Honningfeltet: usynligt og uden for tab-rækkefølgen — et menneske udfylder det aldrig. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Hjemmeside
              <input tabIndex={-1} autoComplete="off" value={honning} onChange={(e) => setHonning(e.target.value)} name="hjemmeside" />
            </label>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-base text-hb-ink">
            <input type="checkbox" checked={samtykke} onChange={(e) => setSamtykke(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[hsl(170_46%_14%)]" />
            <span>
              Ja tak til {vaert.split(" ")[0]}s nyhedsbrev <span className="text-hb-ink-soft">(valgfrit — du kan altid framelde dig)</span>
            </span>
          </label>

          {serverFejl && (
            <p className="rounded-hb border border-hb-rust/40 px-4 py-3 text-base text-hb-rust" role="alert">
              {serverFejl}
            </p>
          )}

          <HbButton type="submit" className={cn(STOR_KNAP, "w-full sm:w-auto")} disabled={sender}>
            {sender ? "Tilmelder …" : "Tilmeld mig"}
          </HbButton>

          <p className="text-sm leading-relaxed text-hb-ink-soft">
            Vi bruger din mail til at sende dig linket og påmindelser. Vi måler, hvor meget af webinaret du ser, dine svar og spørgsmål, og bruger det, hvis du senere søger om medlemskab.
          </p>
        </form>
      )}
    </div>
  );
}
