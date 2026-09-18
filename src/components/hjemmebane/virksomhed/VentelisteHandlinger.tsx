import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { erPladsLedig, forsidelinje, harTilbudUde, naesteIKoen, sorterKoe } from "@/lib/ventelisteDom";
import { fjernFraVenteliste, hentVenteliste, tilbydPladsen } from "@/lib/hjemmebane/ventelisteApi";
import { HbButton } from "../HbButton";

/** Ventelisten på virksomhedssiden (udkast 18/9): hvem venter på DENNE plads,
    og — når fornyelsesdommen siger at pladsen er ledig — knappen «Tilbyd
    pladsen til X». Der går ingen mail før det tryk; derefter kører køen selv
    (dag 3 rykker, dag 7 videre til den næste). Samme koer-form som
    FornyelsesHandlinger: skriv → hent igen → toast. */
export const VENTELISTE_KEY = (companyId: string) => ["venteliste", companyId] as const;

export const VentelisteHandlinger = ({ companyId, fornyelseStatus, efterSkrivning }: { companyId: string; fornyelseStatus: string; efterSkrivning: () => Promise<void> }) => {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: VENTELISTE_KEY(companyId), queryFn: () => hentVenteliste(companyId) });
  const [arbejder, setArbejder] = useState(false);
  const raekker = q.data ?? [];
  if (q.isLoading || raekker.length === 0) return null;

  const koe = sorterKoe(raekker);
  const naeste = naesteIKoen(raekker);
  const tilbudUde = harTilbudUde(raekker);
  const ledig = erPladsLedig(fornyelseStatus);
  const navnAf = (id: string) => raekker.find((r) => r.id === id)?.ansoegerNavn ?? "?";
  const linje = forsidelinje({
    virksomhedNavn: "Pladsen",
    naeste: naeste ? { navn: navnAf(naeste.id), afvist_at: naeste.afvist_at, sat_at: naeste.sat_at } : null,
    antalIKoen: koe.length,
    tilbudUde,
    nu: new Date(),
  });

  const koer = async (handling: () => Promise<unknown>, succes: string, fejl: string) => {
    if (arbejder) return;
    setArbejder(true);
    try {
      await handling();
      await queryClient.invalidateQueries({ queryKey: VENTELISTE_KEY(companyId) });
      await efterSkrivning();
      toast.success(succes);
    } catch (e) {
      toast.error(fejl, { description: e instanceof Error ? e.message : undefined });
    } finally {
      setArbejder(false);
    }
  };

  return (
    <div className="mt-2 text-sm" data-venteliste-handlinger={raekker.length}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Venteliste</p>
      <ul className="mt-1 space-y-1">
        {raekker
          .slice()
          .sort((a, b) => (a.status === "tilbudt" ? -1 : 0) - (b.status === "tilbudt" ? -1 : 0))
          .map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="text-hb-ink">{r.ansoegerNavn}</span>
              <span className="text-hb-ink-soft">
                {r.status === "tilbudt" ? `· tilbudt, svar senest ${r.tilbud_udloeber_at ? new Date(r.tilbud_udloeber_at).toLocaleDateString("da-DK", { day: "numeric", month: "long", timeZone: "Europe/Copenhagen" }) : "?"}` : "· venter"}
                {r.hvorfor ? ` · ${r.hvorfor}` : ""}
              </span>
              {r.status === "venter" && (
                <button type="button" disabled={arbejder} onClick={() => void koer(() => fjernFraVenteliste(r.id), `${r.ansoegerNavn} er taget af ventelisten`, "Kunne ikke fjerne")} className="text-xs text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50">
                  Fjern
                </button>
              )}
            </li>
          ))}
      </ul>
      {ledig && linje?.handling && naeste && (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-hb-ink-soft">Pladsen er ledig ({fornyelseStatus}). {linje.tekst}</span>
          <HbButton type="button" variant="secondary" className="h-8 px-3 text-xs" disabled={arbejder} onClick={() => void koer(() => tilbydPladsen(companyId), `Pladsen er tilbudt ${navnAf(naeste.id)} — 7 dage, køen kører selv`, "Tilbuddet blev ikke sendt")}>
            {arbejder ? "Sender…" : linje.handling}
          </HbButton>
        </span>
      )}
      {!ledig && !tilbudUde && <p className="mt-1 text-xs text-hb-ink-soft">Pladsen er ikke ledig endnu ({fornyelseStatus}) — køen venter.</p>}
    </div>
  );
};
