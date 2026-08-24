import * as React from "react";
import { cn } from "@/lib/utils";
import { laesTal, type TalKonvention } from "@/lib/importEngine";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/budgetTemplates";
import {
  erSektionUdeladt,
  gruppeForslag,
  indsaetFraTekst,
  normaliseretVaerdi,
  opsummer,
  raekkeGruppe,
  saetEtiket,
  saetMedtag,
  saetRaekkegruppe,
  saetSektionsgruppe,
  saetSektionUdeladt,
  saetVaerdi,
  sektionsNoegle,
  slet,
  tilfoejRaekke,
  type Gitter,
  type GitterRaekke,
  type Gruppenoegle,
} from "@/lib/importGitterModel";
import { HbCard } from "../HbCard";
import { fmtNumber } from "./hbBudgetShared";

/** Importgitteret (design-blok P1-P3, besluttet form 2026-08-23): rygraden
    alle importer lander i. REN præsentation — al ændring går gennem
    importGitterModel-funktionerne og ud via onChange; ingen egen
    forretningslogik, ingen persistering.

    Kun poster er rækker; sektioner vises som lette overskrifter og
    subtotaler samlet nederst som "Vi genkendte din opbygning" — rammen der
    beviser at filen blev forstået, og forklaringen på hvorfor subtotalerne
    ikke importeres (de dobbelttæller posterne). Alt er valgt til; motorens
    tvivl står som synlig tekst ved rækken, aldrig bag et hover-ikon. */

interface HbImportGitterProps {
  gitter: Gitter;
  onChange: (gitter: Gitter) => void;
}

const cellInputClasses =
  "w-20 rounded-md border border-hb-line bg-hb-surface px-1.5 py-1 text-right text-xs tabular-nums text-hb-ink focus:outline-none focus:ring-2 focus:ring-hb-evergreen/50";

/** Rækkefølgebevarende gruppering pr. (tabel, sektion) — til sektions-
    overskrifter og "Tilføj række" pr. sektion. */
function grupper(raekker: GitterRaekke[]): { sektion: string | null; raekker: GitterRaekke[] }[] {
  const grupperet: { sektion: string | null; raekker: GitterRaekke[] }[] = [];
  for (const raekke of raekker) {
    const sidste = grupperet[grupperet.length - 1];
    const sammeGruppe =
      sidste &&
      sidste.sektion === raekke.sektion &&
      sidste.raekker[sidste.raekker.length - 1].tabelIndex === raekke.tabelIndex;
    if (sammeGruppe) {
      sidste.raekker.push(raekke);
    } else {
      grupperet.push({ sektion: raekke.sektion, raekker: [raekke] });
    }
  }
  return grupperet;
}

/** Tastede tal læses med dansk konvention (gitteret bærer ingen egen
    konvention endnu) — motorens laesTal, samme regler som ved import. */
const DANSK_KONVENTION: TalKonvention = { tusind: ".", decimal: ",", sikkerhed: "hoej" };

/** Sentinel for "Ikke et budgetbeløb" i gruppevælgeren. KUN en UI-værdi:
    tilstanden bor i gitter.udeladteSektioner og er aldrig en gruppenøgle —
    den må ikke nå __group__-markørerne eller skriveplanen. */
const IKKE_BUDGET_SENTINEL = "__ikke_et_budgetbeloeb__";

export const HbImportGitter = ({ gitter, onChange }: HbImportGitterProps) => {
  const sammendrag = opsummer(gitter);
  const grupperet = grupper(gitter.raekker);
  const subtotaler = gitter.struktur.filter((s) => s.slags === "subtotal");
  const sektioner = gitter.struktur.filter((s) => s.slags === "sektion");

  // Fejl 3: rå værdi under redigering, fmtNumber uden fokus. Lokal state om
  // HVILKET felt der redigeres og hvad der står i det — modellen skrives kun
  // når teksten kan læses som tal.
  const [redigerer, setRedigerer] = React.useState<{
    raekkeIndex: number;
    kolonne: number;
    tekst: string;
  } | null>(null);

  // Cellerne viser den NORMALISEREDE værdi (normaliseretVaerdi — samme
  // regel som skriveplanen), så det medlemmet ser og godkender ER det der
  // gemmes: Løn står som 200.000, ikke filens -200.000. Gruppevælgeren
  // styrer fortegnet, så et skift til/fra Indtægter opdaterer visningen
  // med det samme. Det rå fortegn bevares i modellen (motoren læser
  // trofast) — vis det aldrig her.
  const visVaerdi = (raekke: GitterRaekke, kolonne: number): string => {
    if (redigerer && redigerer.raekkeIndex === raekke.raekkeIndex && redigerer.kolonne === kolonne) {
      return redigerer.tekst;
    }
    const vaerdi = normaliseretVaerdi(gitter, raekke, kolonne);
    return vaerdi === null ? "" : fmtNumber(vaerdi);
  };

  const startRedigering = (raekke: GitterRaekke, kolonne: number) => {
    const vaerdi = normaliseretVaerdi(gitter, raekke, kolonne);
    setRedigerer({
      raekkeIndex: raekke.raekkeIndex,
      kolonne,
      // Normaliseret værdi med dansk decimaltegn, så der tastes videre på
      // præcis det tal der vises og skrives.
      tekst: vaerdi === null ? "" : String(vaerdi).replace(".", ","),
    });
  };

  const tast = (raekke: GitterRaekke, kolonne: number, tekst: string) => {
    setRedigerer({ raekkeIndex: raekke.raekkeIndex, kolonne, tekst });
    if (tekst.trim() === "") {
      onChange(saetVaerdi(gitter, raekke.raekkeIndex, kolonne, null));
      return;
    }
    const felt = laesTal(tekst, DANSK_KONVENTION);
    // Ulæseligt: lad tegnene stå i feltet, men skriv ikke til modellen.
    if (felt.kilde !== "ulaeselig") {
      onChange(saetVaerdi(gitter, raekke.raekkeIndex, kolonne, felt.vaerdi));
    }
  };

  const indsaet = (raekkeIndex: number, kolonne: number) => (e: React.ClipboardEvent) => {
    e.preventDefault();
    setRedigerer(null);
    onChange(indsaetFraTekst(gitter, raekkeIndex, kolonne, e.clipboardData.getData("text")));
  };

  return (
    <div className="space-y-4">
      {/* Motorens advarsler — rolig orientering, ikke fejl */}
      {gitter.advarsler.length > 0 && (
        <div className="space-y-1">
          {gitter.advarsler.map((advarsel, i) => (
            <p key={i} className="text-sm text-hb-ink-soft" role="status">
              {advarsel}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-editorial text-lg font-medium text-hb-ink">Gennemse dine linjer</p>
          {/* Samme sætning som i redigeringstabellen — gruppevalget har
              konsekvens ud over placeringen, og det skal siges ved vælgerne. */}
          <p className="mt-0.5 text-xs text-hb-ink-soft">
            Gruppen bestemmer hvad linjen sammenlignes med under Budget vs. realiseret.
          </p>
        </div>
        <p className="text-sm text-hb-ink-soft">
          {sammendrag.medtaget} medtaget
          {sammendrag.fravalgt > 0 && <> · {sammendrag.fravalgt} fravalgt</>}
          {sammendrag.medBemaerkning > 0 && <> · {sammendrag.medBemaerkning} med bemærkning</>}
        </p>
      </div>

      <HbCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hb-line">
                <th className="w-10 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                  Med
                </th>
                <th className="min-w-[200px] px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                  Linje
                </th>
                {gitter.kolonner.map((kolonne, kolonneIndex) => (
                  <th
                    key={kolonneIndex}
                    className="min-w-[84px] px-2 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
                  >
                    {kolonne}
                  </th>
                ))}
                <th className="w-14 px-2 py-2.5" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {grupperet.map((gruppe, gruppeIndex) => (
                <React.Fragment key={`${gruppeIndex}-${gruppe.sektion ?? "uden"}`}>
                  {/* Sektionsoverskrift MED gruppevælger — valget er en del af
                      overskriften, aldrig et skjult felt. Rækker uden sektion
                      får deres egen vælger. */}
                  <tr className="bg-hb-sage/25">
                    <td
                      colSpan={gitter.kolonner.length + 3}
                      className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{gruppe.sektion ?? "Linjer uden sektion"}</span>
                        <span className="normal-case tracking-normal">→</span>
                        <select
                          value={
                            erSektionUdeladt(gitter, gruppe.sektion)
                              ? IKKE_BUDGET_SENTINEL
                              : (gitter.sektionsGrupper[sektionsNoegle(gruppe.sektion)] ??
                                gruppeForslag(gruppe.sektion))
                          }
                          onChange={(e) => {
                            if (e.target.value === IKKE_BUDGET_SENTINEL) {
                              onChange(saetSektionUdeladt(gitter, gruppe.sektion, true));
                              return;
                            }
                            // Et gruppevalg ophæver en evt. udeladelse i samme
                            // greb; er sektionen ikke udeladt, røres medtag ikke.
                            const grundlag = erSektionUdeladt(gitter, gruppe.sektion)
                              ? saetSektionUdeladt(gitter, gruppe.sektion, false)
                              : gitter;
                            onChange(
                              saetSektionsgruppe(grundlag, gruppe.sektion, e.target.value as Gruppenoegle),
                            );
                          }}
                          className="rounded-md border border-hb-line bg-hb-surface px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-hb-ink focus:outline-none focus:ring-2 focus:ring-hb-evergreen/50"
                          aria-label={`Budgetgruppe for ${gruppe.sektion ?? "linjer uden sektion"}`}
                        >
                          {GROUP_ORDER.map((noegle) => (
                            <option key={noegle} value={noegle}>
                              {GROUP_LABELS[noegle]}
                            </option>
                          ))}
                          <option value={IKKE_BUDGET_SENTINEL}>Ikke et budgetbeløb</option>
                        </select>
                      </span>
                    </td>
                  </tr>
                  {gruppe.raekker.map((raekke) => (
                    <React.Fragment key={raekke.raekkeIndex}>
                      <tr
                        className={cn(
                          "border-b border-hb-line/60",
                          !raekke.medtag && "opacity-45",
                          (raekke.bemaerkning !== null || raekke.kommentar !== null) && "border-b-0",
                        )}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={raekke.medtag}
                            onChange={(e) => onChange(saetMedtag(gitter, raekke.raekkeIndex, e.target.checked))}
                            className="h-4 w-4 accent-[hsl(var(--hb-evergreen))]"
                            aria-label={`Medtag ${raekke.etiket || "unavngiven linje"}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={raekke.etiket}
                            onChange={(e) => onChange(saetEtiket(gitter, raekke.raekkeIndex, e.target.value))}
                            onPaste={indsaet(raekke.raekkeIndex, 0)}
                            placeholder="Navn på linjen…"
                            className="w-full min-w-[180px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-hb-ink placeholder:text-hb-ink-soft/60 hover:border-hb-line focus:border-hb-line focus:outline-none focus:ring-2 focus:ring-hb-evergreen/50"
                            aria-label="Etiket"
                          />
                          {/* Linjens gruppevalg (spor3-design §4.1). Formvalg:
                              en lille select UNDER etiketten i etiketkolonnen —
                              talkolonnerne er allerede trange, og etiketcellen
                              er den eneste med luft. Den er stylet som stille
                              metadata (ingen ramme før hover) så gitteret ikke
                              larmer; som ægte <select> forbliver den ét klik og
                              tastaturtilgængelig, hvor et ikon-med-popover
                              ville koste to klik og egen state. "Ikke et
                              budgetbeløb" pr. linje ER medtag=false — samme
                              tilstand som fluebenet, vist i vælgeren, så ét
                              sted afgør hvad der skrives. */}
                          <select
                            value={
                              raekke.medtag ? raekkeGruppe(gitter, raekke) : IKKE_BUDGET_SENTINEL
                            }
                            onChange={(e) => {
                              if (e.target.value === IKKE_BUDGET_SENTINEL) {
                                onChange(saetMedtag(gitter, raekke.raekkeIndex, false));
                                return;
                              }
                              const gruppe = e.target.value as Gruppenoegle;
                              const grundlag = raekke.medtag
                                ? gitter
                                : saetMedtag(gitter, raekke.raekkeIndex, true);
                              onChange(saetRaekkegruppe(grundlag, raekke.raekkeIndex, gruppe));
                            }}
                            className="mt-0.5 max-w-[180px] cursor-pointer rounded border border-transparent bg-transparent px-1 py-0 text-[10px] text-hb-ink-soft hover:border-hb-line focus:border-hb-line focus:outline-none focus:ring-1 focus:ring-hb-evergreen/50"
                            aria-label={`Gruppe for ${raekke.etiket || "unavngiven linje"}`}
                          >
                            {GROUP_ORDER.map((noegle) => (
                              <option key={noegle} value={noegle}>
                                {GROUP_LABELS[noegle]}
                              </option>
                            ))}
                            <option value={IKKE_BUDGET_SENTINEL}>Ikke et budgetbeløb</option>
                          </select>
                        </td>
                        {gitter.kolonner.map((kolonne, kolonneIndex) => (
                          <td key={kolonneIndex} className="px-2 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={visVaerdi(raekke, kolonneIndex)}
                              onFocus={() => startRedigering(raekke, kolonneIndex)}
                              onBlur={() => setRedigerer(null)}
                              onChange={(e) => tast(raekke, kolonneIndex, e.target.value)}
                              onPaste={indsaet(raekke.raekkeIndex, kolonneIndex)}
                              className={cellInputClasses}
                              aria-label={`${raekke.etiket || "Linje"} ${kolonne}`}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => onChange(slet(gitter, raekke.raekkeIndex))}
                            className="text-[11px] text-hb-ink-soft underline-offset-4 hover:text-hb-rust hover:underline"
                          >
                            Fjern
                          </button>
                        </td>
                      </tr>
                      {(raekke.bemaerkning !== null || raekke.kommentar !== null) && (
                        <tr className={cn("border-b border-hb-line/60", !raekke.medtag && "opacity-45")}>
                          <td aria-hidden />
                          <td colSpan={gitter.kolonner.length + 2} className="px-3 pb-2 pt-0">
                            {/* Motorens tvivl som markering; medlemmets egen
                                kommentar som almindelig tekst — begge synlige,
                                aldrig bag et hover-ikon. */}
                            {raekke.bemaerkning !== null && (
                              <p className="text-xs text-hb-rust">{raekke.bemaerkning}</p>
                            )}
                            {raekke.kommentar !== null && (
                              <p className="text-xs text-hb-ink-soft">{raekke.kommentar}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  <tr className="border-b border-hb-line/40">
                    <td colSpan={gitter.kolonner.length + 3} className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onChange(tilfoejRaekke(gitter, gruppe.raekker[gruppe.raekker.length - 1].raekkeIndex))
                        }
                        className="text-[11px] text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline"
                      >
                        + Tilføj linje{gruppe.sektion ? ` under ${gruppe.sektion}` : ""}
                      </button>
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Kolonnesummer over medtagne rækker */}
              <tr className="border-t border-hb-line bg-hb-sand/40 font-medium">
                <td className="px-3 py-2.5" aria-hidden />
                <td className="px-3 py-2.5 text-xs font-medium text-hb-ink">Sum (medtagne)</td>
                {sammendrag.sum.map((vaerdi, i) => (
                  <td key={i} className="px-2 py-2.5 text-right text-xs tabular-nums">
                    <span className={cn(vaerdi !== null && vaerdi < 0 ? "text-hb-rust" : "text-hb-ink")}>
                      {vaerdi === null ? "—" : fmtNumber(vaerdi)}
                    </span>
                  </td>
                ))}
                <td aria-hidden />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-hb-line px-4 py-2 text-[11px] text-hb-ink-soft">
          Alle beløb i kr. Fravalgte linjer importeres ikke.
        </p>
      </HbCard>

      {/* Rammen: beviset på at filen blev forstået */}
      {(subtotaler.length > 0 || sektioner.length > 0) && (
        <HbCard className="p-5">
          <p className="font-editorial text-lg font-medium text-hb-ink">Vi genkendte din opbygning</p>
          <p className="mt-1 text-sm text-hb-ink-soft">
            {sektioner.length > 0 && (
              <>
                {sektioner.length} sektion{sektioner.length === 1 ? "" : "er"} bruges som overskrifter
                ovenfor.{" "}
              </>
            )}
            {subtotaler.length > 0 && (
              <>
                {subtotaler.length} total{subtotaler.length === 1 ? "" : "er"} importeres ikke — de
                gentager linjerne de summerer, og ville tælle beløbene dobbelt:
              </>
            )}
          </p>
          {subtotaler.length > 0 && (
            <ul className="mt-2 space-y-1">
              {subtotaler.map((note) => (
                <li key={note.raekkeIndex} className="text-sm text-hb-ink-soft">
                  {note.etiket}
                  {note.daekker && note.daekker.length > 0 && (
                    <span className="text-hb-ink-soft/70"> — summerer {note.daekker.length} linjer</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </HbCard>
      )}
    </div>
  );
};
