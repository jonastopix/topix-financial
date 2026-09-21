/**
 * AnsoegningHandlinger — knapperne på en ansøgning (liste og egen side).
 * Hvilke der vises, afgør knapperFor (lib/ansoegninger/ansoegningHandlinger:
 * afgoerOvergang fra trinnet — fladen gætter ikke). Det uigenkaldelige
 * (afvis, afslag, luk, underskrevet) går gennem AlertDialog (shadcn, som
 * FjernMedlem på virksomhedssiden); «Send aftalegrundlag» kræver linket
 * først. Kaldet går til ansoegning-handling gennem hooks/ansoegninger
 * (Bearer + de to fejl-tjek); invalideringen AWAITES før dialogen lukkes og
 * før toasten (EditCompanyDialog-fælden).
 *
 * MAIL ELLER IKKE MAIL (Jonas 21/9): linjen under hver knap og i dialogen
 * kommer fra foelgeLinje (dommen) — aldrig fra en tekst her. Afslagsdialogen
 * viser mailen, ansøgeren får, ORDRET: emne og afsnit fra afslagsMailTekst
 * (afslagsTilbud.ts, samme kode som ansoegningRykkerMails sender med), med
 * grunden (grundTekst) og køpladsen (koeNummerForNy over kølængden fra
 * hooks). «Luk uden svar» med årsagen «Andet» kræver en begrundelse
 * (erLukBegrundelseGyldig — samme dom som ansoegning-handling).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { hbControlClasses } from "@/components/hjemmebane/admin/HbField";
import { AKTIVE_KUNDER_KEY, hentAktiveKunder, hentKoeLaengde, invaliderAnsoegninger, KOE_LAENGDE_KEY, udfoerHandling } from "@/hooks/ansoegninger";
import {
  AFSLAGSGRUND_ORD, bekraeftOverskrift, erGyldigPauseDato, foelgeLinje, knapperFor, LUKKEAARSAG_VALG_ORD, LUKKEAARSAGER_TIL_VALG, standardPauseTil, type Knap,
} from "@/lib/ansoegninger/ansoegningHandlinger";
import { INDGANGS_PRISPUNKTER_OERE, STANDARD_PRISNIVEAU_OERE } from "@/lib/indgangspris";
import { fornavnAf, TRIN_ORD } from "@/lib/ansoegninger/ansoegningVisning";
import { AFSLAGSGRUNDE, afslagsFoelger, erLukBegrundelseGyldig, lukKraeverBegrundelse, type Afslagsgrund, type Lukkeaarsag, type Trin } from "@/lib/ansoegningTrin";
import { afslagsMailTekst, grundTekst, koeNummerForNy } from "@/lib/afslagsTilbud";

/** Svar-mailens udfald i toasten (Jonas 18/9, pkt. 8): sendt straks, eller køen tager den. */
const MAIL_ORD: Record<string, string> = { sendt: " · mailen er sendt", reserve: " · mailen går i næste sendevindue", fejlet: " · mailen kunne IKKE sendes", ingen_adresse: " · ingen mailadresse" };
const STOR = "rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex flex-col items-center leading-tight";
const LILLE = "text-xs underline-offset-4 hover:underline disabled:opacity-50";

export const AnsoegningHandlinger = ({ id, navn, ansoegerNavn, trin, paaPause, lukketFraTrin, kompakt = false }: {
  id: string;
  /** Virksomhedens navn (virksomhedsnavnAf) — i overskrifter og i mailen. */
  navn: string;
  /** Ansøgerens eget navn (ansoegninger.navn) — mailens «Hej {fornavn}». */
  ansoegerNavn: string | null;
  trin: Trin; paaPause: boolean; lukketFraTrin: Trin | null; kompakt?: boolean;
}) => {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Knap | null>(null);
  const [aarsag, setAarsag] = useState<Lukkeaarsag>("andet");
  const [begrundelse, setBegrundelse] = useState("");
  // Papirvejen (18/9 aften): prisen er et FORUDFYLDT, synligt valg (50.000), kan skiftes til 40.000 — aldrig uden.
  const [prisOere, setPrisOere] = useState<number>(STANDARD_PRISNIVEAU_OERE);
  const [pauseTil, setPauseTil] = useState(() => standardPauseTil(new Date()));
  // Afslaget bliver til noget (Jonas 17/9, 18/9): grunden styrer følgerne — niche → venteliste + afslagsmail, ellers afslagsmail.
  const [grund, setGrund] = useState<Afslagsgrund>("andet");
  const [ventelisteCompanyId, setVentelisteCompanyId] = useState("");
  const [ventelisteHvorfor, setVentelisteHvorfor] = useState("");
  const kunder = useQuery({ queryKey: [...AKTIVE_KUNDER_KEY], queryFn: hentAktiveKunder, enabled: dialog?.kraeverAfslagsgrund === true, staleTime: 5 * 60_000 });
  const tilbud = afslagsFoelger(grund);
  const ventelisteKlar = !tilbud.venteliste || ventelisteCompanyId !== "";
  // Kølængden hos den valgte virksomhed — kun til forhåndsvisningens nummer; pladsen sættes af ansoegning-handling.
  const koeLaengde = useQuery({
    queryKey: [...KOE_LAENGDE_KEY(ventelisteCompanyId)],
    queryFn: () => hentKoeLaengde(ventelisteCompanyId),
    enabled: dialog?.kraeverAfslagsgrund === true && tilbud.venteliste && ventelisteCompanyId !== "",
    staleTime: 60_000,
  });

  const kontekst = { trin, paaPause, lukketFraTrin };
  const knapper = knapperFor({ trin, paaPause, lukketFraTrin });
  const store = knapper.filter((k) => k.stor);
  const reserve = knapper.filter((k) => !k.stor);
  const linjeFor = (k: Knap) => foelgeLinje(kontekst, k.handling, { grund, aarsag });

  // Forhåndsvisningen: den SAMME bygger som mailen (afslagsMailTekst). Nummeret i køen er den nye plads' — bagest.
  const forhaandsvisning = dialog?.kraeverAfslagsgrund
    ? afslagsMailTekst({
        fornavn: fornavnAf(ansoegerNavn),
        virksomhedsnavn: navn,
        afslag: {
          grundTekst: grundTekst(grund),
          ventepladser: tilbud.venteliste && ventelisteCompanyId !== "" && typeof koeLaengde.data === "number" ? [{ nummer: koeNummerForNy(koeLaengde.data) }] : [],
          efterSamtale: dialog.handling === "afslag",
        },
      })
    : null;
  const lukBegrundelseMangler = dialog?.kraeverAarsag === true && !erLukBegrundelseGyldig(aarsag, begrundelse);

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
      {store.map((k) => {
        const linje = linjeFor(k);
        return (
          <button
            key={k.handling}
            type="button"
            disabled={koer.isPending}
            onClick={() => tryk(k)}
            title={k.forklaring}
            data-knap={k.handling}
            className={cn(STOR, k.farlig ? "border border-hb-rust text-hb-rust hover:bg-hb-rust/10" : "bg-hb-evergreen text-white hover:bg-hb-evergreen/90")}
          >
            <span>{koer.isPending && koer.variables?.handling === k.handling ? "Arbejder…" : k.tekst}</span>
            {linje && <span className="text-[11px] font-normal opacity-80" data-foelge-linje={k.handling}>{linje}</span>}
          </button>
        );
      })}
      {reserve.length > 0 && (
        <span className="ml-auto flex items-center gap-3 text-hb-ink-soft">
          {reserve.map((k) => (
            <button key={k.handling} type="button" disabled={koer.isPending} onClick={() => tryk(k)} title={[k.forklaring, linjeFor(k)].filter(Boolean).join(" · ")} data-knap={k.handling} className={cn(LILLE, k.farlig ? "text-hb-rust" : "text-hb-evergreen")}>
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
          {dialog && linjeFor(dialog) && (
            <p className="text-sm font-medium text-hb-ink" data-foelge-linje="dialog">{linjeFor(dialog)}</p>
          )}
          {dialog?.kraeverAarsag && (
            <label className="block text-sm">
              <span className="text-hb-ink-soft">Årsag</span>
              <select value={aarsag} onChange={(e) => setAarsag(e.target.value as Lukkeaarsag)} className={cn(hbControlClasses, "mt-1 w-full")} data-lukkeaarsag>
                {LUKKEAARSAGER_TIL_VALG.map((l) => <option key={l} value={l}>{LUKKEAARSAG_VALG_ORD[l]}</option>)}
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
                  <span className="font-medium text-hb-ink">{AFSLAGSGRUND_ORD[g]}</span>
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
              {forhaandsvisning && (
                <div className="mt-3 rounded-hb border border-hb-line bg-hb-surface px-3 py-2" data-mail-forhaandsvisning>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-hb-ink-soft">Mailen, {fornavnAf(ansoegerNavn) ?? "ansøgeren"} får — ordret</p>
                  <p className="mt-1 text-sm"><span className="text-hb-ink-soft">Emne:</span> <span className="font-medium text-hb-ink" data-mail-emne>{forhaandsvisning.emne}</span></p>
                  {forhaandsvisning.afsnit.map((a, i) => <p key={i} className="mt-2 text-sm text-hb-ink" data-mail-afsnit>{a}</p>)}
                  {(ventelisteCompanyId === "" || koeLaengde.isPending) && tilbud.venteliste && (
                    <p className="mt-2 text-xs text-hb-ink-soft" data-mail-koe-note>{ventelisteCompanyId === "" ? "Vælg virksomheden — så står nummeret i køen her." : "Henter køen…"}</p>
                  )}
                </div>
              )}
            </fieldset>
          )}
          {dialog && (
            <label className="block text-sm">
              <span className="text-hb-ink-soft">
                Begrundelse ({dialog.kraeverAarsag && lukKraeverBegrundelse(aarsag) ? "kræves ved «Andet»" : "valgfri"} — står i sporet)
              </span>
              <textarea value={begrundelse} onChange={(e) => setBegrundelse(e.target.value)} rows={3} className={cn(hbControlClasses, "mt-1 w-full")} data-begrundelse />
              {lukBegrundelseMangler && <span className="mt-1 block text-xs text-hb-rust" data-begrundelse-mangler>Skriv, hvorfor ansøgningen lukkes uden svar.</span>}
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={koer.isPending}>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (dialog) koer.mutate(dialog); }}
              disabled={koer.isPending || lukBegrundelseMangler || (dialog?.kraeverDato === true && !erGyldigPauseDato(pauseTil, new Date())) || (dialog?.kraeverAfslagsgrund === true && !ventelisteKlar) || (dialog?.kraeverPris === true && !(INDGANGS_PRISPUNKTER_OERE as readonly number[]).includes(prisOere))}
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
