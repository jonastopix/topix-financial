import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hentVentelisteOverblik, VENTELISTE_OVERBLIK_KEY } from "@/hooks/ventelisteOverblik";
import { TILSTAND_ORD, type OverblikRaekke } from "@/lib/ansoegninger/ventelisteOverblik";
import { tilbydPladsen } from "@/lib/hjemmebane/ventelisteApi";
import { datoKort } from "@/lib/ventelisteDom";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { cn } from "@/lib/utils";
import { HbButton } from "../HbButton";

/**
 * VENTELISTEN UNDER ANSØGNINGER (udkast 22/9-2026).
 *
 * Jonas 22/9: «Det kunne være smart, at vi havde ventelisten under ansøgninger.
 * Det her er for bøvlet.» Før i dag hang handlingen på virksomhedssiden — og en
 * TIDLIGERE virksomhed står ikke i Virksomheder-listen, så pladsen kunne kun
 * tilbydes ved at skrive `/virksomhed/<id>` i adresselinjen.
 *
 * FLADEN REGNER INTET. Hver række er dømt af `bygVentelisteOverblik`, og knappen
 * kalder det SAMME `tilbydPladsen` som virksomhedssiden. Gaten er dommens
 * `tilstand === "kan_tilbydes_nu"` — ikke en betingelse skrevet her. Værnet
 * `ventelisteOverblik.guard` låser begge dele.
 */
export const VentelisteOverblik = () => {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: [...VENTELISTE_OVERBLIK_KEY], queryFn: () => hentVentelisteOverblik(), staleTime: 30_000 });
  const [arbejder, setArbejder] = useState<string | null>(null);
  const nu = new Date();

  const tilbyd = async (r: OverblikRaekke) => {
    if (arbejder) return;
    setArbejder(r.ventepladsId);
    try {
      await tilbydPladsen(r.companyId);
      await queryClient.invalidateQueries({ queryKey: [...VENTELISTE_OVERBLIK_KEY] });
      toast.success(`Pladsen er tilbudt ${r.ansoegerNavn} — 7 dage, køen kører selv`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tilbuddet blev ikke sendt");
    } finally {
      setArbejder(null);
    }
  };

  if (q.isLoading) return <p className="mt-8 text-sm text-hb-ink-soft">Henter ventelisten…</p>;
  if (q.isError) return <p className="mt-8 text-sm text-hb-rust">{raadgiverHentefejlTekst(q.error, "ansoegningerne")}</p>;
  const raekker = q.data ?? [];
  if (raekker.length === 0) return <p className="mt-8 text-sm text-hb-ink-soft">Ingen står på venteliste.</p>;

  return (
    <ul className="mt-8 divide-y divide-hb-line" data-venteliste-overblik={raekker.length}>
      {raekker.map((r) => (
        <li key={r.ventepladsId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm" data-venteplads={r.ventepladsId} data-tilstand={r.tilstand}>
          <Link to={`/ansoegninger/${r.ansoegningId}`} className="font-medium text-hb-ink underline-offset-4 hover:underline">
            {r.ansoegerNavn}
          </Link>
          <span className="text-hb-ink-soft">venter på</span>
          <Link to={`/virksomhed/${r.companyId}`} className="text-hb-evergreen underline-offset-4 hover:underline">
            {r.virksomhed}
          </Link>
          {r.nummer !== null && <span className="text-hb-ink-soft">· nr. {r.nummer} i køen</span>}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em]",
              r.tilstand === "kan_tilbydes_nu" ? "border-hb-rust text-hb-rust" : "border-hb-line text-hb-ink-soft",
            )}
          >
            {TILSTAND_ORD[r.tilstand]}
            {r.tilstand === "tilbudt" && r.tilbudUdloeberAt ? ` til ${datoKort(r.tilbudUdloeberAt, nu)}` : ""}
            {r.tilstand === "venter_paa_dato" && r.tidligstTilbudAt ? ` ${r.tidligstTilbudAt}` : ""}
          </span>
          {r.tilstand === "kan_tilbydes_nu" && (
            <HbButton
              type="button"
              variant="secondary"
              className="ml-auto h-8 px-3 text-xs"
              disabled={arbejder !== null}
              onClick={() => void tilbyd(r)}
            >
              {arbejder === r.ventepladsId ? "Sender…" : "Tilbyd pladsen"}
            </HbButton>
          )}
        </li>
      ))}
    </ul>
  );
};
