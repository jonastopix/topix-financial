/**
 * AnsoegningslisteView — /ansoegninger (redesignet 18/9; Jonas kl. 11:07 og
 * tillæg 1–3). Det Monday gør rigtigt og vi slår: HELE pipelinen er synlig
 * på én skærm.
 *
 *   ØVERST STRIBEN: ét tal pr. trin i flowets rækkefølge (ny · indkaldt ·
 *   booket · afholdt · aftale sendt · underskrevet · på pause · lukket) —
 *   klik filtrerer listen, klik igen viser alle (lib/ansoegninger/
 *   ansoegningsliste.stribeTal).
 *   LISTEN: én linje pr. ansøger, høj nok til at læse — virksomhed og
 *   person, hvad der venter, hvor længe («venter på os · 5 dage» /
 *   «vi venter på dem · 3 dage» — den vigtigste sortering), og FØRSTE
 *   linje af udfordringen, klippet. Det der venter på JER står øverst og
 *   er markeret i rust; resten er baggrund; de lukkede foldet sammen.
 *   FOLDEN (tillæg 2): klik på linjen folder den ud med det man beslutter
 *   ud fra — de tre svar i fuld længde, anbefalingen med grundlaget,
 *   omsætningsinterval, branche, webinar — og handlingerne; «Åbn» går til
 *   ansøgningens egen side (CVR-opslag, spor, rykkerkø). KUN ÉN fold ad
 *   gangen (forsidens <details>-mønster, her kontrolleret), og INGEN husket
 *   tilstand (tillæg 3): ingen URL-parametre, ingen localStorage — listen
 *   ser ens ud hver gang.
 *   Tæthed og typografi som virksomhedslisten (px-4 py-3, [15px]/text-sm,
 *   divide-hb-line, hbControlClasses til søgefeltet).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ANSOEGNINGER_KEY, hentAnsoegninger, invaliderAnsoegninger, type AnsoegningRaekke } from "@/hooks/ansoegninger";
import { erPaaPause } from "@/lib/ansoegningTrin";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { hbControlClasses } from "@/components/hjemmebane/admin/HbField";
import { GRUPPE_ORD, gruppeFor, hvadVenter, listeOverskrift, taelVentende, virksomhedsnavnAf, LISTEGRUPPER, type Listegruppe } from "@/lib/ansoegninger/ansoegningVisning";
import { filtrer, foersteLinje, sorterGruppe, STRIBE_ORD, STRIBE_RAEKKEFOELGE, stribeTal, tidTekst, venterPaa } from "@/lib/ansoegninger/ansoegningsliste";
import { grundlagSomTekst, OMSAETNINGSINTERVALLER_KR } from "@/lib/ansoegningAnbefaling";
import { AnsoegningHandlinger } from "./AnsoegningHandlinger";
import { SendTilUnderskrift } from "../virksomhed/SendTilUnderskrift";
import { hbButtonVariants } from "../HbButton";
import { cn } from "@/lib/utils";

const UDFALD_ORD: Record<string, string> = { tal_med_dem: "Tal med dem", tvivl: "Tvivl", afvis: "Afvis" };
const UDFALD_FARVE: Record<string, string> = { tal_med_dem: "text-hb-evergreen", tvivl: "text-hb-ink", afvis: "text-hb-rust" };

const Svar = ({ label, tekst }: { label: string; tekst: string | null }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-hb-ink">{tekst?.trim() || "—"}</p>
  </div>
);

/** Folden: det man beslutter ud fra, og knapperne. Alt andet bor på ansøgningens side. */
const Fold = ({ a }: { a: AnsoegningRaekke }) => {
  const queryClient = useQueryClient();
  const anb = a.anbefaling;
  const opslag = (a.cvr_opslag ?? {}) as Record<string, unknown>;
  const interval = a.omsaetningsinterval ? OMSAETNINGSINTERVALLER_KR[a.omsaetningsinterval]?.label ?? a.omsaetningsinterval : null;
  return (
    <div className="border-t border-hb-line bg-hb-paper px-4 py-4" data-ansoegning-fold={a.id}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Svar label="Største udfordring" tekst={a.udfordring} />
        <Svar label="Har selv prøvet" tekst={a.proevet} />
        <Svar label="Om tolv måneder" tekst={a.om_tolv_maaneder} />
      </div>
      <p className="mt-4 text-sm leading-snug" data-anbefaling={anb?.udfald ?? "ingen"}>
        {anb ? (
          <>
            <span className={cn("font-medium", UDFALD_FARVE[anb.udfald] ?? "text-hb-ink")}>{UDFALD_ORD[anb.udfald] ?? anb.udfald}</span>
            <span className="text-hb-ink-soft"> · {grundlagSomTekst(anb)}</span>
          </>
        ) : (
          <span className="text-hb-ink-soft">Ingen anbefaling endnu.</span>
        )}
      </p>
      <p className="mt-1 text-xs text-hb-ink-soft">
        {[interval ? `omsætning ${interval}` : null, typeof opslag.branche === "string" ? opslag.branche.toLowerCase() : null, a.set_webinar === "ja" ? "har set webinaret" : a.set_webinar === "nej" ? "har ikke set webinaret" : null].filter(Boolean).join(" · ") || "—"}
      </p>
      <AnsoegningHandlinger id={a.id} navn={virksomhedsnavnAf(a)} trin={a.trin} paaPause={a.paa_pause_til !== null} lukketFraTrin={a.lukket_fra_trin} kompakt />
      {/* E-underskriften også i folden (Jonas 18/9 aften): samme komponent, samme forudfyldte pris, samme forhåndsvisning —
          efter samtalen og ved gensendelse, ikke på pause. */}
      {(a.trin === "afholdt" || a.trin === "aftalegrundlag_sendt") && !erPaaPause(a.paa_pause_til, new Date()) && (
        <div className="mt-3 rounded-hb border border-hb-line bg-hb-surface px-3 py-2" data-underskrift-i-folden>
          <SendTilUnderskrift ansoegningId={a.id} onOpdateret={() => invaliderAnsoegninger(queryClient, a.id)} />
        </div>
      )}
      {/* «Åbn» som en rigtig knap (Jonas 18/9 aften: «ekstremt skjult og lille») — sporet, køen og noten er på siden. */}
      <p className="mt-4">
        <Link to={`/ansoegninger/${a.id}`} className={cn(hbButtonVariants({ variant: "secondary" }), "h-9 px-4 text-xs")} data-aabn-ansoegning>Åbn ansøgningen →</Link>
      </p>
    </div>
  );
};

const Raekke = ({ a, nu, aaben, onToggle }: { a: AnsoegningRaekke; nu: Date; aaben: boolean; onToggle: (aaben: boolean) => void }) => {
  const side = venterPaa(a, nu);
  return (
    <details open={aaben} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)} data-ansoegning-raekke={a.id} data-venter-paa={side}>
      <summary className="cursor-pointer list-none transition-colors hover:bg-hb-sage/20 [&::-webkit-details-marker]:hidden">
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[2fr_1.3fr_1.3fr_2fr] sm:items-center">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium leading-snug text-hb-ink">{virksomhedsnavnAf(a)}</p>
            <p className="truncate text-xs text-hb-ink-soft">{[a.navn, a.email].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <p className={cn("truncate text-sm", side === "os" ? "font-medium text-hb-rust" : "text-hb-ink-soft")}>{hvadVenter(a, nu)}</p>
          <p className={cn("truncate text-sm", side === "os" ? "text-hb-rust" : "text-hb-ink-soft")}>{tidTekst(a, nu)}</p>
          <p className="truncate text-sm text-hb-ink-soft">{foersteLinje(a.udfordring) || "—"}</p>
        </div>
      </summary>
      {aaben && <Fold a={a} />}
    </details>
  );
};

export const AnsoegningslisteView = () => {
  const { user, isAdvisor } = useAuth();
  const nu = new Date();
  const q = useQuery({ queryKey: [...ANSOEGNINGER_KEY], queryFn: hentAnsoegninger, enabled: !!user && !!isAdvisor, staleTime: 60_000 });
  // Tilstanden bor KUN her (tillæg 3): forlader man siden, er alt lukket og ufiltreret igen.
  const [aabenId, setAabenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Listegruppe | null>(null);
  const [query, setQuery] = useState("");

  const alle = q.data ?? [];
  const stribe = stribeTal(alle, nu);
  const viste = filtrer(alle, nu, filter, query);
  const grupper = LISTEGRUPPER.map((gruppe) => ({ gruppe, raekker: sorterGruppe(gruppe, viste.filter((r) => gruppeFor(r, nu) === gruppe)) })).filter((g) => g.raekker.length > 0);
  const ventende = taelVentende(alle, nu);

  return (
    <div className="pb-16">
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Ansøgninger</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{listeOverskrift(ventende, !!q.data)}</h1>
        <p className="mt-2 text-sm text-hb-ink-soft">To beslutninger er jeres: efter ansøgningen — tal med dem eller afvis; efter samtalen — tilbud eller afslag. Alt andet kører selv.</p>
      </section>

      {/* STRIBEN: hele flowet på én linje; klik filtrerer, klik igen viser alle. */}
      <ol className="mt-8 flex flex-wrap gap-2" data-stribe aria-label="Pipelinen">
        {STRIBE_RAEKKEFOELGE.map((gruppe) => {
          const antal = stribe.find((s) => s.gruppe === gruppe)?.antal ?? 0;
          const aktiv = filter === gruppe;
          const os = gruppe === "ny" || gruppe === "afholdt";
          return (
            <li key={gruppe}>
              <button
                type="button"
                onClick={() => { setFilter(aktiv ? null : gruppe); setAabenId(null); }}
                aria-pressed={aktiv}
                data-stribe-trin={gruppe}
                className={cn(
                  "flex items-baseline gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  aktiv ? "border-hb-ink bg-hb-ink text-white" : "border-hb-line bg-hb-surface text-hb-ink hover:bg-hb-sage/20",
                  !aktiv && antal === 0 && "text-hb-ink-soft",
                )}
              >
                <span className={cn("font-editorial text-xl leading-none", !aktiv && os && antal > 0 && "text-hb-rust")}>{antal}</span>
                <span className="text-xs uppercase tracking-[0.12em]">{STRIBE_ORD[gruppe]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setAabenId(null); }}
          placeholder="Søg på virksomhed, person, e-mail eller CVR…"
          className={cn(hbControlClasses, "max-w-md flex-1 rounded-full px-5")}
          data-soegning
        />
        {(filter || query) && (
          <button type="button" onClick={() => { setFilter(null); setQuery(""); setAabenId(null); }} className="text-sm text-hb-evergreen underline-offset-4 hover:underline">Vis alle</button>
        )}
      </div>

      {q.isLoading ? (
        <p className="mt-8 text-sm text-hb-ink-soft">Henter ansøgningerne…</p>
      ) : q.isError ? (
        <p className="mt-8 text-sm text-hb-rust">{raadgiverHentefejlTekst(q.error, "ansoegningerne")}</p>
      ) : grupper.length === 0 ? (
        <p className="mt-8 text-sm text-hb-ink-soft">{alle.length === 0 ? "Der er ingen indsendte ansøgninger endnu." : "Ingen ansøgninger matcher."}</p>
      ) : (
        grupper.map((g) => {
          const os = g.gruppe === "ny" || g.gruppe === "afholdt";
          const foldet = g.gruppe === "lukket" && filter !== "lukket";
          const liste = (
            <ul className="divide-y divide-hb-line">
              {g.raekker.map((a) => (
                <li key={a.id}>
                  <Raekke a={a} nu={nu} aaben={aabenId === a.id} onToggle={(o) => setAabenId(o ? a.id : aabenId === a.id ? null : aabenId)} />
                </li>
              ))}
            </ul>
          );
          const overskrift = <span className={cn("text-xs font-medium uppercase tracking-[0.14em]", os ? "text-hb-rust" : "text-hb-ink-soft")}>{GRUPPE_ORD[g.gruppe]} · {g.raekker.length}</span>;
          return (
            <section key={g.gruppe} className={cn("mt-6 overflow-hidden rounded-hb border bg-hb-surface", os ? "border-hb-rust/40" : "border-hb-line")} data-liste-gruppe={g.gruppe}>
              {foldet ? (
                <details data-lukkede-fold>
                  <summary className="cursor-pointer list-none px-4 py-2 [&::-webkit-details-marker]:hidden">{overskrift} <span className="text-xs text-hb-evergreen">— vis</span></summary>
                  {liste}
                </details>
              ) : (
                <>
                  <div className="border-b border-hb-line px-4 py-2">{overskrift}</div>
                  {liste}
                </>
              )}
            </section>
          );
        })
      )}
    </div>
  );
};
