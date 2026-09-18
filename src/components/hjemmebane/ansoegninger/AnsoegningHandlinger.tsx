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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { hbControlClasses } from "@/components/hjemmebane/admin/HbField";
import { AKTIVE_KUNDER_KEY, hentAktiveKunder, invaliderAnsoegninger, udfoerHandling } from "@/hooks/ansoegninger";
import { AFSLAGSGRUND_ORD, bekraeftOverskrift, erGyldigPauseDato, knapperFor, LUKKEAARSAGER_TIL_VALG, standardPauseTil, type Knap } from "@/lib/ansoegninger/ansoegningHandlinger";
import { INDGANGS_PRISPUNKTER_OERE, STANDARD_PRISNIVEAU_OERE } from "@/lib/indgangspris";
import { LUKKEAARSAG_ORD, TRIN_ORD } from "@/lib/ansoegninger/ansoegningVisning";
import { AFSLAGSGRUNDE, afslagsFoelger, type Afslagsgrund, type Lukkeaarsag, type Trin } from "@/lib/ansoegningTrin";

/** Svar-mailens udfald i toasten (Jonas 18/9, pkt. 8): sendt straks, eller køen tager den. */
const MAIL_ORD: Record<string, string> = { sendt: " · mailen er sendt", reserve: " · mailen går i næste sendevindue", fejlet: " · mailen kunne IKKE sendes", ingen_adresse: " · ingen mailadresse" };
const STOR = "rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const LILLE = "text-xs underline-offset-4 hover:underline disabled:opacity-50";

export const AnsoegningHandlinger = ({ id, navn, trin, paaPause, lukketFraTrin, kompakt = false }: {
  id: string; navn: string; trin: Trin; paaPause: boolean; lukketFraTrin: Trin | null; kompakt?: boolean;
}) => {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Knap | null>(null);
  const [aarsag, setAarsag] = useState<Lukkeaarsag>("andet");
  const [begrundelse, setBegrundelse] = useState("");
  // Papirvejen (18/9 aften): prisen er et FORUDFYLDT, synligt valg (50.000), kan skiftes til 40.000 — aldrig uden.
  const [prisOere, setPrisOere] = useState<number>(STANDARD_PRISNIVEAU_OERE);
  const [pauseTil, setPauseTil] = useState(() => standardPauseTil(new Date()));
  // Afslaget bliver til noget (Jonas 17/9, 18/9): grunden styrer følgerne — niche → venteliste + afslagsmail, for tidligt → afslagsmail, andet → intet.
  const [grund, setGrund] = useState<Afslagsgrund>("andet");
  const [ventelisteCompanyId, setVentelisteCompanyId] = useState("");
  const [ventelisteHvorfor, setVentelisteHvorfor] = useState("");
  const kunder = useQuery({ queryKey: [...AKTIVE_KUNDER_KEY], queryFn: hentAktiveKunder, enabled: dialog?.kraeverAfslagsgrund === true, staleTime: 5 * 60_000 });
  const tilbud = afslagsFoelger(grund);
  const ventelisteKlar = !tilbud.venteliste || ventelisteCompanyId !== "";

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
        prisOere: k.kraeverPris ? prisOere : null,
        pauseTil: k.kraeverDato ? pauseTil : null,
        afslagsgrund: k.kraeverAfslagsgrund ? grund : null,
        // Ventelisten er C's og sættes EFTER lukningen — men i SAMME kald (19/9): ansoegning-handling lukker,
        // sætter pladsen og sender afslagsmailen straks med pladsen i (Jonas 18/9, pkt. 8). Aldrig direkte i tabellen.
        ventelisteCompanyId: k.kraeverAfslagsgrund && tilbud.venteliste ? ventelisteCompanyId || null : null,
        ventelisteHvorfor: ventelisteHvorfor.trim() || null,
      });
      const venteliste = svar.venteliste ? svar.venteliste.virksomhed ?? "virksomheden" : null;
      await invaliderAnsoegninger(queryClient, id);
      return { k, svar, venteliste };
    },
    onSuccess: ({ k, svar, venteliste }) => {
      setDialog(null);
      setBegrundelse("");
      setVentelisteCompanyId("");
      setVentelisteHvorfor("");
      toast.success(`${k.tekst}: ${navn}`, { description: `${TRIN_ORD[svar.til].split(" — ")[0]}${MAIL_ORD[svar.mail ?? ""] ?? ""}${svar.planlagt ? ` · ${svar.planlagt} i køen` : ""}${venteliste ? ` · i kø hos ${venteliste}` : ""}${svar.company_id ? " · virksomheden er oprettet" : ""}` });
    },
    onError: (e: Error) => toast.error("Handlingen blev ikke udført", { description: e.message }),
  });

  const tryk = (k: Knap) => {
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
          {dialog?.kraeverPris && (
            <fieldset className="text-sm" data-pris-valg>
              <legend className="text-hb-ink-soft">Pris (ekskl. moms) — forudfyldt, kan skiftes</legend>
              {INDGANGS_PRISPUNKTER_OERE.map((oere) => (
                <label key={oere} className="mt-1 flex items-center gap-2">
                  <input type="radio" name="prisniveau" value={oere} checked={prisOere === oere} onChange={() => setPrisOere(oere)} />
                  <span className="text-hb-ink">{new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(oere / 100)} kr.{oere === STANDARD_PRISNIVEAU_OERE ? " (standard)" : ""}</span>
                </label>
              ))}
            </fieldset>
          )}
          {dialog?.kraeverDato && (
            <label className="block text-sm">
              <span className="text-hb-ink-soft">På pause til (standard: tre måneder frem)</span>
              <input type="date" value={pauseTil} onChange={(e) => setPauseTil(e.target.value)} className={cn(hbControlClasses, "mt-1 w-full")} data-pause-til />
              {!erGyldigPauseDato(pauseTil, new Date()) && <span className="mt-1 block text-xs text-hb-rust">Datoen skal ligge efter i dag.</span>}
            </label>
          )}
          {dialog?.kraeverAfslagsgrund && (
            <fieldset className="text-sm" data-afslagsgrund>
              <legend className="text-hb-ink-soft">Hvorfor nej?</legend>
              {AFSLAGSGRUNDE.map((g) => (
                <label key={g} className="mt-1 flex items-start gap-2">
                  <input type="radio" name="afslagsgrund" value={g} checked={grund === g} onChange={() => setGrund(g)} className="mt-1" />
                  <span><span className="font-medium text-hb-ink">{AFSLAGSGRUND_ORD[g].tekst}</span> <span className="text-hb-ink-soft">— {AFSLAGSGRUND_ORD[g].giver}</span></span>
                </label>
              ))}
              {tilbud.venteliste && (
                <div className="mt-3 space-y-2" data-venteliste-felt>
                  <label className="block">
                    <span className="text-hb-ink-soft">Venter på virksomhed (aktiv kunde i samme niche)</span>
                    <select value={ventelisteCompanyId} onChange={(e) => setVentelisteCompanyId(e.target.value)} className={cn(hbControlClasses, "mt-1 w-full")} data-venteliste-virksomhed>
                      <option value="">Vælg virksomhed…</option>
                      {(kunder.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-hb-ink-soft">Hvorfor (én linje, kun for rådgivere)</span>
                    <input value={ventelisteHvorfor} onChange={(e) => setVentelisteHvorfor(e.target.value.slice(0, 500))} className={cn(hbControlClasses, "mt-1 w-full")} data-venteliste-hvorfor />
                  </label>
                </div>
              )}
              {tilbud.afslagsmail && (
                <p className="mt-2 text-xs text-hb-ink-soft">Afslagsmailen sendes i sendevinduet{tilbud.venteliste ? " med nummeret i køen — uden at nævne virksomheden ved navn" : ""}.</p>
              )}
            </fieldset>
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
              disabled={koer.isPending || (dialog?.kraeverDato === true && !erGyldigPauseDato(pauseTil, new Date())) || (dialog?.kraeverAfslagsgrund === true && !ventelisteKlar) || (dialog?.kraeverPris === true && !(INDGANGS_PRISPUNKTER_OERE as readonly number[]).includes(prisOere))}
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
