/**
 * importSkrivning — skrivevejen fra gitter til budget (design §2, besluttet
 * 2026-08-23). Ren logik, ingen database, ingen React: oversætter et
 * godkendt gitter til en Skriveplan som budgetEngine.confirmImportFraSkriveplan
 * kan persistere.
 *
 * Beslutningerne planen bærer:
 *   - Kun BASE-scenariet skrives — ét importeret budget er ét budget.
 *   - Etiketten bevares (P3) via __label__-markører; nøglen er unik pr.
 *     RÆKKE (`import_{slug}_{raekkeIndex}`), aldrig pr. kategorinavn — to
 *     "Forsikring"-linjer i hver sin sektion må ikke lægges sammen i stilhed.
 *   - Kolonner der ikke er måneder (kvartal, halvår, interval) fordeles
 *     LIGELIGT på de måneder de dækker, og hver fordeling registreres så
 *     medlemmet kan se hvad der skete.
 *   - Årstotaler bruges kun som sidste udvej (ingen månedsdækning) — ellers
 *     ville de dobbelttælle månederne.
 */

import { maanedsIndeks } from "@/lib/importEngine";
import type { Gitter } from "@/lib/importGitterModel";

export type Periodetype = "maaned" | "kvartal" | "halvaar" | "aar" | "ukendt";

export type Kolonneperiode = {
  kolonne: number;
  navn: string;
  type: Periodetype;
  /** 0-baserede månedsindeks kolonnen dækker (tom for ukendt). */
  maaneder: number[];
  /** Udledt af navnet hvis muligt ("Januar-26" → "2026"). */
  aar: string | null;
};

export type Fordeling = {
  kolonne: number;
  kolonnenavn: string;
  maaneder: number[];
  beloebPrMaaned: number | null;
};

export type SkriveplanRaekke = {
  /** Unik pr. række: import_{slug}_{raekkeIndex}. */
  noegle: string;
  etiket: string;
  /** Gitterrækkens sektion — bevares som __group__-markør ved skrivning. */
  gruppe: string | null;
  /** Altid længde 12; null = ingen værdi for måneden. */
  maanedsbeloeb: (number | null)[];
  /** Hvad der blev fordelt fra ikke-måneds-kolonner — til visning. */
  fordelinger: Fordeling[];
};

export type Skriveplan = {
  aar: string;
  raekker: SkriveplanRaekke[];
  /** Kolonner der ALDRIG kunne tolkes som en periode (type "ukendt"). */
  utolkedeKolonner: string[];
  /** Kolonner der KUNNE tolkes men blev sprunget over — årstotaler hvor
      månedsdækning fandtes (dobbelttælling), eller kolonner fra et andet år. */
  sprungetOverKolonner: string[];
  advarsler: string[];
};

// ───────────────────────── Kolonnetolkning ─────────────────────────

const KVARTAL_NAVN_RE = /^(?:q([1-4])|([1-4])\.?\s*kvartal)$/i;
const HALVAAR_NAVN_RE = /(?:^|\s)h([12])(?:\s|$)|([12])\.?\s*halvår/i;
const AAR_NAVN_RE = /^(årstotal|år\s*total|helår|total|i\s*alt|sum|ytd|year|fy\s*(?:19|20)?\d{2})$/i;

/** Årstal udledt af kolonnenavnet: fire cifre hvor som helst ("FY2024
    Actual H1" → 2024), ellers to-cifret suffiks efter separator
    ("Januar-26" → 2026, ≥50 tolkes som 19xx). */
function udledAarFraNavn(navn: string): string | null {
  const fire = navn.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  if (fire) return fire[1];
  const to = navn.match(/[\s\-/.](\d{2})$/);
  if (to) return (parseInt(to[1], 10) >= 50 ? "19" : "20") + to[1];
  return null;
}

/** Fjern evt. årssuffiks før typegenkendelse ("Q1 2026" → "Q1"). */
const udenAarSuffiks = (navn: string): string =>
  navn.trim().replace(/[\s\-/.]+(?:19|20)?\d{2}$/, "");

/**
 * Tolker kolonnenavne til perioder. Genkender måned (evt. med årssuffiks,
 * via motorens maanedsIndeks), måneds-interval ("Jan-feb" dækker to
 * måneder; typen forbliver "maaned" — det ER måneder, blot flere),
 * kvartal (Q1-Q4, "1. kvartal"), halvår (H1/H2, "1. halvår" — også inde i
 * navne som "FY2024 Actual H1"), årstotal ("Årstotal", "Total", "I alt",
 * "FY2024") og ukendt.
 */
export function tolkKolonner(kolonnenavne: string[]): Kolonneperiode[] {
  return kolonnenavne.map((navn, kolonne) => {
    const trimmet = navn.trim();
    const aar = udledAarFraNavn(trimmet);

    // Enkelt måned ("Januar", "Januar-26", "may")
    const maaned = maanedsIndeks(trimmet);
    if (maaned !== null) {
      return { kolonne, navn, type: "maaned" as const, maaneder: [maaned], aar };
    }

    // Måneds-interval ("Jan-feb", "maj/jun") — typen er "maaned" med flere
    // månedsindeks; fordeling afgøres af maaneder.length, ikke af typen.
    const dele = trimmet.split(/[-/]/).map((d) => d.trim());
    if (dele.length === 2) {
      const fra = maanedsIndeks(dele[0]);
      const til = maanedsIndeks(dele[1]);
      if (fra !== null && til !== null && til >= fra) {
        const maaneder = Array.from({ length: til - fra + 1 }, (_, i) => fra + i);
        return { kolonne, navn, type: "maaned" as const, maaneder, aar };
      }
    }

    const kerne = udenAarSuffiks(trimmet);

    const kvartal = kerne.match(KVARTAL_NAVN_RE);
    if (kvartal) {
      const q = parseInt(kvartal[1] ?? kvartal[2], 10);
      return {
        kolonne,
        navn,
        type: "kvartal" as const,
        maaneder: [3 * (q - 1), 3 * (q - 1) + 1, 3 * (q - 1) + 2],
        aar,
      };
    }

    const halvaar = trimmet.match(HALVAAR_NAVN_RE);
    if (halvaar) {
      const h = parseInt(halvaar[1] ?? halvaar[2], 10);
      return {
        kolonne,
        navn,
        type: "halvaar" as const,
        maaneder: h === 1 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11],
        aar,
      };
    }

    if (AAR_NAVN_RE.test(trimmet)) {
      return {
        kolonne,
        navn,
        type: "aar" as const,
        maaneder: Array.from({ length: 12 }, (_, i) => i),
        aar,
      };
    }

    return { kolonne, navn, type: "ukendt" as const, maaneder: [], aar: null };
  });
}

/** Alle distinkte år kolonnerne bærer, sorteret; tom liste uden årsudledning. */
export function udledAar(kolonner: Kolonneperiode[]): string[] {
  return [...new Set(kolonner.map((k) => k.aar).filter((a): a is string => a !== null))].sort();
}

// ───────────────────────── Skriveplan ─────────────────────────

const slug = (etiket: string): string =>
  etiket
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

/**
 * Bygger skriveplanen for ét år ud af et godkendt gitter. Kun medtagne
 * rækker; kun kolonner hvis udledte år matcher (eller alle, når intet år
 * kunne udledes af nogen kolonne). Månedskolonner skrives direkte;
 * kvartal/halvår/interval fordeles ligeligt og registreres; årstotaler
 * bruges kun når rækken ellers ingen månedsdækning har.
 */
export function byggSkriveplan(gitter: Gitter, aar: string): Skriveplan {
  const kolonner = tolkKolonner(gitter.kolonner);
  const aarFundet = udledAar(kolonner);
  const advarsler: string[] = [];
  const utolkede = new Set<string>();
  const sprungetOver = new Set<string>();
  const alleKolonnerUkendte =
    kolonner.length > 0 && kolonner.every((k) => k.type === "ukendt");

  // Årsfilter: har INGEN kolonne et år, gælder alle kolonner.
  const relevante = kolonner.filter((k) =>
    aarFundet.length === 0 ? true : k.aar === aar,
  );
  for (const k of kolonner) {
    if (k.type === "ukendt") utolkede.add(k.navn);
    else if (aarFundet.length > 0 && k.aar !== aar) sprungetOver.add(k.navn);
  }

  const maanedsKolonner = relevante.filter((k) => k.type !== "aar" && k.type !== "ukendt");
  const aarsKolonner = relevante.filter((k) => k.type === "aar");

  const raekker: SkriveplanRaekke[] = [];
  let udeladteUdenTal = 0;
  let udeladteUtolkede = 0;
  let fordelteBeloeb = 0;

  for (const raekke of gitter.raekker) {
    if (!raekke.medtag) continue;

    const maanedsbeloeb: (number | null)[] = Array.from({ length: 12 }, () => null);
    const fordelinger: Fordeling[] = [];

    for (const kolonne of maanedsKolonner) {
      const vaerdi = raekke.vaerdier[kolonne.kolonne];
      if (vaerdi === null || vaerdi === undefined) continue;
      if (kolonne.maaneder.length === 1) {
        maanedsbeloeb[kolonne.maaneder[0]] = vaerdi;
      } else {
        // Ligelig fordeling — registreres så medlemmet kan se hvad der skete.
        const prMaaned = vaerdi / kolonne.maaneder.length;
        for (const m of kolonne.maaneder) {
          maanedsbeloeb[m] = (maanedsbeloeb[m] ?? 0) + prMaaned;
        }
        fordelinger.push({
          kolonne: kolonne.kolonne,
          kolonnenavn: kolonne.navn,
          maaneder: [...kolonne.maaneder],
          beloebPrMaaned: prMaaned,
        });
        fordelteBeloeb++;
      }
    }

    const harMaanedsdaekning = maanedsbeloeb.some((v) => v !== null);
    for (const kolonne of aarsKolonner) {
      const vaerdi = raekke.vaerdier[kolonne.kolonne];
      if (vaerdi === null || vaerdi === undefined) continue;
      if (harMaanedsdaekning) {
        // Årstotal oven i måneder ville dobbelttælle — springes over.
        sprungetOver.add(kolonne.navn);
        continue;
      }
      const prMaaned = vaerdi / 12;
      for (const m of kolonne.maaneder) {
        maanedsbeloeb[m] = (maanedsbeloeb[m] ?? 0) + prMaaned;
      }
      fordelinger.push({
        kolonne: kolonne.kolonne,
        kolonnenavn: kolonne.navn,
        maaneder: [...kolonne.maaneder],
        beloebPrMaaned: prMaaned,
      });
      fordelteBeloeb++;
      break; // én årstotal er nok — flere ville også dobbelttælle
    }

    if (!maanedsbeloeb.some((v) => v !== null)) {
      // Skeln: havde rækken slet ingen værdier, eller havde den værdier i
      // kolonner der ikke kunne tolkes som perioder? Beskederne er forskellige.
      if (raekke.vaerdier.some((v) => v !== null)) udeladteUtolkede++;
      else udeladteUdenTal++;
      continue;
    }

    raekker.push({
      noegle: `import_${slug(raekke.etiket) || "linje"}_${raekke.raekkeIndex}`,
      etiket: raekke.etiket,
      gruppe: raekke.sektion,
      maanedsbeloeb,
      fordelinger,
    });
  }

  if (alleKolonnerUkendte) {
    advarsler.push(
      "Ingen af kolonnerne kunne læses som en periode. Tjek at månederne står som kolonner.",
    );
  } else {
    if (fordelteBeloeb > 0) {
      advarsler.push(
        `${fordelteBeloeb} beløb blev fordelt ligeligt på måneder fra kvartals-, halvårs-, interval- eller totalkolonner`,
      );
    }
    if (udeladteUdenTal > 0) {
      advarsler.push(
        `${udeladteUdenTal} linje${udeladteUdenTal === 1 ? "" : "r"} uden tal blev udeladt af planen`,
      );
    }
    if (udeladteUtolkede > 0) {
      advarsler.push(
        `${udeladteUtolkede} linje${udeladteUtolkede === 1 ? "" : "r"} havde kun værdier i kolonner der ikke kunne læses som perioder og blev udeladt`,
      );
    }
  }

  return {
    aar,
    raekker,
    utolkedeKolonner: [...utolkede],
    sprungetOverKolonner: [...sprungetOver],
    advarsler,
  };
}
