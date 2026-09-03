/**
 * supabase/functions/_shared/berigelse.ts
 *
 * Den RENE del af engangs-berigelsen (berig-virksomheder, 3/9): givet en
 * virksomhedsrække, et CVR-svar (eller intet) og medlemmets mail, hvilke
 * tomme felter kan udfyldes, og hvilke kan ikke — og hvorfor. Ingen IO,
 * ingen Deno; eneste import er branchemotoren (som virksomhedsraekke.ts),
 * så planen kan testes i src/lib/__tests__/berigelse.test.ts.
 *
 * REGLEN (besluttet 3/9, samme som #556 og #560): der udfyldes KUN hvor
 * feltet er tomt. Der overskrives aldrig noget nogen har skrevet.
 *   - address / postal_code / city: fra CVR-svaret.
 *   - industry_code: motorens oversættelse af DB25-koden (CVR-svaret,
 *     ellers den kode der ligger i application_context.raw_cvr_data).
 *   - industry_label: CVR's tekst, ellers motorens label — samme
 *     rækkefølge som byggVirksomhedsRaekke.
 *   - contact_email: virksomhedens MEDLEM (ejeren), ikke CVR's officielle
 *     info@/kontakt@ — feltet skal bære et menneske der læser mailen.
 *     Kalderen slår medlemmet op og giver mailen eller en grund.
 *
 * UNDTAGELSEN: en REGISTERKODE i industry_code (rene cifre, fx 439100)
 * er en fejl — kolonnen bærer app-taksonomien og er nøgle til
 * industry_benchmarks, så en registerkode giver nul benchmarks. Den
 * erstattes KUN hvis motoren rammer; rammer den ikke, står den urørt og
 * bogføres. Målt 3/9: WESDEX (439100) og Two Socks (563020).
 *
 * IDEMPOTENT af konstruktion: planen regnes af rækkens NUVÆRENDE værdier,
 * så en gentagelse på en udfyldt række giver en tom opdatering.
 */

import { udledBranchekode } from "./branchekode.ts";

export type BerigelsesFelt =
  | "address"
  | "postal_code"
  | "city"
  | "industry_code"
  | "industry_label"
  | "contact_email";

export const BERIGELSES_FELTER: readonly BerigelsesFelt[] = [
  "address",
  "postal_code",
  "city",
  "industry_code",
  "industry_label",
  "contact_email",
];

/** Det af companies-rækken planen læser. */
export interface BerigelsesVirksomhed {
  id: string;
  name: string;
  cvr_number: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  industry_code: string | null;
  industry_label: string | null;
  contact_email: string | null;
  /** application_context.raw_cvr_data.industry_code — DB25-koden gemt ved oprettelsen, hvis den findes. */
  raw_industry_code?: string | null;
}

/** Det af cvrapi-svaret planen læser (samme feltnavne som CvrSvar). */
export interface BerigelsesCvrSvar {
  industry_code?: string;
  industry_label?: string;
  address?: string;
  zipcode?: string;
  city?: string;
}

/** Medlemmets mail — eller grunden til at der ingen er. */
export type MedlemsEmail =
  | { email: string }
  | { email: null; grund: "ingen_medlemmer" | "flere_medlemmer_ingen_ejer" | "medlem_uden_mail" };

export interface BerigelsesPlan {
  /** Det der skrives — KUN felter der var tomme (eller en registerkode i industry_code). */
  opdatering: Partial<Record<BerigelsesFelt, string>>;
  /** Tomme felter der IKKE kunne udfyldes, med grund. */
  sprunget_over: { felt: BerigelsesFelt; grund: string }[];
  /** true = et CVR-opslag ville kunne udfylde noget (kalderen bruger det til at spare kvoten). */
  kraever_cvr: boolean;
}

const CVR_FORMAT = /^\d{8}$/;

/** Otte cifre — det eneste format hentCvrData slår op på. */
export function harCvr(v: Pick<BerigelsesVirksomhed, "cvr_number">): boolean {
  return CVR_FORMAT.test((v.cvr_number ?? "").trim());
}

/** Trimmet tekst, eller null når tom — en tom streng er også «tom». */
function tekst(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/**
 * En registerkode i industry_code: rene cifre. DB25 har seks cifre;
 * fem tillades, fordi cvrapi's talfelt taber et foranstillet nul (samme
 * regel som motorens normalisering).
 */
export function erRegisterkode(v: string | null | undefined): boolean {
  return /^\d{5,6}$/.test((v ?? "").trim());
}

/**
 * Hvilke felter et CVR-opslag KUNNE udfylde på rækken — uafhængigt af om
 * der er et svar. Bruges i tørkørslen til at tælle opslag, og i den
 * rigtige kørsel til kun at slå op hvor det nytter.
 */
export function felterDerKraeverCvr(v: BerigelsesVirksomhed): BerigelsesFelt[] {
  const felter: BerigelsesFelt[] = [];
  if (!tekst(v.address)) felter.push("address");
  if (!tekst(v.postal_code)) felter.push("postal_code");
  if (!tekst(v.city)) felter.push("city");
  // Branchen kan udledes af raw_cvr_data uden opslag — kun når den heller
  // ikke findes dér, kræver branchen et opslag.
  const brancheMangler = !tekst(v.industry_code) || erRegisterkode(v.industry_code);
  if (brancheMangler && !tekst(v.raw_industry_code)) felter.push("industry_code");
  if (!tekst(v.industry_label) && !tekst(v.raw_industry_code)) felter.push("industry_label");
  return felter;
}

export function beregnBerigelse(
  v: BerigelsesVirksomhed,
  cvr: BerigelsesCvrSvar | null,
  medlem: MedlemsEmail | null,
): BerigelsesPlan {
  const opdatering: BerigelsesPlan["opdatering"] = {};
  const sprunget_over: BerigelsesPlan["sprunget_over"] = [];
  const cvrKendt = harCvr(v);
  const ingenSvarGrund = !cvrKendt
    ? "intet CVR-nummer"
    : cvr
      ? "CVR-svaret bærer ikke feltet"
      : "kræver CVR-opslag";

  // ── Adressen: kun tomme felter, fra CVR ──
  const adresseFelter: [BerigelsesFelt, string | null | undefined, string | null | undefined][] = [
    ["address", v.address, cvr?.address],
    ["postal_code", v.postal_code, cvr?.zipcode],
    ["city", v.city, cvr?.city],
  ];
  for (const [felt, nuvaerende, fraCvr] of adresseFelter) {
    if (tekst(nuvaerende)) continue;
    const ny = tekst(fraCvr);
    if (ny) opdatering[felt] = ny;
    else sprunget_over.push({ felt, grund: ingenSvarGrund });
  }

  // ── Branchen: DB25-koden fra svaret, ellers fra raw_cvr_data ──
  const db25 = tekst(cvr?.industry_code) ?? tekst(v.raw_industry_code);
  const kodeTom = !tekst(v.industry_code);
  const kodeErRegister = !kodeTom && erRegisterkode(v.industry_code);
  const branche = db25 ? udledBranchekode(db25) : null;

  if (kodeTom || kodeErRegister) {
    if (!db25) {
      sprunget_over.push({
        felt: "industry_code",
        grund: !cvrKendt
          ? "intet CVR-nummer og ingen DB25-kode i raw_cvr_data"
          : cvr
            ? "hverken CVR-svaret eller raw_cvr_data bærer en DB25-kode"
            : "ingen DB25-kode i raw_cvr_data — kræver CVR-opslag",
      });
    } else if (!branche) {
      sprunget_over.push({
        felt: "industry_code",
        grund: `motoren rammer ikke DB25-koden ${db25}${kodeErRegister ? ` — registerkoden ${v.industry_code} står urørt` : ""}`,
      });
    } else if (kodeErRegister && branche.industry_code === (v.industry_code ?? "").trim()) {
      // Kan ikke ske (taksonomiens nøgler er ikke cifre), men koster intet at værne.
    } else {
      opdatering.industry_code = branche.industry_code;
    }
  }

  // ── Labelen: KUN når tom. CVR's tekst først, så motorens (som rækkebyggeren) ──
  if (!tekst(v.industry_label)) {
    const label = tekst(cvr?.industry_label) ?? branche?.industry_label ?? null;
    if (label) opdatering.industry_label = label;
    else {
      sprunget_over.push({
        felt: "industry_label",
        grund: db25 ? `hverken CVR-tekst eller motor-label for ${db25}` : ingenSvarGrund,
      });
    }
  }

  // ── contact_email: medlemmet, aldrig CVR ──
  if (!tekst(v.contact_email)) {
    const email = medlem !== null && medlem.email !== null ? tekst(medlem.email) : null;
    if (email) opdatering.contact_email = email.toLowerCase();
    else {
      // "grund" in medlem frem for medlem.email === null: app-tsconfig'en
      // kører uden strictNullChecks, og dér indsnævrer null-tjekket ikke.
      let grund = "medlem ikke slået op";
      if (medlem !== null && "grund" in medlem) {
        grund = {
          ingen_medlemmer: "ingen medlemmer på virksomheden",
          flere_medlemmer_ingen_ejer: "flere medlemmer, ingen med rollen owner",
          medlem_uden_mail: "medlemmet har ingen mail",
        }[medlem.grund];
      } else if (medlem !== null) {
        grund = "medlemmet har ingen mail";
      }
      sprunget_over.push({ felt: "contact_email", grund });
    }
  }

  return {
    opdatering,
    sprunget_over,
    kraever_cvr: cvrKendt && felterDerKraeverCvr(v).length > 0,
  };
}
