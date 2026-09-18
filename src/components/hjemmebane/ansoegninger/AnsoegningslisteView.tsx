/**
 * AnsoegningslisteView — /ansoegninger (18/9): ansøgningerne i trin, de to
 * beslutningstrin først (ny · samtale afholdt), nyeste først i hver gruppe.
 * Hver række viser hvem, hvornår, anbefalingen MED grundlaget i ord (aldrig
 * et tal alene — anbefalingen bærer intet tal) og de tre svære svar
 * læsbare uden at klikke. Knapperne på ny/afholdt er de to beslutninger.
 * Kladder (indsendt_at null) hentes aldrig (hooks/ansoegninger).
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ANSOEGNINGER_KEY, hentAnsoegninger, type AnsoegningRaekke } from "@/hooks/ansoegninger";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { grupperEfterTrin, LUKKEAARSAG_ORD, TRIN_ORD, ventetid, venterPaaMenneske, virksomhedsnavnAf } from "@/lib/ansoegninger/ansoegningVisning";
import { grundlagSomTekst } from "@/lib/ansoegningAnbefaling";
import { AnsoegningHandlinger } from "./AnsoegningHandlinger";
import { cn } from "@/lib/utils";

const UDFALD_ORD: Record<string, string> = { tal_med_dem: "Tal med dem", tvivl: "Tvivl", afvis: "Afvis" };
const UDFALD_FARVE: Record<string, string> = { tal_med_dem: "text-hb-evergreen", tvivl: "text-hb-ink", afvis: "text-hb-rust" };

const Svar = ({ label, tekst }: { label: string; tekst: string | null }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-hb-ink">{tekst?.trim() || "—"}</p>
  </div>
);

export const AnsoegningRaekkeIndhold = ({ a, nu }: { a: AnsoegningRaekke; nu: Date }) => {
  const navn = virksomhedsnavnAf(a);
  const anb = a.anbefaling;
  return (
    <div className="px-4 py-4" data-ansoegning-raekke={a.id}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link to={`/ansoegninger/${a.id}`} className="text-[15px] font-medium text-hb-ink underline-offset-4 hover:underline">{navn}</Link>
        <span className="text-sm text-hb-ink-soft">{[a.navn, a.email].filter(Boolean).join(" · ")}</span>
        <span className="ml-auto text-xs text-hb-ink-soft">{TRIN_ORD[a.trin].split(" — ")[0]} {ventetid(a.trin_sat_at, nu)}{a.paa_pause_til ? ` · på pause til ${a.paa_pause_til}` : ""}{a.lukkeaarsag ? ` · ${LUKKEAARSAG_ORD[a.lukkeaarsag]}` : ""}</span>
      </div>
      {anb ? (
        <p className="mt-2 text-sm leading-snug" data-anbefaling={anb.udfald}>
          <span className={cn("font-medium", UDFALD_FARVE[anb.udfald] ?? "text-hb-ink")}>{UDFALD_ORD[anb.udfald] ?? anb.udfald}</span>
          <span className="text-hb-ink-soft"> · {grundlagSomTekst(anb)}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-hb-ink-soft">Ingen anbefaling endnu.</p>
      )}
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Svar label="Største udfordring" tekst={a.udfordring} />
        <Svar label="Har selv prøvet" tekst={a.proevet} />
        <Svar label="Om tolv måneder" tekst={a.om_tolv_maaneder} />
      </div>
      {venterPaaMenneske(a.trin) && <AnsoegningHandlinger id={a.id} navn={navn} trin={a.trin} paaPause={a.paa_pause_til !== null} lukketFraTrin={null} kompakt />}
    </div>
  );
};

export const AnsoegningslisteView = () => {
  const { user, isAdvisor } = useAuth();
  const nu = new Date();
  const q = useQuery({ queryKey: [...ANSOEGNINGER_KEY], queryFn: hentAnsoegninger, enabled: !!user && !!isAdvisor, staleTime: 60_000 });
  const grupper = grupperEfterTrin(q.data ?? []);
  const venter = (q.data ?? []).filter((a) => venterPaaMenneske(a.trin)).length;

  return (
    <div className="pb-16">
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Ansøgninger</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          {q.data ? (venter === 0 ? "Ingen venter på jer lige nu." : venter === 1 ? "Én venter på jeres beslutning." : `${venter} venter på jeres beslutning.`) : "Ansøgningerne"}
        </h1>
        <p className="mt-2 text-sm text-hb-ink-soft">To beslutninger er jeres: efter ansøgningen — tal med dem eller afvis; efter samtalen — tilbud eller afslag. Alt andet kører selv.</p>
      </section>

      {q.isLoading ? (
        <p className="mt-8 text-sm text-hb-ink-soft">Henter ansøgningerne…</p>
      ) : q.isError ? (
        <p className="mt-8 text-sm text-hb-rust">{raadgiverHentefejlTekst(q.error, "ansoegningerne")}</p>
      ) : grupper.length === 0 ? (
        <p className="mt-8 text-sm text-hb-ink-soft">Der er ingen indsendte ansøgninger endnu.</p>
      ) : (
        grupper.map((g) => (
          <section key={g.trin} className="mt-10" data-trin-gruppe={g.trin}>
            <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{TRIN_ORD[g.trin]} · {g.raekker.length}</h2>
            <ul className="mt-3 divide-y divide-hb-line overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
              {g.raekker.map((a) => (
                <li key={a.id}><AnsoegningRaekkeIndhold a={a} nu={nu} /></li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};
