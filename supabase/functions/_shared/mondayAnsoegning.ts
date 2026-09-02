/**
 * Ansøgningsboardet på Monday — kolonne-id'er og de rene læsere.
 *
 * HVORFOR DEN FINDES: monday-webhook læste ét kolonne-id, `e_mail`, som
 * ikke findes på et eneste af de 50 boards API'et returnerer (målt 2/9).
 * Monday fejler ikke på et ukendt id — den udelader det fra svaret — så
 * opslaget gav undefined, og webhooken svarede { skipped: true,
 * reason: "no_contact_email" } med 200 for hver eneste ansøgning.
 * Kolonne-id'erne skal derfor stå ét sted, målt og navngivet, og
 * læsningen skal være ren, så den kan testes uden Monday.
 *
 * KØRES I HÅNDEN: deno test supabase/functions/_shared/mondayAnsoegning_test.ts
 */

/** «Ansøgninger» — det board webhooken er sat op på. */
export const ANSOEGNINGER_BOARD_ID = 1899777797;

/**
 * Kolonne-id'er på «Ansøgninger» (board 1899777797), målt 2/9 via Monday
 * API. Id'et er nøglen; titlen står kun til læseren.
 *
 * FÆLDE: `short_text` hedder «Fornavn» på Ansøgninger, men «Kontaktperson»
 * på Legat-ansøgninger — samme id, forskellig titel og betydning på to
 * boards. Id'erne her gælder KUN Ansøgninger; derfor tjekker webhooken
 * boardId før den læser noget.
 */
export const ANSOEGNING_KOLONNER = {
  email: "email", //                 Email                    (email)
  fornavn: "short_text", //          Fornavn                  (text) — «Kontaktperson» på Legat!
  efternavn: "text_mm2wy52n", //     Efternavn                (text)
  cvr: "short_text8", //             CVR nr.                  (text)
  telefon: "telefon", //             Telefon                  (phone)
  hjemmeside: "link", //             Hjemmeside               (link)
  branche: "text_mkpn786t", //       Branche                  (text)
  adresse: "short_text1", //         Firma-adresse            (text)
  postnummer: "text_mkpvrqfx", //    Postnummer               (text)
  by: "text_mkptsa87", //            By                       (text)
  aarligOmsaetning: "numeric_mkytd9ja", // Årlig omsætning    (numbers)
  omsaetningsinterval: "dropdown_mm0pacdk", // Omsætning (interval) (dropdown)
  nuvaerendeSituation: "long_text_mkwbgybz", // Nuværende situation (long_text)
  maal: "long_text_mkwbmfcr", //     Mål med virksomhed       (long_text)
  hjaelp: "long_text0", //           Beskriv hvilken hjælp…   (long_text)
  ansoegningsdato: "date_mkrz8rzw", // Ansøgningsdato         (date)
  prisKontrakt: "text_mm2wjseq", //  Pris (kontrakt)          (text)
  status: "color_mkpt4hyt", //       Status                   (status)
} as const;

/** Alle id'er som liste — til column_values(ids: [...]) i GraphQL-kaldet. */
export const ANSOEGNING_KOLONNE_IDS: readonly string[] = Object.values(ANSOEGNING_KOLONNER);

/** Én række fra Mondays column_values: id, den viste tekst og den rå JSON-værdi. */
export interface MondayKolonneVaerdi {
  id: string;
  text: string | null;
  value: string | null;
}

/** Felterne som webhooken bruger dem — alle trimmede strenge eller null. */
export interface AnsoegningsFelter {
  email: string | null;
  fornavn: string | null;
  efternavn: string | null;
  cvr: string | null;
  telefon: string | null;
  hjemmeside: string | null;
  branche: string | null;
  adresse: string | null;
  postnummer: string | null;
  by: string | null;
  aarligOmsaetning: number | null;
  omsaetningsinterval: string | null;
  nuvaerendeSituation: string | null;
  maal: string | null;
  hjaelp: string | null;
  ansoegningsdato: string | null;
  prisKontraktTekst: string | null;
}

function tekst(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

function parseVaerdi(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Læser ansøgningens felter ud af Mondays column_values. Ukendte id'er
 * ignoreres; manglende id'er giver null — Monday udelader ukendte id'er
 * frem for at fejle, og det må ikke vælte læsningen.
 *
 * Email, telefon og link bærer den rene værdi i `value` (JSON) og en
 * visningstekst i `text`; den rå værdi foretrækkes, teksten er fallback.
 */
export function laesAnsoegningsFelter(kolonner: MondayKolonneVaerdi[]): AnsoegningsFelter {
  const pr = new Map<string, MondayKolonneVaerdi>();
  for (const k of kolonner) pr.set(k.id, k);
  const t = (id: string) => tekst(pr.get(id)?.text);
  const v = (id: string) => parseVaerdi(pr.get(id)?.value);

  const K = ANSOEGNING_KOLONNER;

  const emailV = v(K.email);
  const email = tekst(typeof emailV?.email === "string" ? (emailV.email as string) : null) ?? t(K.email);

  const telefonV = v(K.telefon);
  const telefon = tekst(typeof telefonV?.phone === "string" ? (telefonV.phone as string) : null) ?? t(K.telefon);

  const linkV = v(K.hjemmeside);
  const hjemmeside = tekst(typeof linkV?.url === "string" ? (linkV.url as string) : null) ?? t(K.hjemmeside);

  const omsText = t(K.aarligOmsaetning);
  const oms = omsText ? Number(omsText.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) : NaN;

  return {
    email: email ? email.toLowerCase() : null,
    fornavn: t(K.fornavn),
    efternavn: t(K.efternavn),
    cvr: t(K.cvr)?.replace(/\s/g, "") ?? null,
    telefon,
    hjemmeside,
    branche: t(K.branche),
    adresse: t(K.adresse),
    postnummer: t(K.postnummer),
    by: t(K.by),
    aarligOmsaetning: Number.isFinite(oms) ? oms : null,
    omsaetningsinterval: t(K.omsaetningsinterval),
    nuvaerendeSituation: t(K.nuvaerendeSituation),
    maal: t(K.maal),
    hjaelp: t(K.hjaelp),
    ansoegningsdato: t(K.ansoegningsdato),
    prisKontraktTekst: t(K.prisKontrakt),
  };
}

/**
 * «Fornavn Efternavn» trimmet; null når begge er tomme. Aldrig et
 * hængende mellemrum når kun det ene findes.
 */
export function bygKontaktnavn(fornavn: string | null | undefined, efternavn: string | null | undefined): string | null {
  const navn = [fornavn, efternavn]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return navn || null;
}

/**
 * «Pris (kontrakt)» er en tekstkolonne. Skrives af mennesker: «40.000»,
 * «40000», «50.000 kr», «50.000,00 kr.», «kr. 40.000». Alle skal give
 * hele kroner × 100. Decimaler efter komma smides væk (kontraktprisen er
 * hele kroner). Kan resten ikke læses som et positivt heltal, er svaret
 * null — og virksomheden oprettes så UDEN pris (§17), hvorefter
 * rådgiveren får besked. Aldrig et gæt.
 */
export function parsePrisKontraktOere(tekstVaerdi: string | null | undefined): number | null {
  const raa = (tekstVaerdi ?? "").trim();
  if (!raa) return null;
  let s = raa.toLowerCase();
  s = s.replace(/dkk|kr\.?/g, "");
  s = s.replace(/\s/g, "");
  // Decimaldelen: «40.000,00» → «40.000»; «40000,5» → «40000»
  const komma = s.indexOf(",");
  if (komma >= 0) s = s.slice(0, komma);
  s = s.replace(/\./g, "");
  if (!/^\d+$/.test(s)) return null;
  const kr = Number(s);
  if (!Number.isFinite(kr) || kr <= 0) return null;
  return kr * 100;
}

/**
 * Statusteksten fra webhook-eventets value — Monday sender den i flere
 * former afhængigt af eventtype ({ label: { text } }, { label: "…" },
 * { text }, eller en streng). Ordret samme opløsning som den gamle
 * webhook brugte.
 */
export function laesStatusTekst(columnValue: unknown): string {
  try {
    const parsed = typeof columnValue === "string" ? JSON.parse(columnValue) : columnValue;
    const p = parsed as Record<string, unknown> | null | undefined;
    const label = p?.label as Record<string, unknown> | string | undefined;
    if (label && typeof label === "object" && typeof label.text === "string") return label.text;
    if (typeof label === "string") return label;
    if (typeof p?.text === "string") return p.text;
    return String(parsed ?? "");
  } catch {
    return String(columnValue ?? "");
  }
}
