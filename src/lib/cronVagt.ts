/**
 * src/lib/cronVagt.ts
 *
 * Forsidens linje om DRIFTEN — formuleringen af cron-vagtens dom. Ren
 * funktion: ingen React, ingen Supabase. Testet i __tests__/cronVagt.test.ts.
 *
 * DOMMEN BOR I DATABASEN (migration 20260909234500, vagt_cron): den kører
 * hver time som ren SQL, uden HTTP og uden vault-nøglen, og skriver én række
 * pr. kørsel i cron_vagt_log — groen/gul/roed, grundene som koder, tallene
 * som jsonb. Denne fil dømmer IKKE igen; den oversætter rækkerne til én
 * linje. Ét sted der dømmer (SQL), ét sted der taler (her).
 *
 * HVORFOR ÉN LINJE PÅ FORSIDEN: 9/9 var vault tom fra kl. 06:52, alle ni
 * cron-jobs fik 401, og ingen så det før kl. 23:39. Beskeder i
 * advisor_notifications når ikke Hjemmebane; forsiden åbnes hver morgen.
 * Uden linjen er vagten en tabel ingen ser.
 *
 * LINJENS FIRE TILSTANDE, i den rækkefølge de prøves:
 *   1. ingen rækker           → «vagten har ikke kørt endnu» (soft)
 *   2. seneste række > 2 t    → «vagten har ikke kørt siden kl. X» (RUST) —
 *      gammel                    vagten selv er død; det er også drift
 *   3. seneste dom roed       → grundene + «siden kl. X» (RUST), hvor X er
 *                               starten på den ubrudte røde stribe
 *   4. seneste dom gul        → grundene + «ellers svarede alt 200» (soft)
 *   5. seneste dom groen      → «alt svarede 200 det sidste døgn» (soft) —
 *                               eller «igen, efter rød kl. X–Y» hvis døgnet
 *                               havde en rød stribe
 * Tiderne er lokale (klokken) — samme dagbegreb som resten af forsiden.
 */

export type VagtDom = "groen" | "gul" | "roed";

export type VagtGrund =
  | "vault_mangler"
  | "flere_jobs_ikke_200"
  | "cron_koersel_fejlet"
  | "koe_staar_stille"
  | "koe_pauset"
  | "koe_job_mangler";

export interface VagtTal {
  vault_noegler?: number;
  kald_60m?: number;
  ikke_200_60m?: number;
  jobs_ikke_200?: number;
  ikke_200_uden_job?: number;
  timeouts_60m?: number;
  koder?: Record<string, number>;
  koersler_60m?: number;
  koersler_fejlet_60m?: number;
  koe_job_aktiv?: boolean | null;
  usendte_30m?: number;
  aeldste_usendt_min?: number;
}

export interface VagtRaekke {
  id: number;
  /** ISO. */
  tid: string;
  dom: VagtDom;
  grunde: string[];
  tal: VagtTal;
}

export interface VagtLinje {
  tone: "soft" | "rust";
  tekst: string;
}

/** Vagten kører hver time; er seneste række ældre end dette, er vagten selv død. */
export const VAGT_DOED_EFTER_MIN = 120;

/** «kl. 07:07» — lokal tid. */
export function klokken(iso: string): string {
  const d = new Date(iso);
  return `kl. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const koderTekst = (koder: Record<string, number> | undefined): string => {
  if (!koder) return "";
  const dele = Object.entries(koder)
    .filter(([k]) => k !== "200")
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} × ${k === "intet_svar" ? "intet svar" : k}`);
  return dele.length ? ` (${dele.join(", ")})` : "";
};

/** Én grund → ét stykke tekst, med tallene fra rækken. Ukendt kode vises som den er, aldrig som en fejl. */
export function grundTekst(grund: string, tal: VagtTal): string {
  switch (grund as VagtGrund) {
    case "vault_mangler":
      return "nøglen mangler i vault";
    case "flere_jobs_ikke_200":
      return `${tal.jobs_ikke_200 ?? "flere"} cron-jobs svarede ikke 200${koderTekst(tal.koder)}`;
    case "cron_koersel_fejlet":
      return `${tal.koersler_fejlet_60m ?? "nogle"} cron-kørsler fejlede i databasen`;
    case "koe_staar_stille":
      return `${tal.usendte_30m ?? "nogle"} mails venter i køen${tal.aeldste_usendt_min ? `, den ældste i ${tal.aeldste_usendt_min} min` : ""}`;
    case "koe_pauset":
      return `mailjobbet er sat på pause, ${tal.usendte_30m ?? "nogle"} mails venter`;
    case "koe_job_mangler":
      return "mailjobbet findes ikke i cron";
    default:
      return grund;
  }
}

/** Starten på den ubrudte stribe af `dom` fra den nyeste række og bagud. Rækkerne er nyeste først. */
export function stribensStart(raekker: readonly VagtRaekke[], dom: VagtDom): VagtRaekke | null {
  let sidste: VagtRaekke | null = null;
  for (const r of raekker) {
    if (r.dom !== dom) break;
    sidste = r;
  }
  return sidste;
}

export function vagtLinje(raekker: readonly VagtRaekke[], nu: Date = new Date()): VagtLinje {
  const sorteret = [...raekker].sort((a, b) => new Date(b.tid).getTime() - new Date(a.tid).getTime());
  const seneste = sorteret[0];
  if (!seneste) return { tone: "soft", tekst: "Driften: vagten har ikke kørt endnu." };

  const alderMin = (nu.getTime() - new Date(seneste.tid).getTime()) / 60_000;
  if (alderMin > VAGT_DOED_EFTER_MIN) {
    return { tone: "rust", tekst: `Driften: vagten har ikke kørt siden ${klokken(seneste.tid)} — cron kører ikke.` };
  }

  if (seneste.dom === "roed") {
    const start = stribensStart(sorteret, "roed") ?? seneste;
    const grunde = seneste.grunde.map((g) => grundTekst(g, seneste.tal)).join(" · ");
    return { tone: "rust", tekst: `Driften: ${grunde} — siden ${klokken(start.tid)}.` };
  }

  if (seneste.dom === "gul") {
    const grunde = seneste.grunde.map((g) => grundTekst(g, seneste.tal)).join(" · ");
    return { tone: "soft", tekst: `Driften: ${grunde} · ellers svarede alt 200.` };
  }

  // groen
  const roede = sorteret.filter((r) => r.dom === "roed");
  if (roede.length > 0) {
    const foerste = roede[roede.length - 1];
    const sidste = roede[0];
    return {
      tone: "soft",
      tekst: `Driften: alt svarer 200 igen — rød ${klokken(foerste.tid)}–${klokken(sidste.tid).slice(4)}.`,
    };
  }
  const aeldste = sorteret[sorteret.length - 1];
  const daekkerDoegn = nu.getTime() - new Date(aeldste.tid).getTime() >= 23 * 60 * 60_000;
  return {
    tone: "soft",
    tekst: daekkerDoegn
      ? "Driften: alt svarede 200 det sidste døgn."
      : `Driften: alt har svaret 200 siden vagten begyndte ${klokken(aeldste.tid)}.`,
  };
}
