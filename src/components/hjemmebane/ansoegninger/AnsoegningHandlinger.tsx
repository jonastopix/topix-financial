/**
 * AnsoegningHandlinger — knapperne på en ansøgning (liste og egen side).
 * Hvilke der vises, afgør knapperFor (lib/ansoegninger/ansoegningHandlinger:
 * afgoerOvergang fra trinnet — fladen gætter ikke). Det uigenkaldelige
 * (afvis, afslag, luk, underskrevet) går gennem AlertDialog (shadcn, som
 * FjernMedlem på virksomhedssiden); «Send aftalegrundlag» kræver linket
 * først. Kaldet går til ansoegning-handling gennem hooks/ansoegninger
 * (Bearer + de to fejl-tjek); invalideringen AWAITES før dialogen lukkes og
 * før toasten (EditCompanyDialog-fælden).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { hbControlClasses } from "@/components/hjemmebane/admin/HbField";
import { invaliderAnsoegninger, udfoerHandling } from "@/hooks/ansoegninger";
import { bekraeftOverskrift, erGyldigPauseDato, erGyldigtAftaleLink, knapperFor, LUKKEAARSAGER_TIL_VALG, standardPauseTil, type Knap } from "@/lib/ansoegninger/ansoegningHandlinger";
import { LUKKEAARSAG_ORD, TRIN_ORD } from "@/lib/ansoegninger/ansoegningVisning";
import type { Lukkeaarsag, Trin } from "@/lib/ansoegningTrin";

const STOR = "rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const LILLE = "text-xs underline-offset-4 hover:underline disabled:opacity-50";

export const AnsoegningHandlinger = ({ id, navn, trin, paaPause, lukketFraTrin, kompakt = false }: {
  id: string; navn: string; trin: Trin; paaPause: boolean; lukketFraTrin: Trin | null; kompakt?: boolean;
}) => {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Knap | null>(null);
  const [aarsag, setAarsag] = useState<Lukkeaarsag>("andet");
  const [begrundelse, setBegrundelse] = useState("");
  const [aftaleUrl, setAftaleUrl] = useState("");
  const [visAftale, setVisAftale] = useState(false);
  const [pauseTil, setPauseTil] = useState(() => standardPauseTil(new Date()));

  const knapper = knapperFor({ trin, paaPause, lukketFraTrin });
  const store = knapper.filter((k) => k.stor);
  const reserve = knapper.filter((k) => !k.stor);

  const koer = useMutation({
    mutationFn: async (k: Knap) => {
      const svar = await udfoerHandling({
        ansoegningId: id,
        handling: k.handling,
        begrundelse: begrundelse.trim() || null,
        lukkeaarsag: k.kraeverAarsag ? aarsag : null,
        aftaleUrl: k.kraeverAftaleUrl ? aftaleUrl.trim() : null,
        pauseTil: k.kraeverDato ? pauseTil : null,
      });
      await invaliderAnsoegninger(queryClient, id);
      return { k, svar };
    },
    onSuccess: ({ k, svar }) => {
      setDialog(null);
      setBegrundelse("");
      setVisAftale(false);
      toast.success(`${k.tekst}: ${navn}`, { description: `${TRIN_ORD[svar.til].split(" — ")[0]}${svar.planlagt ? ` · ${svar.planlagt} rykkere planlagt` : ""}${svar.company_id ? " · virksomheden er oprettet" : ""}` });
    },
    onError: (e: Error) => toast.error("Handlingen blev ikke udført", { description: e.message }),
  });

  const tryk = (k: Knap) => {
    if (k.kraeverAftaleUrl) {
      if (!visAftale) return setVisAftale(true);
      if (!erGyldigtAftaleLink(aftaleUrl)) return toast.error("Linket til aftalegrundlaget skal være et https-link");
    }
    if (k.bekraeft) return setDialog(k);
    koer.mutate(k);
  };

  if (knapper.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", kompakt ? "mt-2" : "mt-4")} data-ansoegning-handlinger={trin}>
      {store.map((k) => (
        <button
          key={k.handling}
          type="button"
          disabled={koer.isPending}
          onClick={() => tryk(k)}
          title={k.forklaring}
          className={cn(STOR, k.farlig ? "border border-hb-rust text-hb-rust hover:bg-hb-rust/10" : "bg-hb-evergreen text-white hover:bg-hb-evergreen/90")}
        >
          {koer.isPending && koer.variables?.handling === k.handling ? "Arbejder…" : k.tekst}
        </button>
      ))}
      {visAftale && (
        <input
          type="url"
          value={aftaleUrl}
          onChange={(e) => setAftaleUrl(e.target.value)}
          placeholder="https://app.theboardroom.dk/aftale?token=… (linket til aftalegrundlaget)"
          className={cn(hbControlClasses, "min-w-[20rem] flex-1 rounded-full")}
          data-aftale-url
        />
      )}
      {reserve.length > 0 && (
        <span className="ml-auto flex items-center gap-3 text-hb-ink-soft">
          {reserve.map((k) => (
            <button key={k.handling} type="button" disabled={koer.isPending} onClick={() => tryk(k)} title={k.forklaring} className={cn(LILLE, k.farlig ? "text-hb-rust" : "text-hb-evergreen")}>
              {k.tekst}
            </button>
          ))}
        </span>
      )}

      <AlertDialog open={dialog !== null} onOpenChange={(o) => { if (!koer.isPending && !o) setDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog ? bekraeftOverskrift(dialog, navn) : ""}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.forklaring}</AlertDialogDescription>
          </AlertDialogHeader>
          {dialog?.kraeverAarsag && (
            <label className="block text-sm">
              <span className="text-hb-ink-soft">Årsag</span>
              <select value={aarsag} onChange={(e) => setAarsag(e.target.value as Lukkeaarsag)} className={cn(hbControlClasses, "mt-1 w-full")} data-lukkeaarsag>
                {LUKKEAARSAGER_TIL_VALG.map((l) => <option key={l} value={l}>{LUKKEAARSAG_ORD[l]}</option>)}
              </select>
            </label>
          )}
          {dialog?.kraeverDato && (
            <label className="block text-sm">
              <span className="text-hb-ink-soft">På pause til (standard: tre måneder frem)</span>
              <input type="date" value={pauseTil} onChange={(e) => setPauseTil(e.target.value)} className={cn(hbControlClasses, "mt-1 w-full")} data-pause-til />
              {!erGyldigPauseDato(pauseTil, new Date()) && <span className="mt-1 block text-xs text-hb-rust">Datoen skal ligge efter i dag.</span>}
            </label>
          )}
          {dialog && (
            <label className="block text-sm">
              <span className="text-hb-ink-soft">Begrundelse (valgfri — står i sporet)</span>
              <textarea value={begrundelse} onChange={(e) => setBegrundelse(e.target.value)} rows={3} className={cn(hbControlClasses, "mt-1 w-full")} data-begrundelse />
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={koer.isPending}>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (dialog) koer.mutate(dialog); }}
              disabled={koer.isPending || (dialog?.kraeverDato === true && !erGyldigPauseDato(pauseTil, new Date()))}
              className={cn(dialog?.farlig && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            >
              {koer.isPending ? "Arbejder…" : dialog?.tekst}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
